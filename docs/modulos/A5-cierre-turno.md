# A5 · Cierre de turno

**Pareja A** · Caso de uso: CU05 · RF08 · RNF01

## Rama

```
feature/a4-subalquiler
 └── feature/a5-cierre-turno   → PR a feature/a4-subalquiler; al mergear A4, cambiar la base a dev
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Recepcionista | `/recepcion/caja` → **Cerrar turno** | Arqueo ciego: carga el efectivo contado, confirma y ve solo si cierra justo, sobra o falta (y cuánto) |
| Recepcionista | Resultado del cierre | Si hay diferencia, la justifica (una sola vez) |
| SuperAdmin | `/admin` (Ingresos) | Aviso de cierres con diferencia sin revisar, con todos los montos y la justificación; **Marcar revisado** |

## Reglas

- **Arqueo ciego (RNF01):** mientras el turno está abierto no se muestra cuánto debería haber. La recepcionista cuenta y carga el monto; recién al cerrar el sistema calcula el esperado.
- **Esperado = efectivo inicial + todo lo cobrado en efectivo en el turno** (cuotas, kiosco y subalquiler). Las transferencias no cuentan.
- **Diferencia = contado − esperado.** Positiva: sobra; negativa: falta.
- **Turno cerrado sin edición posterior:** la tabla no admite UPDATE desde el front; la única excepción es `justificar_cierre`, que deja agregar el motivo una sola vez y solo si hay diferencia.
- Después del cierre se puede abrir un turno nuevo.
- El SuperAdmin ve todos los cierres (turnos_select); el listado de cierres para el dueño va en A7.

## Cambios en la base

Ninguno: `cerrar_turno` y `justificar_cierre` ya existían. Se probó en Postgres local que solo suma el efectivo del turno y que la justificación no se puede repetir.

## Caja de recepción y cobros del dueño (migración 20261111_03)

Decisión del 11/11/2026:

| | Recepcionista | Dueño (SuperAdmin) |
|---|---|---|
| Menú | **Caja** | **Cobros** |
| Turno y cierre | Sí (obligatorio para efectivo) | No |
| Cuota | Efectivo | Efectivo o transferencia |
| Kiosco | Sí | No |
| Subalquiler | Efectivo o transferencia | Efectivo o transferencia |

- El efectivo que cobra el dueño queda **sin turno** (`turno_id` NULL): no altera ningún arqueo. Detalle: "Cuota - Efectivo (cobrada por el dueño)".
- `chk_caja` pasa a ser: la transferencia nunca tiene turno; el efectivo puede no tenerlo.
- `_turno_abierto()` devuelve NULL para el dueño; `abrir_turno`, `cerrar_turno`, `justificar_cierre` y `registrar_venta` quedan solo para Recepcionista.
- Nueva `registrar_pago_cuota(alumno, medio)`; `registrar_pago_efectivo` queda como atajo. La cuota por transferencia anotada a mano es solo del dueño: las de los alumnos siguen por comprobante (B4/B5).

## Qué ve cada uno al cerrar (opción B, migración 20261112_02)

Decisión del 12/11/2026:

- **Recepcionista:** solo "La caja cierra justo", "Sobran $X" o "Faltan $X". `cerrar_turno` ya no devuelve el efectivo cobrado ni el esperado.
  (Como sabe cuánto contó, podría deducir el esperado sumando la diferencia; ocultarlo del todo sería la opción C.)
- **Dueño:** aviso dentro de la app, arriba de Ingresos, con cada cierre con diferencia (quién, cuándo, inicial, cobrado, esperado, contado y justificación) hasta que lo marca **revisado** (`marcar_cierre_revisado`, vista `v_cierres_caja`).
- **Mejora futura:** aviso por mail al dueño (requiere un servicio de envío de mails y una Edge Function).

Diagrama: `img/diagrama-estados-turno.png`.
