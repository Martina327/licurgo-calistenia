-- =====================================================================
--  B1 · Catálogo de ejercicios — progresiones sin ciclos
--  Correr en el SQL Editor de Supabase sobre el esquema v2 ya cargado.
--  (Ya incluido en supabase/schema.sql, sección 13.)
--
--  El CHECK de la tabla solo impide que un ejercicio sea su propio
--  prerrequisito. Este trigger impide cadenas circulares más largas:
--    A → B → C → A
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_validar_progresion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.prerrequisito_id IS NULL THEN
        RETURN NEW;
    END IF;
    -- Recorre la cadena de prerrequisitos hacia atrás desde el nuevo prerrequisito
    IF EXISTS (
        WITH RECURSIVE cadena(id) AS (
            SELECT NEW.prerrequisito_id
            UNION
            SELECT e.prerrequisito_id
              FROM public.ejercicios e JOIN cadena c ON e.id = c.id
             WHERE e.prerrequisito_id IS NOT NULL
        )
        SELECT 1 FROM cadena WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'PROGRESION_CICLICA: el prerrequisito elegido depende de este ejercicio';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ejercicios_progresion ON public.ejercicios;
CREATE TRIGGER trg_ejercicios_progresion BEFORE INSERT OR UPDATE OF prerrequisito_id ON public.ejercicios
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_progresion();
