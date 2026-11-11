-- =====================================================================
--  B1 · Iteración 2 — plantillas de rutina y calentamiento estándar
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261110_02.
--  (Ya incluido en schema.sql, sección 19.)
--
--  rutinas_plantilla: rutinas preestablecidas que el coach usa como base
--  ("Fuerza básica", etc.). Al elegir una, se copia al editor del alumno
--  y se puede modificar antes de guardar: la plantilla no cambia.
--    · tipo 'Rutina'        → rutinas completas (varias)
--    · tipo 'Calentamiento' → el calentamiento estándar (una sola activa).
--      Se carga solo en la Entrada en calor de cada día nuevo.
--  `dias` usa el mismo formato que guardar_rutina (p_dias).
--  Solo Coach y SuperAdmin. La baja es lógica (activa = false).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.rutinas_plantilla (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo                 TEXT NOT NULL DEFAULT 'Rutina' CHECK (tipo IN ('Rutina', 'Calentamiento')),
    nombre               TEXT NOT NULL CHECK (trim(nombre) <> ''),
    objetivo             TEXT,
    dias                 JSONB NOT NULL
                         CHECK (jsonb_typeof(dias) = 'array' AND jsonb_array_length(dias) BETWEEN 1 AND 7),
    activa               BOOLEAN NOT NULL DEFAULT TRUE,
    creada_por           UUID DEFAULT auth.uid() REFERENCES public.usuarios(id) ON DELETE SET NULL,
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_nombre
    ON public.rutinas_plantilla (lower(trim(nombre))) WHERE activa;
CREATE UNIQUE INDEX IF NOT EXISTS uq_un_calentamiento
    ON public.rutinas_plantilla (tipo) WHERE activa AND tipo = 'Calentamiento';

CREATE OR REPLACE FUNCTION public.fn_tocar_plantilla() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    NEW.fecha_actualizacion := now();
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_plantillas_fecha ON public.rutinas_plantilla;
CREATE TRIGGER trg_plantillas_fecha BEFORE UPDATE ON public.rutinas_plantilla
    FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_plantilla();

ALTER TABLE public.rutinas_plantilla ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plantillas_coach ON public.rutinas_plantilla;
CREATE POLICY plantillas_coach ON public.rutinas_plantilla FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));
REVOKE ALL ON public.rutinas_plantilla FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.rutinas_plantilla TO authenticated;
REVOKE DELETE ON public.rutinas_plantilla FROM authenticated;   -- baja lógica


-- ---------------------------------------------------------------------
-- Datos iniciales (se pueden editar desde la app: Coach → Plantillas)
-- ---------------------------------------------------------------------

-- Ejercicios de calentamiento que faltaban en el catálogo
INSERT INTO public.ejercicios (nombre, categoria, descripcion) VALUES
  ('Movilidad articular general', 'Movilidad', 'Cuello, hombros, cadera, rodillas y tobillos: círculos suaves en ambos sentidos'),
  ('Jumping jacks',               'Movilidad', 'Saltos abriendo y cerrando brazos y piernas, ritmo constante'),
  ('Sentadilla libre',            'Piernas',   'Pies al ancho de hombros, bajar con la espalda recta y talones apoyados')
ON CONFLICT (nombre) DO NOTHING;

-- Ítem de plantilla a partir del nombre del ejercicio (si no existe queda sin elegir)
CREATE OR REPLACE FUNCTION pg_temp.it(p_nombre TEXT, p_bloque TEXT, p_series INT, p_reps TEXT,
                                      p_descanso INT DEFAULT NULL, p_grupo INT DEFAULT NULL, p_nota TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'ejercicio_id', (SELECT id FROM public.ejercicios WHERE nombre = p_nombre),
        'bloque', p_bloque, 'series', p_series, 'repeticiones', p_reps,
        'descanso_seg', p_descanso, 'grupo', p_grupo, 'nota', p_nota)
$$;

INSERT INTO public.rutinas_plantilla (tipo, nombre, objetivo, dias, creada_por)
SELECT 'Calentamiento', 'Calentamiento estándar', NULL, jsonb_build_array(jsonb_build_object(
    'nombre', 'Calentamiento',
    'items', jsonb_build_array(
        pg_temp.it('Jumping jacks',                  'Entrada en calor', 2, '30s'),
        pg_temp.it('Movilidad articular general',    'Entrada en calor', 1, '3 min'),
        pg_temp.it('Movilidad de hombros y muñecas', 'Entrada en calor', 1, '2 min'),
        pg_temp.it('Scapular pull-ups',              'Entrada en calor', 2, '10'),
        pg_temp.it('Sentadilla libre',               'Entrada en calor', 2, '15')))), NULL
WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla WHERE tipo = 'Calentamiento' AND activa);

INSERT INTO public.rutinas_plantilla (tipo, nombre, objetivo, dias, creada_por)
SELECT 'Rutina', 'Fuerza básica', 'Base de fuerza en tracción, empuje y piernas', jsonb_build_array(
    jsonb_build_object('nombre', 'Tren superior', 'items', jsonb_build_array(
        pg_temp.it('Dominada asistida con banda', 'Fuerza',     4, '6',   NULL, 1),  -- bi-serie con fondos
        pg_temp.it('Fondos asistidos con banda',  'Fuerza',     4, '8',   120, 1),
        pg_temp.it('Remo australiano',            'Fuerza',     3, '10',  90),
        pg_temp.it('Hollow body hold',            'Accesorios', 3, '30s', 60),
        pg_temp.it('Plancha lateral',             'Accesorios', 3, '20s', 60, NULL, 'Cada lado'))),
    jsonb_build_object('nombre', 'Empuje + Piernas', 'items', jsonb_build_array(
        pg_temp.it('Flexiones',                       'Fuerza',     4, '10'),
        pg_temp.it('Sentadilla búlgara',              'Fuerza',     3, '8',  90, NULL, 'Cada pierna'),
        pg_temp.it('Dominada negativa',               'Fuerza',     3, '5',  120),
        pg_temp.it('Elevaciones de rodillas colgado', 'Accesorios', 3, '10', 60)))), NULL
WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla WHERE lower(nombre) = 'fuerza básica' AND activa);

