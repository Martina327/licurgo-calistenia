# A3 · Kiosco: productos y venta

**Pareja A** · Casos de uso: CU04 (venta) y CU14 (ABM de productos) · RF05

## Rama

```
feature/a2-cobro-cuota
 └── feature/a3-kiosco   → PR a feature/a2-cobro-cuota; al mergear A2, cambiar la base a dev
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Recepción / SuperAdmin | `/recepcion/caja` → pestaña **Kiosco** | Venta con carrito, total y medio de pago (efectivo o transferencia) |
| SuperAdmin | `/admin/productos` | Alta, ingreso de mercadería, edición (precio y corrección de stock), baja y reactivación |

## Reglas

- **Productos: solo el SuperAdmin** (decisión del dueño, 11/11/2026). Ya lo garantiza la política `productos_write`; recepción solo lee y vende.
- **Stock:** no deja vender más de lo disponible. Si otra venta simultánea dejó sin stock un producto, la venta entera se rechaza y la pantalla avisa cuál.
- **Efectivo** va al turno de caja; **transferencia** no entra en la caja pero sí en el dashboard.
- Cada venta guarda el precio del momento (`venta_items.precio_unitario`).
- **Baja lógica** (`activo = false`): el producto deja de aparecer en el kiosco y se conservan sus ventas.
- **Ingreso de mercadería** con `cargar_stock` (suma en una sola operación); **Editar** pisa el stock y es solo para corregir recuentos.
- Arqueo ciego (RNF01): recepción no ve totales del turno.

## Cambios en la base

| Migración | Qué agrega |
|-----------|-----------|
| `20261111_01_a3_cargar_stock.sql` | `cargar_stock(producto, cantidad)`, solo SuperAdmin |

También incorporada en `supabase/schema.sql` (sección 19.14). `registrar_venta` y la tabla `productos` ya existían.
