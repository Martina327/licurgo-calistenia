-- =====================================================================
--  B1 · Armado de rutinas (CU09) — guardar_rutina()
--  Correr en el SQL Editor de Supabase sobre el esquema v2 ya cargado.
--  (Ya incluido en supabase/schema.sql, sección 14.10.)
--
--  Guarda la rutina completa (cabecera + días + ítems) en UNA transacción,
--  así nunca queda una rutina a medio guardar si falla un ítem.
--
--    p_rutina_id NULL  → rutina nueva: archiva la activa (activa = false,
--                        queda como historial) y crea otra.
--    p_rutina_id dado  → edita esa rutina activa: reemplaza días e ítems.
--
--  p_dias (JSONB), en el orden en que se muestran:
--    [ { "nombre": "Tracción + Core",
--        "items": [ { "ejercicio_id": "…", "bloque": "Fuerza", "series": 4,
--                     "repeticiones": "8", "descanso_seg": 90, "nota": "…" } ] } ]
--  El número de día y el orden de los ítems los calcula la función
--  (Día 1..n; ítems ordenados por bloque y luego por posición).
--
--  Desde React:
--    supabase.rpc('guardar_rutina', { p_alumno_id, p_nombre, p_objetivo, p_dias, p_rutina_id })
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guardar_rutina(
    p_alumno_id UUID, p_nombre TEXT, p_objetivo TEXT, p_dias JSONB, p_rutina_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rutina UUID;
    v_dia    RECORD;
    v_dia_id UUID;
BEGIN
    PERFORM public._exigir_rol('{Coach,SuperAdmin}');

    -- Bloquea al alumno: dos coaches guardando a la vez se ejecutan en fila
    PERFORM 1 FROM public.alumnos a JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE a.usuario_id = p_alumno_id AND u.activo
       FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;

    IF coalesce(trim(p_nombre), '') = '' THEN
        RAISE EXCEPTION 'RUTINA_INVALIDA: la rutina necesita un nombre';
    END IF;
    IF jsonb_typeof(p_dias) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_dias) NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'RUTINA_SIN_DIAS: la rutina debe tener entre 1 y 7 días';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_dias) d
                WHERE jsonb_typeof(d->'items') IS DISTINCT FROM 'array'
                   OR jsonb_array_length(d->'items') = 0) THEN
        RAISE EXCEPTION 'DIA_VACIO: cada día necesita al menos un ejercicio';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_dias) d, jsonb_array_elements(d->'items') i
                WHERE coalesce(i->>'ejercicio_id', '') = ''
                   OR coalesce(trim(i->>'repeticiones'), '') = ''
                   OR coalesce((i->>'series')::int, 0) < 1) THEN
        RAISE EXCEPTION 'RUTINA_INVALIDA: cada ejercicio necesita ejercicio, series y repeticiones';
    END IF;

    IF p_rutina_id IS NULL THEN
        UPDATE public.rutinas SET activa = false WHERE alumno_id = p_alumno_id AND activa;
        INSERT INTO public.rutinas (alumno_id, coach_id, nombre, objetivo)
        VALUES (p_alumno_id, auth.uid(), trim(p_nombre), nullif(trim(p_objetivo), ''))
        RETURNING id INTO v_rutina;
    ELSE
        UPDATE public.rutinas
           SET nombre = trim(p_nombre), objetivo = nullif(trim(p_objetivo), ''), coach_id = auth.uid()
         WHERE id = p_rutina_id AND alumno_id = p_alumno_id AND activa
        RETURNING id INTO v_rutina;
        IF v_rutina IS NULL THEN
            RAISE EXCEPTION 'RUTINA_NO_ENCONTRADA: la rutina ya no está activa; recargá la pantalla';
        END IF;
        DELETE FROM public.rutina_dias WHERE rutina_id = v_rutina;   -- los ítems caen por CASCADE
    END IF;

    FOR v_dia IN SELECT d.value AS dia, d.ordinality::smallint AS numero
                   FROM jsonb_array_elements(p_dias) WITH ORDINALITY d
    LOOP
        INSERT INTO public.rutina_dias (rutina_id, numero_dia, nombre)
        VALUES (v_rutina, v_dia.numero, nullif(trim(v_dia.dia->>'nombre'), ''))
        RETURNING id INTO v_dia_id;

        INSERT INTO public.rutina_items (rutina_dia_id, ejercicio_id, bloque, orden, series,
                                         repeticiones, descanso_seg, nota)
        SELECT v_dia_id,
               (i.value->>'ejercicio_id')::uuid,
               (i.value->>'bloque')::public.bloque_ejercicio,
               row_number() OVER (ORDER BY (i.value->>'bloque')::public.bloque_ejercicio, i.ordinality),
               (i.value->>'series')::smallint,
               trim(i.value->>'repeticiones'),
               nullif(i.value->>'descanso_seg', '')::smallint,
               nullif(trim(i.value->>'nota'), '')
          FROM jsonb_array_elements(v_dia.dia->'items') WITH ORDINALITY i;
    END LOOP;

    RETURN v_rutina;
END $$;

REVOKE EXECUTE ON FUNCTION public.guardar_rutina(UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_rutina(UUID, TEXT, TEXT, JSONB, UUID) TO authenticated;
