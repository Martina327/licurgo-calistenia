-- =====================================================================
--  Kiosco · vencimiento y ajuste de stock con − / + · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261112_03.
--  Es re-ejecutable.
--
--    · productos.vencimiento: fecha de vencimiento OPCIONAL.
--    · ajustar_stock(producto, delta): suma o resta unidades (el − / +
--      y la casilla de stock de Productos). Trabaja con la diferencia y
--      no con el número final, así no pisa una venta que entre al mismo
--      tiempo. Solo SuperAdmin; el stock nunca queda negativo.
-- =====================================================================

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS vencimiento DATE;

CREATE OR REPLACE FUNCTION public.ajustar_stock(p_producto_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock INTEGER;
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF p_delta IS NULL THEN
        RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;
    SELECT stock INTO v_stock FROM public.productos WHERE id = p_producto_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCTO_INEXISTENTE: %', p_producto_id;
    END IF;
    IF v_stock + p_delta < 0 THEN
        RAISE EXCEPTION 'STOCK_NEGATIVO';
    END IF;
    UPDATE public.productos SET stock = stock + p_delta
     WHERE id = p_producto_id
    RETURNING stock INTO v_stock;
    RETURN v_stock;
END $$;

REVOKE EXECUTE ON FUNCTION public.ajustar_stock(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ajustar_stock(UUID, INTEGER) TO authenticated;


-- Verificación
SELECT nombre, precio, stock, vencimiento, activo FROM public.productos ORDER BY nombre;
