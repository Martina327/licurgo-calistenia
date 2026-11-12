# A6 · Personal, Pase Libre e invitaciones

**Pareja A** · CU15 · RF12 · RNF05

## Rama

```
feature/a5-cierre-turno
 └── feature/a6-personal   → PR a feature/a5-cierre-turno; al mergear A5, cambiar la base a dev
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Todos | `/login` | Un solo campo **"DNI o email"**: alumnos con DNI, personal con email |
| SuperAdmin | `/admin/personal` | Alta de recepcionistas y coaches con email; clave provisoria (copiar o enviar por WhatsApp); editar; nueva clave; baja y reactivación |
| Personal nuevo | `/cambiar-clave` | Cambio obligatorio de la clave provisoria en el primer ingreso |
| Recepción / SuperAdmin | `/recepcion/alumnos` → Editar → **Pase libre** | Dar pase libre con motivo; filtro "Pase libre" en el listado |
| SuperAdmin | ídem | Quitar pase libre |

## Reglas (decisiones del 12/11/2026)

- **Personal:** lo da de alta **solo el dueño**. Entra con su **email real** y una **clave provisoria** de 10 caracteres que genera la base; se muestra una sola vez. En el primer ingreso tiene que cambiarla.
- El DNI del personal es **opcional**, así un profe puede tener también su cuenta de alumno (con DNI).
- No se puede dar de baja ni pasar a coach a una recepcionista con la **caja abierta**.
- El dueño no se edita ni se da de baja desde esta pantalla.
- **Pase libre:** lo pueden dar **el dueño y la recepcionista**, con motivo obligatorio (el profe, la persona que elija el profe…). **No vence**: lo **quita solo el dueño**. Queda registrado quién y cuándo (`pase_libre_por`, `pase_libre_at` y la tabla `pase_libre_historial`).
- Con pase libre el alumno cuenta como **Activo**: no aparece en alertas de cuota ni en invitaciones a retomar (el aviso de certificado sigue). En Caja no se le puede cobrar la cuota.
- **Invitaciones a retomar:** se excluyen los alumnos con pase libre (el resto ya estaba hecho).

## Cambios en la base

| Migración | Qué agrega |
|-----------|-----------|
| `20261112_01_a6_personal_pase_libre.sql` | `usuarios.dni` opcional para el staff; `alta_personal`, `editar_personal`, `cambiar_estado_personal`, `restablecer_clave_personal`, `v_personal`; columnas de pase libre en `alumnos`, `pase_libre_historial`, `asignar_pase_libre`, `quitar_pase_libre`; `v_membresias` con `pase_libre` y `pase_libre_motivo` al final; `v_alertas` sin pase libre |

También incorporada en `supabase/schema.sql` (sección 19.20).

### Para la Pareja B

- `v_membresias.pase_libre` ya existe (B6 lo leía con `?? false`).
- Un alumno con pase libre puede tener `estado_membresia` 'Vencida' o 'Sin membresía' (no se tocó ese valor para no romper sus pantallas). Conviene que **Mensualidad** del alumno muestre "Pase libre" cuando `pase_libre` es verdadero.
