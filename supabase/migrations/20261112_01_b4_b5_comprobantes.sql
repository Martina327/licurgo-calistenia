-- =====================================================================
--  B4 · Mi membresía y comprobante (CU07, RF02, RNF02) · Pareja B
--  B5 · Validar comprobantes (CU08, RF03)              · Pareja B
--
--  Correr DESPUÉS de las migraciones de Pareja A (A2: _extender_membresia
--  con ficha obligatoria e inactivos desde hoy). Es re-ejecutable.
--
--  1. datos_cobro: CBU, alias y titular de la cuenta del gimnasio.
--     Lo ve cualquier usuario logueado; lo cambia solo el SuperAdmin.
--  2. Un solo comprobante pendiente por alumno (evita duplicados).
--  3. Políticas: el archivo tiene que estar en la carpeta del alumno y el
--     alumno puede borrar SOLO un archivo suyo que no quedó registrado
--     (si falló el alta del comprobante). Los registrados no se tocan.
--  4. v_comprobantes: bandeja de recepción e historial del alumno.
--  5. aprobar_comprobante: el monto tiene que ser mayor a 0.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Datos para transferir (una sola fila)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.datos_cobro (
    id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),   -- fila única
    titular         TEXT,
    banco           TEXT,
    cbu             TEXT CHECK (cbu ~ '^[0-9]{22}$'),
    alias           TEXT CHECK (alias ~ '^[A-Za-z0-9.-]{6,20}$'),
    cuit            TEXT CHECK (cuit ~ '^[0-9]{11}$'),
    actualizado_por UUID REFERENCES public.usuarios(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Arranca vacía: el dueño carga los datos reales desde "Datos de cobro"
INSERT INTO public.datos_cobro (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.datos_cobro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datos_cobro_select ON public.datos_cobro;
DROP POLICY IF EXISTS datos_cobro_update ON public.datos_cobro;
CREATE POLICY datos_cobro_select ON public.datos_cobro FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY datos_cobro_update ON public.datos_cobro FOR UPDATE TO authenticated
    USING (public.mi_rol() = 'SuperAdmin') WITH CHECK (public.mi_rol() = 'SuperAdmin');
REVOKE ALL ON public.datos_cobro FROM anon, authenticated;
GRANT SELECT ON public.datos_cobro TO authenticated;
GRANT UPDATE (titular, banco, cbu, alias, cuit) ON public.datos_cobro TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_datos_cobro_auditoria() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    NEW.actualizado_por := auth.uid();
    NEW.updated_at := now();
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_datos_cobro_auditoria ON public.datos_cobro;
CREATE TRIGGER trg_datos_cobro_auditoria BEFORE UPDATE ON public.datos_cobro
    FOR EACH ROW EXECUTE FUNCTION public.fn_datos_cobro_auditoria();


-- ---------------------------------------------------------------------
-- 2. Un pendiente por alumno: hasta que recepción lo revise no sube otro
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_pendiente_por_alumno
    ON public.comprobantes_pago (alumno_id) WHERE estado = 'Pendiente';


-- ---------------------------------------------------------------------
-- 3. Políticas del comprobante y su archivo
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS comprobantes_insert ON public.comprobantes_pago;
CREATE POLICY comprobantes_insert ON public.comprobantes_pago FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid()
                AND estado = 'Pendiente' AND revisado_por IS NULL AND revisado_at IS NULL
                AND motivo_rechazo IS NULL
                AND split_part(archivo_path, '/', 1) = auth.uid()::text);

-- Archivo huérfano (se subió pero falló el alta): el alumno lo puede borrar.
-- Un archivo ya registrado como comprobante es evidencia: nadie lo borra.
DROP POLICY IF EXISTS "comprobantes_delete_huerfano" ON storage.objects;
CREATE POLICY "comprobantes_delete_huerfano" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'comprobantes'
           AND (storage.foldername(name))[1] = auth.uid()::text
           AND NOT EXISTS (SELECT 1 FROM public.comprobantes_pago c WHERE c.archivo_path = name));


-- ---------------------------------------------------------------------
-- 4. Vista de comprobantes (RLS de las tablas: el alumno ve los suyos,
--    recepción y SuperAdmin ven todos)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_comprobantes;
CREATE VIEW public.v_comprobantes WITH (security_invoker = true) AS
SELECT
    c.id, c.alumno_id, c.archivo_path, c.monto_declarado, c.estado, c.motivo_rechazo,
    c.created_at, c.revisado_at,
    u.nombre, u.apellido, u.dni, u.telefono,
    a.fecha_vencimiento,
    p.precio                                         AS precio_plan,
    CASE
        WHEN a.fecha_vencimiento IS NULL                    THEN 'En clase de prueba'
        WHEN a.fecha_vencimiento < public.hoy_ar() - 30     THEN 'Inactivo'
        ELSE 'Activo'
    END                                              AS estado_alumno,
    i.monto                                          AS monto_acreditado,
    nullif(trim(coalesce(r.nombre, '') || ' ' || coalesce(r.apellido, '')), '') AS revisado_por_nombre
FROM public.comprobantes_pago c
JOIN public.usuarios u      ON u.id = c.alumno_id
JOIN public.alumnos  a      ON a.usuario_id = c.alumno_id
LEFT JOIN public.planes p   ON p.id = a.plan_id
LEFT JOIN public.ingresos i ON i.comprobante_id = c.id
LEFT JOIN public.usuarios r ON r.id = c.revisado_por;

GRANT SELECT ON public.v_comprobantes TO authenticated;


-- ---------------------------------------------------------------------
-- 5. Aprobar: el monto acreditado tiene que ser positivo
--    (el resto igual: +30 días con la regla de A2 vía _extender_membresia)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_comprobante(p_comprobante_id UUID, p_monto NUMERIC DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_comp  public.comprobantes_pago;
    v_monto NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    SELECT * INTO v_comp FROM public.comprobantes_pago WHERE id = p_comprobante_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMPROBANTE_INEXISTENTE'; END IF;
    IF v_comp.estado <> 'Pendiente' THEN
        RAISE EXCEPTION 'COMPROBANTE_YA_REVISADO: estado %', v_comp.estado;
    END IF;
    IF p_monto IS NOT NULL AND p_monto <= 0 THEN
        RAISE EXCEPTION 'MONTO_INVALIDO';
    END IF;

    SELECT coalesce(p_monto, p.precio) INTO v_monto
      FROM public.alumnos a LEFT JOIN public.planes p ON p.id = a.plan_id
     WHERE a.usuario_id = v_comp.alumno_id;
    IF v_monto IS NULL THEN
        RAISE EXCEPTION 'SIN_MONTO: el alumno no tiene plan; indicá el monto acreditado';
    END IF;

    UPDATE public.comprobantes_pago
       SET estado = 'Aprobado', revisado_por = auth.uid(), revisado_at = now()
     WHERE id = p_comprobante_id;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, comprobante_id, registrado_por, detalle)
    VALUES ('Cuota', 'Transferencia', v_monto, v_comp.alumno_id, v_comp.id, auth.uid(), 'Cuota - Transferencia');

    -- Regla de vencimiento de Pareja A (A2): +30 días; primer pago exige ficha completa
    RETURN public._extender_membresia(v_comp.alumno_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.aprobar_comprobante(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aprobar_comprobante(UUID, NUMERIC) TO authenticated;
