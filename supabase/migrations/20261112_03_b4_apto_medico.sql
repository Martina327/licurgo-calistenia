-- =====================================================================
--  B4 · Apto médico: el alumno lo carga y recepción lo aprueba · Pareja B
--  Re-ejecutable. Correr después de 20261112_01.
--
--  Igual que los comprobantes de pago:
--    1. El alumno sube la foto o PDF al bucket privado `certificados`
--       (carpeta = su id) → queda una CARGA en estado Pendiente.
--    2. Recepción (o SuperAdmin) la revisa:
--         · aprobar → se crea el certificado oficial en certificados_aptos
--           con su fecha de vencimiento. Recién ahí el alumno figura "Vigente"
--           (v_membresias no cambia: sigue leyendo certificados_aptos).
--         · rechazar → con motivo, que el alumno ve.
--  El alumno ya NO puede escribir directo en certificados_aptos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cargas del alumno
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificados_cargas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id       UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    archivo_path    TEXT NOT NULL,
    fecha_emision   DATE NOT NULL,
    estado          public.estado_comprobante NOT NULL DEFAULT 'Pendiente',
    motivo_rechazo  TEXT,
    revisado_por    UUID REFERENCES public.usuarios(id),
    revisado_at     TIMESTAMPTZ,
    certificado_id  UUID REFERENCES public.certificados_aptos(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (estado <> 'Rechazado' OR motivo_rechazo IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_certificados_cargas_alumno ON public.certificados_cargas (alumno_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificado_pendiente_por_alumno
    ON public.certificados_cargas (alumno_id) WHERE estado = 'Pendiente';

ALTER TABLE public.certificados_cargas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificados_cargas_select ON public.certificados_cargas;
DROP POLICY IF EXISTS certificados_cargas_insert ON public.certificados_cargas;
CREATE POLICY certificados_cargas_select ON public.certificados_cargas FOR SELECT TO authenticated
    USING (alumno_id = auth.uid() OR public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
CREATE POLICY certificados_cargas_insert ON public.certificados_cargas FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid()
                AND estado = 'Pendiente' AND motivo_rechazo IS NULL
                AND revisado_por IS NULL AND revisado_at IS NULL AND certificado_id IS NULL
                AND fecha_emision <= public.hoy_ar()
                AND split_part(archivo_path, '/', 1) = auth.uid()::text);
REVOKE ALL ON public.certificados_cargas FROM anon, authenticated;
GRANT SELECT, INSERT ON public.certificados_cargas TO authenticated;

-- El certificado oficial solo lo crea recepción / SuperAdmin (la política certificados_admin ya lo cubre)
DROP POLICY IF EXISTS certificados_insert ON public.certificados_aptos;

-- Archivo huérfano (falló el alta): el alumno lo puede borrar; uno registrado, no
DROP POLICY IF EXISTS "certificados_delete_huerfano" ON storage.objects;
CREATE POLICY "certificados_delete_huerfano" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'certificados'
           AND (storage.foldername(name))[1] = auth.uid()::text
           AND NOT EXISTS (SELECT 1 FROM public.certificados_cargas c WHERE c.archivo_path = name)
           AND NOT EXISTS (SELECT 1 FROM public.certificados_aptos a WHERE a.archivo_path = name));


-- ---------------------------------------------------------------------
-- 2. Vista para el alumno y la bandeja de recepción (respeta el RLS)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_certificados_cargas;
CREATE VIEW public.v_certificados_cargas WITH (security_invoker = true) AS
SELECT
    c.id, c.alumno_id, c.archivo_path, c.fecha_emision, c.estado, c.motivo_rechazo,
    c.created_at, c.revisado_at,
    u.nombre, u.apellido, u.dni, u.telefono,
    ca.fecha_vencimiento,
    nullif(trim(coalesce(r.nombre, '') || ' ' || coalesce(r.apellido, '')), '') AS revisado_por_nombre
FROM public.certificados_cargas c
JOIN public.usuarios u                ON u.id = c.alumno_id
LEFT JOIN public.certificados_aptos ca ON ca.id = c.certificado_id
LEFT JOIN public.usuarios r           ON r.id = c.revisado_por;

GRANT SELECT ON public.v_certificados_cargas TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Aprobar / rechazar (solo Recepción y SuperAdmin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_certificado(p_carga_id UUID, p_emision DATE, p_vencimiento DATE)
RETURNS DATE
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_carga public.certificados_cargas;
    v_cert  UUID;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    SELECT * INTO v_carga FROM public.certificados_cargas WHERE id = p_carga_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CERTIFICADO_INEXISTENTE'; END IF;
    IF v_carga.estado <> 'Pendiente' THEN
        RAISE EXCEPTION 'CERTIFICADO_YA_REVISADO: estado %', v_carga.estado;
    END IF;
    IF p_emision IS NULL OR p_vencimiento IS NULL OR p_vencimiento <= p_emision OR p_emision > public.hoy_ar() THEN
        RAISE EXCEPTION 'FECHAS_CERTIFICADO_INVALIDAS';
    END IF;

    INSERT INTO public.certificados_aptos (alumno_id, archivo_path, fecha_emision, fecha_vencimiento, cargado_por)
    VALUES (v_carga.alumno_id, v_carga.archivo_path, p_emision, p_vencimiento, auth.uid())
    RETURNING id INTO v_cert;

    UPDATE public.certificados_cargas
       SET estado = 'Aprobado', fecha_emision = p_emision, certificado_id = v_cert,
           revisado_por = auth.uid(), revisado_at = now()
     WHERE id = p_carga_id;

    RETURN p_vencimiento;
END $$;

CREATE OR REPLACE FUNCTION public.rechazar_certificado(p_carga_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF coalesce(trim(p_motivo), '') = '' THEN
        RAISE EXCEPTION 'MOTIVO_REQUERIDO';
    END IF;
    UPDATE public.certificados_cargas
       SET estado = 'Rechazado', motivo_rechazo = trim(p_motivo),
           revisado_por = auth.uid(), revisado_at = now()
     WHERE id = p_carga_id AND estado = 'Pendiente';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CERTIFICADO_INEXISTENTE_O_YA_REVISADO';
    END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.aprobar_certificado(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rechazar_certificado(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aprobar_certificado(UUID, DATE, DATE) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rechazar_certificado(UUID, TEXT) TO authenticated;
