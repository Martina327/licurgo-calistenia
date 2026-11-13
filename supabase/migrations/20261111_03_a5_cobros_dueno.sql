-- =====================================================================
--  A5 · Caja de recepción y cobros del dueño · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_02.
--  Es re-ejecutable.
--
--  Decisión del equipo (11/11/2026):
--    · La CAJA (turno, kiosco, arqueo) es solo de las RECEPCIONISTAS.
--    · El DUEÑO no abre turno, pero a veces le pagan directo a él:
--      puede anotar cobros de CUOTA (efectivo o transferencia) y de
--      SUBALQUILER (efectivo o transferencia). Ese efectivo queda
--      registrado SIN turno: no altera el cierre de ninguna recepcionista.
--    · KIOSCO: solo recepcionistas (siempre dentro de un turno).
--    · Cuota por transferencia anotada a mano: solo el dueño. Las de los
--      alumnos siguen por el flujo de comprobantes (B4/B5).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Efectivo sin turno permitido (cobros del dueño)
--    Antes: efectivo ⇔ turno. Ahora: la transferencia nunca tiene turno;
--    el efectivo puede no tenerlo. Las funciones controlan quién.
-- ---------------------------------------------------------------------
ALTER TABLE public.ingresos DROP CONSTRAINT IF EXISTS chk_caja;
ALTER TABLE public.ingresos ADD  CONSTRAINT chk_caja CHECK (medio_pago = 'Efectivo' OR turno_id IS NULL);


-- ---------------------------------------------------------------------
-- 2. Turno de la recepcionista. El dueño no tiene caja: devuelve NULL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._turno_abierto() RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    IF public.mi_rol() = 'SuperAdmin' THEN
        RETURN NULL;   -- cobro del dueño, fuera de la caja
    END IF;
    SELECT id INTO v_id FROM public.turnos_caja
     WHERE usuario_id = auth.uid() AND cerrado_at IS NULL;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'SIN_TURNO_ABIERTO: abrí un turno de caja para cobrar en efectivo';
    END IF;
    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
-- 3. Abrir, cerrar y justificar el turno: solo recepcionistas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abrir_turno(p_monto_inicial NUMERIC DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
    IF EXISTS (SELECT 1 FROM public.turnos_caja WHERE usuario_id = auth.uid() AND cerrado_at IS NULL) THEN
        RAISE EXCEPTION 'TURNO_YA_ABIERTO';
    END IF;
    INSERT INTO public.turnos_caja (usuario_id, monto_inicial)
    VALUES (auth.uid(), coalesce(p_monto_inicial, 0))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_monto_contado NUMERIC, p_comentario TEXT DEFAULT NULL)
