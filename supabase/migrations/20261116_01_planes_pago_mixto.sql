-- =====================================================================
--  Planes de cuota y pago mixto · Pareja B
--  Re-ejecutable. Correr después de 20261112_05.
--
--  1. Planes: el dueño arma distintas cuotas (ej. "Turno mañana" con
--     descuento). Se dan de baja (activo = false), no se borran: hay
--     alumnos y pagos que los usan.
--  2. El alumno elige el plan al pagar por transferencia: el comprobante
--     guarda plan_id. Al aprobarlo el alumno queda en ese plan.
--  3. cobrar_cuota: una sola operación para cobrar en el mostrador con
--     efectivo, transferencia o las dos (pago mixto). La parte por
--     transferencia sale del comprobante que subió el alumno (recepción la
--     ve con el monto que él informó). El dueño puede anotar una
--     transferencia sin comprobante, como hasta ahora.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Planes
-- ---------------------------------------------------------------------
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
    ALTER TABLE public.planes ADD CONSTRAINT planes_precio_positivo CHECK (precio > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nadie borra planes (tienen alumnos y pagos): se dan de baja
REVOKE DELETE, TRUNCATE ON public.planes FROM authenticated;


-- ---------------------------------------------------------------------
-- 2. Plan elegido en el comprobante
-- ---------------------------------------------------------------------
ALTER TABLE public.comprobantes_pago
    ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.planes(id);

-- El alumno solo puede elegir un plan activo
DROP POLICY IF EXISTS comprobantes_insert ON public.comprobantes_pago;
CREATE POLICY comprobantes_insert ON public.comprobantes_pago FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid()
                AND estado = 'Pendiente'
                AND revisado_por IS NULL AND revisado_at IS NULL AND motivo_rechazo IS NULL
                AND split_part(archivo_path, '/', 1) = auth.uid()::text
                AND (plan_id IS NULL OR EXISTS (SELECT 1 FROM public.planes p WHERE p.id = plan_id AND p.activo)));

-- Bandeja de recepción: el precio es el del plan que eligió el alumno
CREATE OR REPLACE VIEW public.v_comprobantes WITH (security_invoker = true) AS
SELECT
    c.id, c.alumno_id, c.archivo_path, c.monto_declarado, c.estado, c.motivo_rechazo,
    c.created_at, c.revisado_at,
    u.nombre, u.apellido, u.dni, u.telefono,
    a.fecha_vencimiento,
    p.precio                                         AS precio_plan,
    CASE
        WHEN a.fecha_vencimiento IS NULL                    THEN 'En clase de prueba'
        WHEN a.fecha_vencimiento < public.hoy_ar() - 30     THEN 'Inactivo'
        ELSE 'Activo'
    END                                              AS estado_alumno,
    i.monto                                          AS monto_acreditado,
    nullif(trim(coalesce(r.nombre, '') || ' ' || coalesce(r.apellido, '')), '') AS revisado_por_nombre,
    c.cuenta_destino,
    p.id                                             AS plan_id,
    p.nombre                                         AS plan
FROM public.comprobantes_pago c
JOIN public.usuarios u      ON u.id = c.alumno_id
JOIN public.alumnos  a      ON a.usuario_id = c.alumno_id
LEFT JOIN public.planes p   ON p.id = coalesce(c.plan_id, a.plan_id)
LEFT JOIN public.ingresos i ON i.comprobante_id = c.id
LEFT JOIN public.usuarios r ON r.id = c.revisado_por;

GRANT SELECT ON public.v_comprobantes TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Aprobar un comprobante: el alumno pasa al plan que eligió
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_comprobante(p_comprobante_id UUID, p_monto NUMERIC DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_comp  public.comprobantes_pago;
    v_monto NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    SELECT * INTO v_comp FROM public.comprobantes_pago WHERE id = p_comprobante_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMPROBANTE_INEXISTENTE'; END IF;
    IF v_comp.estado <> 'Pendiente' THEN
        RAISE EXCEPTION 'COMPROBANTE_YA_REVISADO: estado %', v_comp.estado;
    END IF;
    IF p_monto IS NOT NULL AND p_monto <= 0 THEN
        RAISE EXCEPTION 'MONTO_INVALIDO';
    END IF;

    IF v_comp.plan_id IS NOT NULL THEN
        UPDATE public.alumnos SET plan_id = v_comp.plan_id WHERE usuario_id = v_comp.alumno_id;
    END IF;

    SELECT coalesce(p_monto, p.precio) INTO v_monto
      FROM public.alumnos a LEFT JOIN public.planes p ON p.id = a.plan_id
     WHERE a.usuario_id = v_comp.alumno_id;
    IF v_monto IS NULL THEN
        RAISE EXCEPTION 'SIN_MONTO: el alumno no tiene plan; indicá el monto acreditado';
    END IF;

    UPDATE public.comprobantes_pago
       SET estado = 'Aprobado', revisado_por = auth.uid(), revisado_at = now()
     WHERE id = p_comprobante_id;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, comprobante_id, registrado_por, detalle)
    VALUES ('Cuota', 'Transferencia', v_monto, v_comp.alumno_id, v_comp.id, auth.uid(), 'Cuota - Transferencia');

    RETURN public._extender_membresia(v_comp.alumno_id);
END $$;


-- ---------------------------------------------------------------------
-- 4. Cobrar la cuota en el mostrador: efectivo, transferencia o mixto
--    p_efectivo + p_transferencia tiene que ser el precio del plan.
--    La transferencia viene del comprobante del alumno (p_comprobante_id);
--    sin comprobante, solo la puede anotar el dueño.
-- ---------------------------------------------------------------------
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
    ELSIF p_transferencia > 0 AND v_rol <> 'SuperAdmin' THEN
        RAISE EXCEPTION 'PERMISO_DENEGADO: la parte por transferencia sale del comprobante que sube el alumno'
              USING ERRCODE = '42501';
    END IF;

    IF p_efectivo > 0 THEN
        v_turno := public._turno_abierto();   -- recepcionista sin turno: error; dueño: NULL
    END IF;

    v_mixto := p_efectivo > 0 AND p_transferencia > 0;
    v_quien := CASE WHEN v_rol = 'SuperAdmin' THEN ' (cobrada por el dueño)' ELSE '' END;

    IF p_transferencia > 0 THEN
        IF v_comp.id IS NOT NULL THEN
            UPDATE public.comprobantes_pago
               SET estado = 'Aprobado', revisado_por = auth.uid(), revisado_at = now(), plan_id = p_plan_id
             WHERE id = v_comp.id;
        END IF;
        INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, comprobante_id, registrado_por, detalle)
        VALUES ('Cuota', 'Transferencia', p_transferencia, p_alumno_id, v_comp.id, auth.uid(),
                'Cuota ' || v_plan.nombre || ' - Transferencia' || CASE WHEN v_mixto THEN ' (pago mixto)' ELSE '' END || v_quien);
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
