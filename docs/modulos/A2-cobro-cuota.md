# A2 · Cobro de cuota en efectivo

**Pareja A** · Caso de uso: CU06 · RF04

## Rama

```
feature/a1-alumnos
 └── feature/a2-cobro-cuota   → PR a dev (después del merge de A1)
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Recepción / SuperAdmin | `/recepcion/caja` | Abrir el turno de caja con el efectivo inicial |
| Recepción / SuperAdmin | `/recepcion/caja` → **Cobrar cuota** | Buscar alumno, ver importe y vencimiento nuevo, confirmar el cobro |
| Recepción / SuperAdmin | `/recepcion/caja` → primer pago | Completar la ficha del alumno antes de cobrar |

## Reglas

- **Sin turno abierto no se cobra en efectivo.** Un turno abierto por recepcionista. El turno se cierra en A5.
- **Vencimiento:** cada cuota suma +30 días al vencimiento actual (pague antes o hasta 30 días tarde).
- **Primer pago o alumno inactivo** (vencido hace más de 30 días): los 30 días cuentan desde el día que paga.
- **Primer pago:** la ficha tiene que estar completa (regla de A1). El alumno pasa de clase de prueba a Activo.
- **Arqueo ciego (RNF01):** recepción no ve totales del turno. Solo el SuperAdmin ve los ingresos.
- Las reglas de vencimiento valen también para las transferencias (B5 · CU08), porque `aprobar_comprobante` usa la misma `_extender_membresia`.

Diagrama: `img/diagrama-actividad-cobro.png`.

## Cambios en la base

| Migración | Qué agrega |
|-----------|-----------|
| `20261108_01_a2_reinicio_inactivos.sql` | `_extender_membresia`: el inactivo que vuelve arranca 30 días desde que paga |

También incorporada en `supabase/schema.sql` (sección 19.10). El resto (`abrir_turno`, `registrar_pago_efectivo`) ya existía.

## Mantenimiento

**Cambiar el precio de la cuota** (lo hace el equipo, no hay pantalla):

- Supabase → **Table Editor** → tabla `planes` → editar la columna `precio` de la fila "Plan mensual" → **Save**.
- O en el SQL Editor: `update public.planes set precio = 70000 where nombre = 'Plan mensual';`

Vale desde el próximo cobro; los cobros ya registrados conservan su monto. No borrar la fila ni cambiar su `id`.
