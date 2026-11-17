-- =====================================================================
--  Mostrador · aviso de cumpleaños · Pareja A
--
--  Correr en el SQL Editor de Supabase. Es re-ejecutable.
--
--    · v_cumpleanos_hoy: alumnos activos que cumplen años hoy (hora de
--      Argentina) y todavía no fueron saludados. Los nacidos un 29/02
--      se saludan el 28/02 en los años que no son bisiestos.
--    · saludos_cumple: quién saludó a quién y cuándo (uno por año).
--    · registrar_saludo_cumple(alumno): lo marca como saludado y el aviso
--      desaparece. Solo Recepción y SuperAdmin.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.saludos_cumple (
    alumno_id     UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    anio          INTEGER NOT NULL,
    enviado_por   UUID NOT NULL REFERENCES public.usuarios(id),
    enviado_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alumno_id, anio)
);

ALTER TABLE public.saludos_cumple ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saludos_cumple_select ON public.saludos_cumple;
CREATE POLICY saludos_cumple_select ON public.saludos_cumple FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
REVOKE INSERT, UPDATE, DELETE ON public.saludos_cumple FROM anon, authenticated;

CREATE OR REPLACE VIEW public.v_cumpleanos_hoy WITH (security_invoker = true) AS
SELECT u.id AS alumno_id, u.nombre, u.apellido, u.telefono, a.fecha_nacimiento,
       extract(year FROM age(public.hoy_ar(), a.fecha_nacimiento))::int AS edad
  FROM public.alumnos a
  JOIN public.usuarios u ON u.id = a.usuario_id
 WHERE u.activo
   AND a.fecha_nacimiento IS NOT NULL
   AND public.mi_rol() IN ('Recepcionista', 'SuperAdmin')
   AND (
        to_char(a.fecha_nacimiento, 'MM-DD') = to_char(public.hoy_ar(), 'MM-DD')
        -- 29/02 en un año que no es bisiesto: se saluda el 28/02
        OR (to_char(a.fecha_nacimiento, 'MM-DD') = '02-29'
            AND to_char(public.hoy_ar(), 'MM-DD') = '02-28'
            AND extract(day FROM (date_trunc('year', public.hoy_ar()) + interval '2 months' - interval '1 day')) = 28)
   )
   AND NOT EXISTS (
        SELECT 1 FROM public.saludos_cumple s
         WHERE s.alumno_id = a.usuario_id AND s.anio = extract(year FROM public.hoy_ar())::int
   );
GRANT SELECT ON public.v_cumpleanos_hoy TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_saludo_cumple(p_alumno_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    INSERT INTO public.saludos_cumple (alumno_id, anio, enviado_por)
    VALUES (p_alumno_id, extract(year FROM public.hoy_ar())::int, auth.uid())
    ON CONFLICT (alumno_id, anio) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_saludo_cumple(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_saludo_cumple(UUID) TO authenticated;


-- Verificación: quiénes cumplen años hoy (el SQL Editor corre como admin;
-- en la app la vista solo devuelve filas a Recepción y SuperAdmin)
SELECT u.nombre, u.apellido, a.fecha_nacimiento
  FROM public.alumnos a JOIN public.usuarios u ON u.id = a.usuario_id
 WHERE u.activo AND to_char(a.fecha_nacimiento, 'MM-DD') = to_char(public.hoy_ar(), 'MM-DD');
