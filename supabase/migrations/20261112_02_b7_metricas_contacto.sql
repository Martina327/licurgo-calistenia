-- =====================================================================
--  B7 · Métricas de concurrencia (CU13) y botón de contacto (RF13) · Pareja B
--  Correr DESPUÉS de 20261112_01 (datos_cobro). Es re-ejecutable.
--
--  1. metricas_concurrencia(desde, hasta): solo SuperAdmin.
--     Asistencias por día, promedio por día de la semana y mapa de franjas
--     horarias (día × hora) con el promedio de alumnos en cada franja.
--  2. WhatsApp de contacto: lo elige el dueño en "Datos de cobro";
--     si no lo cargó, se usa el celular del SuperAdmin.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Métricas de concurrencia (CU13)
--    promedio de una franja = asistencias en esa franja / cuántas veces
--    hubo ese día de la semana en el rango (ej. 4 lunes en 30 días).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.metricas_concurrencia(p_desde DATE, p_hasta DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_hasta DATE := coalesce(p_hasta, public.hoy_ar());
    v_res   JSONB;
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF p_desde IS NULL OR v_hasta < p_desde OR v_hasta - p_desde > 366 THEN
        RAISE EXCEPTION 'RANGO_INVALIDO';
    END IF;

    WITH a AS (
        SELECT fecha, fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires' AS local
          FROM public.asistencias
         WHERE fecha BETWEEN p_desde AND v_hasta
    ),
    dias AS (SELECT d::date AS fecha FROM generate_series(p_desde, v_hasta, interval '1 day') d),
    por_dia AS (
        SELECT d.fecha, count(a.fecha) AS n
          FROM dias d LEFT JOIN a ON a.fecha = d.fecha
         GROUP BY d.fecha
    ),
    veces AS (SELECT extract(isodow FROM fecha)::int AS dia, count(*) AS veces FROM dias GROUP BY 1),
    por_dow AS (SELECT extract(isodow FROM fecha)::int AS dia, count(*) AS total FROM a GROUP BY 1),
    franjas AS (
        SELECT extract(isodow FROM local)::int AS dia, extract(hour FROM local)::int AS hora, count(*) AS total
          FROM a GROUP BY 1, 2
    )
    SELECT jsonb_build_object(
        'desde', p_desde,
        'hasta', v_hasta,
        'total', (SELECT count(*) FROM a),
        'dias_con_asistencia', (SELECT count(*) FROM por_dia WHERE n > 0),
        'dias', (SELECT jsonb_agg(jsonb_build_object('fecha', fecha, 'asistencias', n) ORDER BY fecha) FROM por_dia),
        'por_dia_semana', (
            SELECT jsonb_agg(jsonb_build_object(
                       'dia', v.dia, 'veces', v.veces, 'total', coalesce(p.total, 0),
                       'promedio', round(coalesce(p.total, 0)::numeric / v.veces, 1)) ORDER BY v.dia)
              FROM veces v LEFT JOIN por_dow p ON p.dia = v.dia),
        'franjas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'dia', f.dia, 'hora', f.hora, 'total', f.total,
                       'promedio', round(f.total::numeric / v.veces, 1))), '[]'::jsonb)
              FROM franjas f JOIN veces v ON v.dia = f.dia)
    ) INTO v_res;
    RETURN v_res;
END $$;

REVOKE EXECUTE ON FUNCTION public.metricas_concurrencia(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metricas_concurrencia(DATE, DATE) TO authenticated;


-- ---------------------------------------------------------------------
-- 2. WhatsApp de contacto (RF13)
-- ---------------------------------------------------------------------
ALTER TABLE public.datos_cobro ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.datos_cobro DROP CONSTRAINT IF EXISTS datos_cobro_whatsapp_check;
ALTER TABLE public.datos_cobro ADD CONSTRAINT datos_cobro_whatsapp_check CHECK (whatsapp ~ '^[0-9]{10}$');
GRANT UPDATE (titular, banco, cbu, alias, cuit, whatsapp) ON public.datos_cobro TO authenticated;

-- El alumno no puede leer los datos del SuperAdmin (RLS de usuarios):
-- esta función le devuelve solo el número de contacto.
CREATE OR REPLACE FUNCTION public.whatsapp_contacto() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(
        (SELECT whatsapp FROM public.datos_cobro WHERE id),
        (SELECT telefono FROM public.usuarios
          WHERE rol = 'SuperAdmin' AND activo AND telefono IS NOT NULL
          ORDER BY created_at LIMIT 1));
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_contacto() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.whatsapp_contacto() TO authenticated;
