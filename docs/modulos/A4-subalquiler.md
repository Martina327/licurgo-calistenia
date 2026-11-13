# A4 · Cobro de subalquiler

**Pareja A** · Caso de uso: CU16 · RF06

## Rama

```
feature/a3-kiosco
 └── feature/a4-subalquiler   → PR a feature/a3-kiosco; al mergear A3, cambiar la base a dev
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| SuperAdmin | `/admin/salones` | Alta de salones, precio por hora y mensual (opcional), edición, baja y reactivación |
| Recepción / SuperAdmin | `/recepcion/caja` → pestaña **Subalquiler** | Cobro por hora o mensual, quién alquila, efectivo o transferencia |

## Reglas (decisiones del 11/11/2026)

- **Salones: solo el SuperAdmin.** Precio por hora (hoy $15.000) y precio mensual opcional.
- **Promos y aumentos:** el dueño cambia el precio del salón y lo vuelve a su valor cuando termina la promo.
- **El monto lo calcula la base** (horas × precio por hora, o precio mensual). Recepción no lo puede modificar.
  Si en el futuro hace falta que recepción ajuste el precio (promos por horario), se agrega un monto editable con motivo obligatorio.
- **Por hora:** de 0,5 a 24 horas, en medias horas. **Mensual:** se elige el mes que paga.
- **Quién alquila** se escribe en cada cobro (nombre obligatorio, celular opcional).
- Efectivo va al turno de caja; transferencia solo al dashboard.
- El detalle del ingreso queda armado, ej.: `Salón funcional · Por hora · 1,5 h × $15.000 · Ana Pérez · 3815551234`.

## Cambios en la base

| Migración | Qué agrega |
|-----------|-----------|
| `20261111_02_a4_salones.sql` | `espacios_alquiler` pasa a ser el catálogo de salones (`precio_hora`, `precio_mensual`; se quitan `locatario` y `canon_sugerido`); nueva `registrar_cobro_alquiler` con modalidad |

También incorporada en `supabase/schema.sql` (sección 19.15).
