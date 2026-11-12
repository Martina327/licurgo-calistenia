-- =====================================================================
--  B1 · Iteración 4 — días completados en la semana
--  Correr en el SQL Editor de Supabase. (Ya incluido en schema.sql.)
--
--  El checklist del alumno se reinicia todos los días (vive en el
--  navegador), pero cuando termina un día de la rutina queda registrado
--  acá. Así:
--    · en la semana (lunes a domingo) ese día figura como hecho ✓
--    · al día siguiente la app abre el próximo día pendiente (Día 2, …)
--    · el coach ve qué días completó cada alumno esta semana
--  Se guarda el número de día (no el id) porque al editar la rutina los
--  días se vuelven a crear. Una rutina nueva arranca de cero.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.dias_completados (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id   UUID NOT NULL DEFAULT auth.uid() REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    rutina_id   UUID NOT NULL REFERENCES public.rutinas(id) ON DELETE CASCADE,
    numero_dia  SMALLINT NOT NULL CHECK (numero_dia BETWEEN 1 AND 7),
    fecha       DATE NOT NULL DEFAULT public.hoy_ar(),
    creado      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dia_completado UNIQUE (alumno_id, rutina_id, numero_dia, fecha)
);
CREATE INDEX IF NOT EXISTS idx_dias_completados_alumno ON public.dias_completados (alumno_id, fecha DESC);

ALTER TABLE public.dias_completados ENABLE ROW LEVEL SECURITY;

-- El alumno marca y desmarca solo sus días, de su propia rutina y con la fecha de hoy
DROP POLICY IF EXISTS dias_completados_alumno_select ON public.dias_completados;
DROP POLICY IF EXISTS dias_completados_alumno_insert ON public.dias_completados;
DROP POLICY IF EXISTS dias_completados_alumno_delete ON public.dias_completados;
DROP POLICY IF EXISTS dias_completados_staff ON public.dias_completados;
CREATE POLICY dias_completados_alumno_select ON public.dias_completados FOR SELECT TO authenticated
    USING (alumno_id = auth.uid());
CREATE POLICY dias_completados_alumno_insert ON public.dias_completados FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid() AND fecha = public.hoy_ar()
                AND EXISTS (SELECT 1 FROM public.rutinas r WHERE r.id = rutina_id AND r.alumno_id = auth.uid()));
CREATE POLICY dias_completados_alumno_delete ON public.dias_completados FOR DELETE TO authenticated
    USING (alumno_id = auth.uid() AND fecha = public.hoy_ar());
-- Coach y SuperAdmin solo lo consultan
CREATE POLICY dias_completados_staff ON public.dias_completados FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'));

REVOKE ALL ON public.dias_completados FROM anon;
REVOKE ALL ON public.dias_completados FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.dias_completados TO authenticated;
