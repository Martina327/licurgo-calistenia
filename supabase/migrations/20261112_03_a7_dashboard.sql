-- =====================================================================
--  A7 · Dashboard de ingresos (CU12, RF07, RF14, RNF01) · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261112_01.
--  Es re-ejecutable.
--
--    · v_movimientos: cada ingreso con fecha local, quién lo cobró, a
--      quién y, en el kiosco, qué productos se vendieron (solo
--      SuperAdmin; el resto de los roles no ve filas).
--    · configuracion_admin: una sola fila con el link a la planilla de
--      Google Sheets de la administración (RF14). Solo el dueño la ve y
--      la cambia (RNF05).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Movimientos (detalle de ingresos para el dashboard y el CSV)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_movimientos WITH (security_invoker = true) AS
SELECT i.id,
       (i.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
       i.created_at,
       i.concepto,
       i.medio_pago,
       i.monto,
       coalesce(i.detalle, vi.productos)                              AS detalle,
       r.nombre || ' ' || r.apellido                                   AS cobrado_por,
       r.rol                                                           AS rol_cobro,
       a.nombre || ' ' || a.apellido                                   AS alumno,
       i.turno_id IS NULL AND i.medio_pago = 'Efectivo'                AS fuera_de_caja,
       i.turno_id,                                    -- detalle del cierre de caja
       i.registrado_por
  FROM public.ingresos i
  JOIN public.usuarios r      ON r.id = i.registrado_por
  LEFT JOIN public.usuarios a ON a.id = i.alumno_id
  -- Kiosco: qué se vendió, ej. "2× Gatorade 500 ml, 1× Barra de cereal"
  LEFT JOIN LATERAL (
        SELECT string_agg(it.cantidad || '× ' || p.nombre, ', ' ORDER BY p.nombre) AS productos
          FROM public.venta_items it
          JOIN public.productos p ON p.id = it.producto_id
         WHERE it.venta_id = i.venta_id
       ) vi ON i.venta_id IS NOT NULL
 WHERE public.mi_rol() = 'SuperAdmin';
GRANT SELECT ON public.v_movimientos TO authenticated;


-- ---------------------------------------------------------------------
-- 2. Link a la planilla de Google Sheets (RF14)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracion_admin (
    id            BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),   -- una sola fila
    planilla_url  TEXT CHECK (planilla_url IS NULL OR planilla_url ~ '^https://'),
    actualizado_at  TIMESTAMPTZ,
    actualizado_por UUID REFERENCES public.usuarios(id)
);
INSERT INTO public.configuracion_admin (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuracion_admin_select ON public.configuracion_admin;
CREATE POLICY configuracion_admin_select ON public.configuracion_admin FOR SELECT TO authenticated
    USING (public.mi_rol() = 'SuperAdmin');
REVOKE INSERT, UPDATE, DELETE ON public.configuracion_admin FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardar_planilla_url(p_url TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url TEXT := nullif(trim(coalesce(p_url, '')), '');
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF v_url IS NOT NULL AND v_url !~ '^https://' THEN
        RAISE EXCEPTION 'URL_INVALIDA';
    END IF;
    UPDATE public.configuracion_admin
       SET planilla_url = v_url, actualizado_at = now(), actualizado_por = auth.uid()
     WHERE id;
END $$;
REVOKE EXECUTE ON FUNCTION public.guardar_planilla_url(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_planilla_url(TEXT) TO authenticated;


-- Verificación
SELECT concepto, medio_pago, count(*), sum(monto) FROM public.ingresos GROUP BY 1, 2 ORDER BY 1, 2;
