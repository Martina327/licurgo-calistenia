-- =====================================================================
--  B1 · Iteración 2 — bi-series
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261110_01.
--  (Ya incluido en schema.sql.)
--
--  Bi-serie: dos (o más) ejercicios seguidos del mismo bloque que se
--  hacen sin descanso entre ellos; se descansa al terminar el último.
--  Ej: dominadas + fondos.
--    · rutina_items.grupo: mismo número dentro del día = misma bi-serie
--    · guardar_rutina() recibe `grupo` en cada ítem, valida que los
--      ejercicios estén seguidos y deja el descanso solo en el último
--    · v_rutina_alumno suma la columna grupo (al final)
-- =====================================================================

ALTER TABLE public.rutina_items
    ADD COLUMN IF NOT EXISTS grupo SMALLINT CHECK (grupo > 0);

COMMENT ON COLUMN public.rutina_items.grupo IS
    'Bi-serie: los ítems del mismo día con el mismo grupo se hacen seguidos sin descanso';

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
                                         repeticiones, descanso_seg, nota, grupo)
        SELECT v_dia_id,
               (i.value->>'ejercicio_id')::uuid,
               (i.value->>'bloque')::public.bloque_ejercicio,
               row_number() OVER (ORDER BY (i.value->>'bloque')::public.bloque_ejercicio, i.ordinality),
               (i.value->>'series')::smallint,
               trim(i.value->>'repeticiones'),
               nullif(i.value->>'descanso_seg', '')::smallint,
               nullif(trim(i.value->>'nota'), ''),
               nullif(i.value->>'grupo', '')::smallint
          FROM jsonb_array_elements(v_dia.dia->'items') WITH ORDINALITY i;

        -- Bi-series: 2+ ejercicios seguidos del mismo bloque con el mismo grupo
        IF EXISTS (
            SELECT 1 FROM public.rutina_items
             WHERE rutina_dia_id = v_dia_id AND grupo IS NOT NULL
             GROUP BY grupo
            HAVING count(*) < 2 OR count(DISTINCT bloque) > 1
                OR max(orden) - min(orden) + 1 <> count(*)
        ) THEN
            RAISE EXCEPTION 'BISERIE_INVALIDA: una bi-serie necesita 2 o más ejercicios seguidos del mismo bloque';
        END IF;
        -- Dentro de la bi-serie solo el último ejercicio lleva descanso
        UPDATE public.rutina_items ri SET descanso_seg = NULL
         WHERE ri.rutina_dia_id = v_dia_id AND ri.grupo IS NOT NULL AND ri.descanso_seg IS NOT NULL
           AND ri.orden < (SELECT max(x.orden) FROM public.rutina_items x
                            WHERE x.rutina_dia_id = v_dia_id AND x.grupo = ri.grupo);
    END LOOP;

    RETURN v_rutina;
END $$;

CREATE OR REPLACE VIEW public.v_rutina_alumno WITH (security_invoker = true) AS
SELECT r.id AS rutina_id, r.alumno_id, r.coach_id, r.nombre AS rutina, r.objetivo,
       r.fecha_actualizacion, d.id AS rutina_dia_id, d.numero_dia, d.nombre AS dia,
       i.id AS item_id, i.bloque, i.orden, e.id AS ejercicio_id, e.nombre AS ejercicio,
       e.categoria, e.video_url, i.series, i.repeticiones, i.descanso_seg, i.nota,
       e.descripcion, i.grupo
  FROM public.rutinas r
  JOIN public.rutina_dias d       ON d.rutina_id = r.id
  LEFT JOIN public.rutina_items i ON i.rutina_dia_id = d.id
  LEFT JOIN public.ejercicios e   ON e.id = i.ejercicio_id
 WHERE r.activa;
