-- =====================================================================
--  Kiosco · categoría de producto (Bebida u Otro) · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261112_04.
--  Es re-ejecutable.
--
--    · productos.categoria: 'Bebida' u 'Otro' (por defecto 'Otro').
--      La venta del kiosco filtra por Todo · Bebidas · Otros productos.
--    · La primera vez adivina las bebidas por el nombre (agua, gaseosa,
--      jugo, etc.). El dueño lo corrige desde Productos con el lápiz.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'categoria') THEN
        ALTER TABLE public.productos
            ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Otro' CHECK (categoria IN ('Bebida', 'Otro'));
        UPDATE public.productos SET categoria = 'Bebida'
         WHERE nombre ~* '(agua|gaseosa|bebida|jugo|gatorade|powerade|coca|sprite|fanta|pepsi|seven|7up|cerveza|energ|monster|red ?bull|isot|soda|t[eé] frío|limonada|\mml\M|\ml\M|litro)';
    END IF;
END $$;


-- Verificación
SELECT nombre, categoria FROM public.productos ORDER BY categoria, nombre;
