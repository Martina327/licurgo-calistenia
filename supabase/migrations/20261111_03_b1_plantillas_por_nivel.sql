-- =====================================================================
--  B1 · Iteración 3 — plantillas por nivel: sección, día y planificación
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_02.
--  (Ya incluido en schema.sql, sección 19.10.)
--
--  rutinas_plantilla.tipo pasa a ser:
--    · 'Planificación' → varios días (la semana)            ex 'Rutina'
--    · 'Día'           → un día completo con todas sus secciones
--    · 'Sección'       → un bloque: calentamiento, fuerza, accesorios o
--                        estiramientos (columna `bloque`)  ex 'Calentamiento'
--  Ya no hay un calentamiento único: hay varias plantillas de sección
--  (no se calienta ni se estira igual el día de brazos que el de piernas).
--
--  Conversión de lo que ya existe:
--    · 'Calentamiento' → Sección de Entrada en calor "Calentamiento general"
--    · 'Rutina' de 1 día → 'Día';  'Rutina' de 2+ días → 'Planificación'
-- =====================================================================

ALTER TABLE public.rutinas_plantilla DROP CONSTRAINT IF EXISTS rutinas_plantilla_tipo_check;
ALTER TABLE public.rutinas_plantilla DROP CONSTRAINT IF EXISTS ck_plantilla_nivel;
ALTER TABLE public.rutinas_plantilla ADD COLUMN IF NOT EXISTS bloque public.bloque_ejercicio;
DROP INDEX IF EXISTS public.uq_un_calentamiento;
DROP INDEX IF EXISTS public.uq_plantilla_nombre;

UPDATE public.rutinas_plantilla
   SET tipo = 'Sección', bloque = 'Entrada en calor',
       nombre = CASE WHEN nombre = 'Calentamiento estándar' THEN 'Calentamiento general' ELSE nombre END
 WHERE tipo = 'Calentamiento';
UPDATE public.rutinas_plantilla
   SET tipo = CASE WHEN jsonb_array_length(dias) = 1 THEN 'Día' ELSE 'Planificación' END
 WHERE tipo = 'Rutina';

ALTER TABLE public.rutinas_plantilla ALTER COLUMN tipo SET DEFAULT 'Planificación';
ALTER TABLE public.rutinas_plantilla ADD CONSTRAINT ck_plantilla_nivel CHECK (
        tipo IN ('Planificación', 'Día', 'Sección')
    AND (tipo = 'Sección') = (bloque IS NOT NULL)
    AND (tipo = 'Planificación' OR jsonb_array_length(dias) = 1));

-- Nombre único entre las activas del mismo nivel (y sección)
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_nombre
    ON public.rutinas_plantilla (tipo, bloque, lower(trim(nombre))) NULLS NOT DISTINCT WHERE activa;

COMMENT ON COLUMN public.rutinas_plantilla.tipo IS
    'Planificación (varios días) · Día (un día completo) · Sección (un bloque, ver columna bloque)';


