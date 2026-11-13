-- =====================================================================
--  A4 · Cobro de subalquiler (CU16) · Pareja A
--  Salones con precio por hora y mensual · cobro calculado por el sistema
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_01.
--  Es re-ejecutable.
--
--  Decisiones (11/11/2026):
--    · espacios_alquiler pasa a ser el catálogo de SALONES. Los carga y
--      edita SOLO el SuperAdmin (política espacios_write, ya existente).
--      Cada salón tiene precio por hora y, opcional, precio mensual.
--      Las promos se manejan cambiando el precio del salón.
--    · Quién alquila ya no es un dato del salón: se escribe en cada cobro
--      (los que alquilan por hora suelen ser eventuales).
--    · Cobran Recepción y SuperAdmin. El monto lo calcula la base con el
--      precio vigente (horas × precio por hora, o precio mensual):
--      la recepcionista no lo puede cambiar (opción B).
--    · Efectivo va al turno de caja; transferencia solo al dashboard.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Salones
-- ---------------------------------------------------------------------
ALTER TABLE public.espacios_alquiler ADD COLUMN IF NOT EXISTS precio_hora    NUMERIC(12,2);
ALTER TABLE public.espacios_alquiler ADD COLUMN IF NOT EXISTS precio_mensual NUMERIC(12,2);

-- Lo que había en canon_sugerido era el precio mensual
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'espacios_alquiler'
                  AND column_name = 'canon_sugerido') THEN
        UPDATE public.espacios_alquiler SET precio_mensual = coalesce(precio_mensual, canon_sugerido);
        ALTER TABLE public.espacios_alquiler DROP COLUMN canon_sugerido;
    END IF;
END $$;

ALTER TABLE public.espacios_alquiler DROP COLUMN IF EXISTS locatario;

UPDATE public.espacios_alquiler SET precio_hora = 15000 WHERE precio_hora IS NULL;
ALTER TABLE public.espacios_alquiler ALTER COLUMN precio_hora SET NOT NULL;

ALTER TABLE public.espacios_alquiler DROP CONSTRAINT IF EXISTS chk_precio_hora;
ALTER TABLE public.espacios_alquiler ADD  CONSTRAINT chk_precio_hora    CHECK (precio_hora > 0);
ALTER TABLE public.espacios_alquiler DROP CONSTRAINT IF EXISTS chk_precio_mensual;
ALTER TABLE public.espacios_alquiler ADD  CONSTRAINT chk_precio_mensual CHECK (precio_mensual IS NULL OR precio_mensual > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_espacios_nombre ON public.espacios_alquiler (lower(nombre));

-- El salón de prueba deja de tener nombre de horario
UPDATE public.espacios_alquiler SET nombre = 'Salón funcional'
 WHERE id = 'e0000000-0000-0000-0000-000000000001' AND nombre = 'Sector funcional – sábados';


-- ---------------------------------------------------------------------
-- 2. Cobro de subalquiler (reemplaza a la versión con monto libre)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_cobro_alquiler(UUID, NUMERIC, public.medio_pago, TEXT);
DROP FUNCTION IF EXISTS public.registrar_cobro_alquiler(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, public.medio_pago);

CREATE FUNCTION public.registrar_cobro_alquiler(
    p_espacio_id UUID,
    p_modalidad  TEXT,              -- 'Por hora' | 'Mensual'
    p_horas      NUMERIC,           -- solo Por hora (múltiplos de media hora)
    p_periodo    DATE,              -- solo Mensual (cualquier día del mes que paga)
    p_locatario  TEXT,              -- quién alquila
    p_contacto   TEXT,              -- celular (opcional)
    p_medio      public.medio_pago
)
RETURNS NUMERIC                     -- monto cobrado
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_salon     public.espacios_alquiler;
    v_locatario TEXT := trim(coalesce(p_locatario, ''));
    v_contacto  TEXT := nullif(regexp_replace(coalesce(p_contacto, ''), '\D', '', 'g'), '');
    v_monto     NUMERIC;
    v_detalle   TEXT;
    v_turno     UUID;
    v_meses     TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio',
                                'agosto','septiembre','octubre','noviembre','diciembre'];
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    SELECT * INTO v_salon FROM public.espacios_alquiler WHERE id = p_espacio_id AND activo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ESPACIO_INEXISTENTE';
    END IF;
    IF v_locatario = '' THEN
        RAISE EXCEPTION 'LOCATARIO_REQUERIDO';
    END IF;

    IF p_modalidad = 'Por hora' THEN
        IF p_horas IS NULL OR p_horas <= 0 OR p_horas > 24 OR (p_horas * 2) <> trunc(p_horas * 2) THEN
            RAISE EXCEPTION 'HORAS_INVALIDAS: %', p_horas;
        END IF;
        v_monto   := round(p_horas * v_salon.precio_hora, 2);
        v_detalle := format('%s · Por hora · %s h × $%s', v_salon.nombre,
                            replace(rtrim(rtrim(p_horas::text, '0'), '.'), '.', ','),
                            replace(to_char(v_salon.precio_hora, 'FM999,999,990'), ',', '.'));
    ELSIF p_modalidad = 'Mensual' THEN
        IF v_salon.precio_mensual IS NULL THEN
            RAISE EXCEPTION 'SIN_PRECIO_MENSUAL';
        END IF;
        IF p_periodo IS NULL THEN
            RAISE EXCEPTION 'PERIODO_REQUERIDO';
        END IF;
        v_monto   := v_salon.precio_mensual;
        v_detalle := format('%s · Mensual · %s %s', v_salon.nombre,
                            v_meses[extract(month FROM p_periodo)::int], extract(year FROM p_periodo)::int);
    ELSE
        RAISE EXCEPTION 'MODALIDAD_INVALIDA: %', p_modalidad;
    END IF;

    v_detalle := v_detalle || ' · ' || v_locatario || coalesce(' · ' || v_contacto, '');

    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, espacio_id, turno_id, registrado_por, detalle)
    VALUES ('Subalquiler', p_medio, v_monto, p_espacio_id, v_turno, auth.uid(), v_detalle);

    RETURN v_monto;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_cobro_alquiler(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, public.medio_pago) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_cobro_alquiler(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, public.medio_pago) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------
SELECT nombre, precio_hora, precio_mensual, activo FROM public.espacios_alquiler ORDER BY nombre;
