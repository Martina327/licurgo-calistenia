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
| Recepción | `/recepcion/caja` → pestaña **Kiosco** | Buscador por nombre, productos en tarjetas (se tocan para sumarlos), panel **Venta actual** con − / +, total y medio de pago. En el celular, barra fija abajo con el total |
| SuperAdmin | `/admin/productos` | Buscador por nombre; filtros a la venta / stock bajo / dados de baja; stock con − / + y casilla editable; lápiz para editar nombre, precio y vencimiento; basurero para dar de baja; reactivación |

## Reglas

- **Productos: solo el SuperAdmin** (decisión del dueño, 11/11/2026). Ya lo garantiza la política `productos_write`; recepción solo lee y vende.
- **Stock:** no deja vender más de lo disponible. Si otra venta simultánea dejó sin stock un producto, la venta entera se rechaza y la pantalla avisa cuál.
- **Efectivo** va al turno de caja; **transferencia** no entra en la caja pero sí en el dashboard.
- Cada venta guarda el precio del momento (`venta_items.precio_unitario`).
- **Baja lógica** (`activo = false`): el producto deja de aparecer en el kiosco y se conservan sus ventas.
- **Stock con − / +** (Martina, 12/11/2026): cada toque suma o resta 1; en la casilla se escribe el número directo (ej. llegaron 20). Se guarda solo, un momento después del último toque, con `ajustar_stock`, que manda la **diferencia** y no el número final, así no pisa una venta simultánea. Nunca queda negativo.
- **Avisos:** stock en amarillo con **10 o menos** unidades, en rojo sin stock. Vencimiento (opcional) en amarillo si vence en 7 días o menos, en rojo si ya venció; en la venta el producto vencido se marca en rojo.
- Arqueo ciego (RNF01): recepción no ve totales del turno.

## Cambios en la base

| Migración | Qué agrega |
|-----------|-----------|
| `20261111_01_a3_cargar_stock.sql` | `cargar_stock(producto, cantidad)`, solo SuperAdmin |
| `20261112_04_kiosco_vencimiento_stock.sql` | `productos.vencimiento` (opcional) y `ajustar_stock(producto, delta)`, solo SuperAdmin |

También incorporadas en `supabase/schema.sql` (secciones 19.16 y 19.22). `registrar_venta` y la tabla `productos` ya existían.
