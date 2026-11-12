-- =====================================================================
--  A3 · Kiosco: productos y stock (CU14) · Pareja A
--  Ingreso de mercadería
--
--  Correr en el SQL Editor de Supabase. Es re-ejecutable.
--
--  Decisión del dueño (11/11/2026): los productos los maneja SOLO el
--  SuperAdmin (alta, precios, stock y baja). Ya lo garantiza la política
--  productos_write; recepción solo lee y vende.
--
--  cargar_stock suma la mercadería que llega en una sola operación
--  (stock = stock + n), así no pisa una venta que ocurra al mismo tiempo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cargar_stock(p_producto_id UUID, p_cantidad INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock INTEGER;
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;
    UPDATE public.productos SET stock = stock + p_cantidad
     WHERE id = p_producto_id
    RETURNING stock INTO v_stock;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCTO_INEXISTENTE: %', p_producto_id;
    END IF;
    RETURN v_stock;
END $$;

REVOKE EXECUTE ON FUNCTION public.cargar_stock(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cargar_stock(UUID, INTEGER) TO authenticated;


-- Verificación
SELECT nombre, precio, stock, activo FROM public.productos ORDER BY nombre;