RETURNS TABLE (turno_id UUID, monto_inicial NUMERIC, efectivo_cobrado NUMERIC,
               monto_esperado NUMERIC, monto_contado NUMERIC, diferencia NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno   public.turnos_caja;
    v_cobrado NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
    IF p_monto_contado IS NULL OR p_monto_contado < 0 THEN
        RAISE EXCEPTION 'MONTO_CONTADO_INVALIDO';
    END IF;

    SELECT * INTO v_turno FROM public.turnos_caja t
     WHERE t.usuario_id = auth.uid() AND t.cerrado_at IS NULL
       FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO'; END IF;

    SELECT coalesce(sum(i.monto), 0) INTO v_cobrado
      FROM public.ingresos i
     WHERE i.turno_id = v_turno.id AND i.medio_pago = 'Efectivo';

    UPDATE public.turnos_caja t
       SET cerrado_at     = now(),
           monto_contado  = p_monto_contado,
           monto_esperado = v_turno.monto_inicial + v_cobrado,
           comentario     = nullif(trim(p_comentario), '')
     WHERE t.id = v_turno.id;

    RETURN QUERY
    SELECT v_turno.id, v_turno.monto_inicial, v_cobrado,
           v_turno.monto_inicial + v_cobrado, p_monto_contado,
           p_monto_contado - (v_turno.monto_inicial + v_cobrado);
END $$;

CREATE OR REPLACE FUNCTION public.justificar_cierre(p_turno_id UUID, p_comentario TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
    UPDATE public.turnos_caja
       SET comentario = trim(p_comentario)
     WHERE id = p_turno_id
       AND usuario_id = auth.uid()
       AND cerrado_at IS NOT NULL
       AND diferencia <> 0
       AND comentario IS NULL
       AND coalesce(trim(p_comentario), '') <> '';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_SE_PUEDE_JUSTIFICAR: turno inexistente, sin diferencia o ya justificado';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 4. Kiosco: solo recepcionistas (misma lógica que antes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_venta(p_items JSONB, p_medio public.medio_pago)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno UUID;
    v_venta UUID;
    v_total NUMERIC := 0;
    v_prod  public.productos;
    it      RECORD;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'VENTA_VACIA';
    END IF;
    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;

    INSERT INTO public.ventas (vendedor_id, medio_pago, turno_id)
    VALUES (auth.uid(), p_medio, v_turno)
    RETURNING id INTO v_venta;

    FOR it IN
        SELECT (e->>'producto_id')::uuid AS producto_id, (e->>'cantidad')::int AS cantidad
          FROM jsonb_array_elements(p_items) e
    LOOP
        IF it.cantidad IS NULL OR it.cantidad <= 0 THEN
            RAISE EXCEPTION 'CANTIDAD_INVALIDA';
        END IF;
        UPDATE public.productos
           SET stock = stock - it.cantidad
         WHERE id = it.producto_id AND activo AND stock >= it.cantidad
        RETURNING * INTO v_prod;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE: producto %', it.producto_id;
        END IF;
        INSERT INTO public.venta_items (venta_id, producto_id, cantidad, precio_unitario)
        VALUES (v_venta, it.producto_id, it.cantidad, v_prod.precio);
        v_total := v_total + v_prod.precio * it.cantidad;
    END LOOP;

    UPDATE public.ventas SET total = v_total WHERE id = v_venta;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, venta_id, turno_id, registrado_por)
    VALUES ('Kiosco', p_medio, v_total, v_venta, v_turno, auth.uid());

    RETURN v_venta;
END $$;


-- ---------------------------------------------------------------------
-- 5. Cobro de cuota con medio de pago
--    Efectivo: recepcionista (con turno) o dueño (sin turno).
--    Transferencia anotada a mano: solo el dueño.
--    registrar_pago_efectivo queda como atajo (la usa la pantalla de A2).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pago_cuota(p_alumno_id UUID, p_medio public.medio_pago)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rol    public.rol_usuario;
    v_turno  UUID;
    v_precio NUMERIC;
BEGIN
    v_rol := public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF p_medio = 'Transferencia' AND v_rol <> 'SuperAdmin' THEN
        RAISE EXCEPTION 'PERMISO_DENEGADO: las transferencias de cuota las registra el dueño o entran por comprobante'
              USING ERRCODE = '42501';
    END IF;
    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;

    SELECT p.precio INTO v_precio
      FROM public.alumnos a JOIN public.planes p ON p.id = a.plan_id
     WHERE a.usuario_id = p_alumno_id;
    IF v_precio IS NULL THEN
        RAISE EXCEPTION 'SIN_PLAN: el alumno no tiene un plan asignado';
    END IF;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, turno_id, registrado_por, detalle)
    VALUES ('Cuota', p_medio, v_precio, p_alumno_id, v_turno, auth.uid(),
            'Cuota - ' || p_medio || CASE WHEN v_rol = 'SuperAdmin' THEN ' (cobrada por el dueño)' ELSE '' END);

    RETURN public._extender_membresia(p_alumno_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuota(UUID, public.medio_pago) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_pago_cuota(UUID, public.medio_pago) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_pago_efectivo(p_alumno_id UUID)
RETURNS date
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT public.registrar_pago_cuota(p_alumno_id, 'Efectivo')
$$;


-- ---------------------------------------------------------------------
-- 6. Turnos que el dueño haya abierto en las pruebas: se cierran sin arqueo
-- ---------------------------------------------------------------------
UPDATE public.turnos_caja t
   SET cerrado_at = now(), monto_contado = t.monto_inicial, monto_esperado = t.monto_inicial,
       comentario = 'Cerrado por migración: el dueño no usa caja'
 WHERE t.cerrado_at IS NULL
   AND t.usuario_id IN (SELECT id FROM public.usuarios WHERE rol = 'SuperAdmin');


-- Verificación
SELECT proname FROM pg_proc WHERE proname IN ('registrar_pago_cuota', '_turno_abierto') ORDER BY 1;
