-- =====================================================================
--  A2 · Cobrar cuota en efectivo (CU06) · Pareja A
--  Regla de vencimiento para alumnos inactivos que vuelven
--
--  Correr en el SQL Editor de Supabase DESPUÉS de las migraciones de A1
--  (20261107_01 a 03). Es re-ejecutable.
--
--  Decisión del equipo (08/11/2026):
--    · Regla general (sin cambios): cada cuota suma +30 días al
--      vencimiento actual, pague antes o unos días tarde.
--    · Alumno INACTIVO (cuota vencida hace más de 30 días): los 30 días
--      cuentan desde el día que paga. Sin esto, alguien que vuelve
--      después de meses pagaría y seguiría con la cuota vencida.
--    · Primer pago: la ficha tiene que estar completa (regla de A1).
--
--  _extender_membresia la usan registrar_pago_efectivo (A2) y
--  aprobar_comprobante (CU08, Pareja B): la regla vale para los dos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._extender_membresia(p_alumno_id UUID) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actual    date;
    v_base      date;
    v_faltantes TEXT[];
    v_nuevo     date;
BEGIN
    SELECT fecha_vencimiento INTO v_actual FROM public.alumnos WHERE usuario_id = p_alumno_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;

    IF v_actual IS NULL THEN
        -- Primer pago: ficha completa y los 30 días cuentan desde hoy
        v_faltantes := public._datos_faltantes(p_alumno_id);
        IF cardinality(v_faltantes) > 0 THEN
            RAISE EXCEPTION 'FICHA_INCOMPLETA: %', array_to_string(v_faltantes, ', ');
        END IF;
        v_base := public.hoy_ar();
    ELSIF v_actual < public.hoy_ar() - 30 THEN
        -- Inactivo que vuelve: arranca de nuevo desde hoy
        v_base := public.hoy_ar();
    ELSE
        -- Activo (al día, por vencer o vencido hace 30 días o menos)
        v_base := v_actual;
    END IF;

    v_nuevo := v_base + 30;
    UPDATE public.alumnos SET fecha_vencimiento = v_nuevo WHERE usuario_id = p_alumno_id;
    RETURN v_nuevo;
END $$;

REVOKE EXECUTE ON FUNCTION public._extender_membresia(UUID) FROM PUBLIC, anon, authenticated;


-- Verificación: qué vencimiento quedaría si cada alumno pagara hoy
SELECT nombre, apellido, estado_alumno, fecha_vencimiento AS vence_hoy,
       CASE
           WHEN fecha_vencimiento IS NULL                      THEN public.hoy_ar() + 30
           WHEN fecha_vencimiento < public.hoy_ar() - 30       THEN public.hoy_ar() + 30
           ELSE fecha_vencimiento + 30
       END AS vence_si_paga_hoy
  FROM public.v_membresias ORDER BY estado_alumno, apellido;
