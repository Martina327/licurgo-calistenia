-- =====================================================================
--  B1 · Iteración 2 — descripción del ejercicio en la rutina del alumno
--  Correr en el SQL Editor de Supabase. (Ya incluido en schema.sql.)
--
--  El alumno ve la descripción que cargó el coach tocando ⓘ en cada
--  ejercicio. Se agrega la columna `descripcion` AL FINAL de la vista
--  (CREATE OR REPLACE VIEW solo permite agregar columnas al final).
--  video_url queda en la vista y en la tabla, pero el front ya no lo usa.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_rutina_alumno WITH (security_invoker = true) AS
SELECT r.id AS rutina_id, r.alumno_id, r.coach_id, r.nombre AS rutina, r.objetivo,
       r.fecha_actualizacion, d.id AS rutina_dia_id, d.numero_dia, d.nombre AS dia,
       i.id AS item_id, i.bloque, i.orden, e.id AS ejercicio_id, e.nombre AS ejercicio,
       e.categoria, e.video_url, i.series, i.repeticiones, i.descanso_seg, i.nota,
       e.descripcion
  FROM public.rutinas r
  JOIN public.rutina_dias d       ON d.rutina_id = r.id
  LEFT JOIN public.rutina_items i ON i.rutina_dia_id = d.id
  LEFT JOIN public.ejercicios e   ON e.id = i.ejercicio_id
 WHERE r.activa;
