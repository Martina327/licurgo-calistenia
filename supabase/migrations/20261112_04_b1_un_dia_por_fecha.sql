-- =====================================================================
--  B1 · Un día de rutina por fecha · Pareja B
--  Re-ejecutable. Correr después de 20261111_04.
--
--  El alumno podía completar varios días de la rutina en la misma fecha
--  (ej.: Día 2, 3 y 4 el miércoles). Entonces "Rutina" decía 5 de 5 días
--  hechos y "Inicio" decía que entrenó 2 días: se contaban cosas distintas.
--  Regla: un solo día de la rutina por alumno y por fecha.
-- =====================================================================

-- 1. Si ya hay varios en la misma fecha, queda el primero que completó
DELETE FROM public.dias_completados d
 USING public.dias_completados p
 WHERE d.alumno_id = p.alumno_id
   AND d.fecha     = p.fecha
   AND (d.creado, d.id) > (p.creado, p.id);

-- 2. La regla
CREATE UNIQUE INDEX IF NOT EXISTS uq_un_dia_por_fecha
    ON public.dias_completados (alumno_id, fecha);
