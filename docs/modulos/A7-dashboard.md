# A7 · Dashboard de ingresos

**Pareja A** · CU12 · RF07 · RF14 · RNF01 · RNF05

## Rama

```
feature/a6-personal
 └── feature/a7-dashboard   → PR a feature/a6-personal; al mergear A6, cambiar la base a dev
```

## Pantalla `/admin` (Ingresos) · solo SuperAdmin

| Parte | Qué muestra |
|-------|-------------|
| Aviso de cierres (A5) | Cierres de caja con diferencia sin revisar |
| Selector de rango | Hoy · Semana en curso (desde el lunes) · Mes actual · Mes anterior · Personalizado |
| Total del período | Suma de todos los ingresos; aclara cuánto efectivo cobró el dueño fuera de la caja |
| Tarjetas | Cuotas, Kiosco y Subalquileres: total, % del total, cantidad de cobros, efectivo y transferencia |
| Ingresos por día | Barras apiladas por concepto, un día por barra (incluye días sin ingresos) |
| Movimientos | Cada ingreso: fecha y hora, concepto, alumno o detalle, medio, quién cobró y monto; filtro por concepto; **Descargar CSV** (separado por `;`, abre bien en Sheets y Excel) |
| Cierres de caja | Historial del período: recepcionista, esperado, contado, diferencia, justificación y si falta revisar |
| Planilla | **Abrir planilla** de Google Sheets en otra pestaña; si no hay link, **Cargar link de la planilla** |

## Seguridad (RNF01 · RNF05)

- La ruta `/admin` es solo para SuperAdmin.
- Además, en la base: `v_movimientos`, `v_cierres_caja` y `configuracion_admin` no devuelven filas a otros roles, y el link se guarda solo con `guardar_planilla_url` (SuperAdmin, `https://` obligatorio).
- Probado en Postgres local: recepción y coach ven 0 filas y no pueden guardar el link.

## Cambios en la base

| Migración | Qué agrega |
|-----------|-----------|
| `20261112_03_a7_dashboard.sql` | `v_movimientos`, `configuracion_admin` (una fila, link de la planilla) y `guardar_planilla_url` |

También incorporada en `supabase/schema.sql` (sección 19.21).