-- ---------------------------------------------------------------------
-- Plantillas iniciales (ejemplos: el coach las ajusta desde Coach → Plantillas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.it(p_nombre TEXT, p_bloque TEXT, p_series INT, p_reps TEXT,
                                      p_descanso INT DEFAULT NULL, p_grupo INT DEFAULT NULL, p_nota TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'ejercicio_id', (SELECT id FROM public.ejercicios WHERE nombre = p_nombre),
        'bloque', p_bloque, 'series', p_series, 'repeticiones', p_reps,
        'descanso_seg', p_descanso, 'grupo', p_grupo, 'nota', p_nota)
$$;

DROP TABLE IF EXISTS pg_temp.semilla;
CREATE TEMP TABLE semilla (clave TEXT PRIMARY KEY, items JSONB);
INSERT INTO semilla VALUES
('cal_sup', jsonb_build_array(
    pg_temp.it('Jumping jacks',                  'Entrada en calor', 2, '30s'),
    pg_temp.it('Movilidad de hombros y muñecas', 'Entrada en calor', 1, '2 min'),
    pg_temp.it('Scapular pull-ups',              'Entrada en calor', 2, '10'),
    pg_temp.it('Flexiones',                      'Entrada en calor', 1, '8', NULL, NULL, 'Suaves, para entrar en calor'))),
('cal_pie', jsonb_build_array(
    pg_temp.it('Jumping jacks',                  'Entrada en calor', 2, '30s'),
    pg_temp.it('Movilidad de tobillos',          'Entrada en calor', 1, '1 min'),
    pg_temp.it('Movilidad articular general',    'Entrada en calor', 1, '2 min'),
    pg_temp.it('Sentadilla libre',               'Entrada en calor', 2, '15'),
    pg_temp.it('Puente de glúteos',              'Entrada en calor', 2, '12'))),
('est_sup', jsonb_build_array(
    pg_temp.it('Estiramiento de pectoral en pared', 'Estiramientos', 2, '30s', NULL, NULL, 'Cada lado'),
    pg_temp.it('Estiramiento de dorsal colgado',    'Estiramientos', 2, '30s'),
    pg_temp.it('Estiramiento de tríceps',           'Estiramientos', 2, '30s', NULL, NULL, 'Cada lado'),
    pg_temp.it('Estiramiento de antebrazos',        'Estiramientos', 1, '30s'))),
('est_pie', jsonb_build_array(
    pg_temp.it('Estiramiento de isquiotibiales',  'Estiramientos', 2, '30s'),
    pg_temp.it('Estiramiento de cuádriceps',      'Estiramientos', 2, '30s', NULL, NULL, 'Cada pierna'),
    pg_temp.it('Estiramiento de cadera (paloma)', 'Estiramientos', 2, '45s', NULL, NULL, 'Cada lado'),
    pg_temp.it('Estiramiento de gemelos',         'Estiramientos', 2, '30s', NULL, NULL, 'Cada pierna'))),
('fza_sup', jsonb_build_array(
    pg_temp.it('Dominada asistida con banda', 'Fuerza',     4, '6',   NULL, 1),
    pg_temp.it('Fondos asistidos con banda',  'Fuerza',     4, '8',   120, 1),
    pg_temp.it('Remo australiano',            'Fuerza',     3, '10',  90),
    pg_temp.it('Hollow body hold',            'Accesorios', 3, '30s', 60),
    pg_temp.it('Plancha lateral',             'Accesorios', 3, '20s', 60, NULL, 'Cada lado'))),
('fza_pie', jsonb_build_array(
    pg_temp.it('Flexiones',                       'Fuerza',     4, '10'),
    pg_temp.it('Sentadilla búlgara',              'Fuerza',     3, '8',  90, NULL, 'Cada pierna'),
    pg_temp.it('Dominada negativa',               'Fuerza',     3, '5',  120),
    pg_temp.it('Elevaciones de rodillas colgado', 'Accesorios', 3, '10', 60)));

CREATE OR REPLACE FUNCTION pg_temp.s(k TEXT) RETURNS JSONB LANGUAGE sql AS $$ SELECT items FROM semilla WHERE clave = k $$;
CREATE OR REPLACE FUNCTION pg_temp.dia(n TEXT, VARIADIC ks TEXT[]) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object('nombre', n, 'items',
           (SELECT coalesce(jsonb_agg(it.item ORDER BY k.ord, it.ord), '[]'::jsonb)
              FROM unnest(ks) WITH ORDINALITY k(clave, ord),
                   jsonb_array_elements(pg_temp.s(k.clave)) WITH ORDINALITY it(item, ord)))
$$;

-- Secciones: calentamientos y estiramientos por tipo de día
INSERT INTO public.rutinas_plantilla (tipo, bloque, nombre, dias, creada_por)
SELECT 'Sección', x.bloque::public.bloque_ejercicio, x.nombre, jsonb_build_array(pg_temp.dia(x.nombre, x.clave)), NULL
  FROM (VALUES ('Entrada en calor', 'Calentamiento tren superior', 'cal_sup'),
               ('Entrada en calor', 'Calentamiento piernas',       'cal_pie'),
               ('Estiramientos',    'Estiramiento tren superior',  'est_sup'),
               ('Estiramientos',    'Estiramiento piernas',        'est_pie')) x(bloque, nombre, clave)
 WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla p
                    WHERE p.activa AND p.tipo = 'Sección' AND lower(p.nombre) = lower(x.nombre));

-- Días completos (calentamiento + fuerza/accesorios + estiramientos)
INSERT INTO public.rutinas_plantilla (tipo, nombre, dias, creada_por)
SELECT 'Día', x.nombre, jsonb_build_array(pg_temp.dia(x.nombre, x.cal, x.fza, x.est)), NULL
  FROM (VALUES ('Tren superior',    'cal_sup', 'fza_sup', 'est_sup'),
               ('Empuje + Piernas', 'cal_pie', 'fza_pie', 'est_pie')) x(nombre, cal, fza, est)
 WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla p
                    WHERE p.activa AND p.tipo = 'Día' AND lower(p.nombre) = lower(x.nombre));

-- Planificación "Fuerza básica": los dos días completos. Si ya existía tal como
-- se cargó (sin calentamiento), se completa; si el coach la modificó, no se toca.
UPDATE public.rutinas_plantilla
   SET dias = jsonb_build_array(pg_temp.dia('Tren superior', 'cal_sup', 'fza_sup', 'est_sup'),
                                pg_temp.dia('Empuje + Piernas', 'cal_pie', 'fza_pie', 'est_pie'))
 WHERE tipo = 'Planificación' AND nombre = 'Fuerza básica' AND activa
   AND dias::text NOT LIKE '%Entrada en calor%' AND dias::text NOT LIKE '%Estiramientos%';
INSERT INTO public.rutinas_plantilla (tipo, nombre, objetivo, dias, creada_por)
SELECT 'Planificación', 'Fuerza básica', 'Base de fuerza en tracción, empuje y piernas',
       jsonb_build_array(pg_temp.dia('Tren superior', 'cal_sup', 'fza_sup', 'est_sup'),
                         pg_temp.dia('Empuje + Piernas', 'cal_pie', 'fza_pie', 'est_pie')), NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla
                    WHERE activa AND tipo = 'Planificación' AND lower(nombre) = 'fuerza básica');

-- Las plantillas tampoco llevan descanso ni bi-serie en Entrada en calor y Estiramientos
UPDATE public.rutinas_plantilla p
   SET dias = (SELECT jsonb_agg(jsonb_set(d, '{items}', (
                   SELECT coalesce(jsonb_agg(CASE WHEN i->>'bloque' IN ('Entrada en calor', 'Estiramientos')
                                                  THEN i || '{"descanso_seg": null, "grupo": null}'::jsonb ELSE i END
                                             ORDER BY o), '[]'::jsonb)
                     FROM jsonb_array_elements(d->'items') WITH ORDINALITY x(i, o))) ORDER BY n)
                 FROM jsonb_array_elements(p.dias) WITH ORDINALITY y(d, n))
 WHERE p.dias::text ~ '"bloque": "(Entrada en calor|Estiramientos)"';

DROP TABLE IF EXISTS pg_temp.semilla;
