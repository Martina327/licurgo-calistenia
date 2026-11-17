-- =====================================================================
--  Pago mixto también para recepción sin comprobante · Pareja B
--  Re-ejecutable. Correr después de 20261116_01.
--
--  En el mostrador el alumno suele mostrar la transferencia en su celular
--  en lugar de subir el comprobante. La recepcionista ahora puede cobrar
--  Transferencia o Mixto sin comprobante: en la app confirma que la vio y
--  el ingreso queda con el detalle "(sin comprobante, verificada por
--  recepción)" para que el dueño lo identifique en Ingresos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cobrar_cuota(
    p_alumno_id      UUID,
    p_plan_id        UUID,
    p_efectivo       NUMERIC DEFAULT 0,
    p_transferencia  NUMERIC DEFAULT 0,
    p_comprobante_id UUID DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rol    public.rol_usuario;
    v_plan   public.planes;
    v_comp   public.comprobantes_pago;
    v_turno  UUID;
    v_mixto  BOOLEAN;
    v_quien  TEXT;
    v_sin    TEXT;
BEGIN
    v_rol := public._exigir_rol('{Recepcionista,SuperAdmin}');
    p_efectivo      := coalesce(p_efectivo, 0);
    p_transferencia := coalesce(p_transferencia, 0);

    IF NOT EXISTS (SELECT 1 FROM public.alumnos WHERE usuario_id = p_alumno_id) THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;
    SELECT * INTO v_plan FROM public.planes WHERE id = p_plan_id;
    IF NOT FOUND OR NOT v_plan.activo THEN
        RAISE EXCEPTION 'PLAN_INACTIVO: elegí un plan vigente';
    END IF;
    IF p_efectivo < 0 OR p_transferencia < 0 OR p_efectivo + p_transferencia <> v_plan.precio THEN
        RAISE EXCEPTION 'SUMA_NO_COINCIDE: efectivo + transferencia tiene que dar %', v_plan.precio;
    END IF;

    -- Parte por transferencia
    IF p_comprobante_id IS NOT NULL THEN
        SELECT * INTO v_comp FROM public.comprobantes_pago WHERE id = p_comprobante_id FOR UPDATE;
        IF NOT FOUND OR v_comp.alumno_id <> p_alumno_id THEN
            RAISE EXCEPTION 'COMPROBANTE_INEXISTENTE';
        END IF;
        IF v_comp.estado <> 'Pendiente' THEN
            RAISE EXCEPTION 'COMPROBANTE_YA_REVISADO: estado %', v_comp.estado;
        END IF;
        IF p_transferencia <= 0 THEN
            RAISE EXCEPTION 'MONTO_INVALIDO';
        END IF;
    END IF;

    IF p_efectivo > 0 THEN
        v_turno := public._turno_abierto();   -- recepcionista sin turno: error; dueño: NULL
    END IF;

    v_mixto := p_efectivo > 0 AND p_transferencia > 0;
    v_quien := CASE WHEN v_rol = 'SuperAdmin' THEN ' (cobrada por el dueño)' ELSE '' END;
    v_sin   := CASE WHEN v_comp.id IS NULL AND v_rol <> 'SuperAdmin' THEN ' (sin comprobante, verificada por recepción)' ELSE '' END;

    IF p_transferencia > 0 THEN
        IF v_comp.id IS NOT NULL THEN
            UPDATE public.comprobantes_pago
               SET estado = 'Aprobado', revisado_por = auth.uid(), revisado_at = now(), plan_id = p_plan_id
             WHERE id = v_comp.id;
        END IF;
        INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, comprobante_id, registrado_por, detalle)
        VALUES ('Cuota', 'Transferencia', p_transferencia, p_alumno_id, v_comp.id, auth.uid(),
                'Cuota ' || v_plan.nombre || ' - Transferencia' || CASE WHEN v_mixto THEN ' (pago mixto)' ELSE '' END || v_sin || v_quien);
    END IF;

    IF p_efectivo > 0 THEN
        -- (ingresos admite un solo registro por comprobante: queda en la parte por transferencia)
        INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, turno_id, registrado_por, detalle)
        VALUES ('Cuota', 'Efectivo', p_efectivo, p_alumno_id, v_turno, auth.uid(),
                'Cuota ' || v_plan.nombre || ' - Efectivo' || CASE WHEN v_mixto THEN ' (pago mixto)' ELSE '' END || v_quien);
    END IF;

    UPDATE public.alumnos SET plan_id = p_plan_id WHERE usuario_id = p_alumno_id;
    RETURN public._extender_membresia(p_alumno_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.cobrar_cuota(UUID, UUID, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cobrar_cuota(UUID, UUID, NUMERIC, NUMERIC, UUID) TO authenticated;
