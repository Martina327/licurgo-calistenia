-- =====================================================================
--  B4 · A qué cuenta transfirió el alumno · Pareja B
--  Re-ejecutable. Correr después de 20261112_01.
--
--  El dueño cambia la cuenta de cobro seguido (un mes un alias, otro mes otro).
--  Cada comprobante guarda la cuenta que estaba vigente cuando el alumno lo
--  subió, así recepción sabe en qué cuenta buscar la transferencia aunque
--  después se haya cambiado el alias.
-- =====================================================================

ALTER TABLE public.comprobantes_pago ADD COLUMN IF NOT EXISTS cuenta_destino TEXT;

-- Lo completa la base (el alumno no lo elige)
CREATE OR REPLACE FUNCTION public._comprobante_cuenta_destino()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    SELECT nullif(concat_ws(' · ',
               coalesce(d.alias, CASE WHEN d.cbu IS NOT NULL THEN 'CBU ' || d.cbu END),
               d.titular), '')
      INTO NEW.cuenta_destino
      FROM public.datos_cobro d;
    RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public._comprobante_cuenta_destino() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comprobante_cuenta_destino ON public.comprobantes_pago;
CREATE TRIGGER trg_comprobante_cuenta_destino
    BEFORE INSERT ON public.comprobantes_pago
    FOR EACH ROW EXECUTE FUNCTION public._comprobante_cuenta_destino();

-- La bandeja de recepción la muestra (se agrega al final de la vista)
CREATE OR REPLACE VIEW public.v_comprobantes WITH (security_invoker = true) AS
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
    nullif(trim(coalesce(r.nombre, '') || ' ' || coalesce(r.apellido, '')), '') AS revisado_por_nombre,
    c.cuenta_destino
FROM public.comprobantes_pago c
JOIN public.usuarios u      ON u.id = c.alumno_id
JOIN public.alumnos  a      ON a.usuario_id = c.alumno_id
LEFT JOIN public.planes p   ON p.id = a.plan_id
LEFT JOIN public.ingresos i ON i.comprobante_id = c.id
LEFT JOIN public.usuarios r ON r.id = c.revisado_por;

GRANT SELECT ON public.v_comprobantes TO authenticated;
