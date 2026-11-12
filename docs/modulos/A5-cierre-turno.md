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
| Recepción / SuperAdmin | `/recepcion/caja` → **Cerrar turno** | Arqueo ciego: carga el efectivo contado, confirma y ve el resultado del cierre |
| Recepción / SuperAdmin | Resultado del cierre | Si hay diferencia, la justifica (una sola vez) |

## Reglas

- **Arqueo ciego (RNF01):** mientras el turno está abierto no se muestra cuánto debería haber. La recepcionista cuenta y carga el monto; recién al cerrar el sistema calcula el esperado.
- **Esperado = efectivo inicial + todo lo cobrado en efectivo en el turno** (cuotas, kiosco y subalquiler). Las transferencias no cuentan.
- **Diferencia = contado − esperado.** Positiva: sobra; negativa: falta.
- **Turno cerrado sin edición posterior:** la tabla no admite UPDATE desde el front; la única excepción es `justificar_cierre`, que deja agregar el motivo una sola vez y solo si hay diferencia.
- Después del cierre se puede abrir un turno nuevo.
- El SuperAdmin ve todos los cierres (turnos_select); el listado de cierres para el dueño va en A7.

## Cambios en la base

Ninguno: `cerrar_turno` y `justificar_cierre` ya existían. Se probó en Postgres local que solo suma el efectivo del turno y que la justificación no se puede repetir.
