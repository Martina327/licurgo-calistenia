# A1 · Gestionar alumnos

**Pareja A** · Casos de uso: CU01 (gestionar alumnos) · también cubre el cambio de clave del CU02

## Rama

```
dev
 └── feature/a1-alumnos   → PR a dev
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Recepción / SuperAdmin | `/recepcion/alumnos` | Listado con estado del alumno y de la cuota, buscador (DNI con o sin puntos) y filtros |
| Recepción / SuperAdmin | `/recepcion/alumnos` → **+ Clase de prueba** | Alta con nombre, apellido, DNI, celular y email |
| Recepción / SuperAdmin | `/recepcion/alumnos` → **Editar** | Datos de contacto y ficha (nacimiento, domicilio, contacto de emergencia); baja lógica |
| Recepción / SuperAdmin | `/recepcion/alumnos` → **Dados de baja** | Reactivación |
| Alumno | `/cambiar-clave` | Cambio de clave obligatorio en el primer ingreso (la clave inicial es su DNI) |

## Reglas

- **Un solo plan mensual** ($60.000). Lo cambia el SuperAdmin.
- **Clase de prueba:** nombre, apellido, DNI, celular y email obligatorios.
- **Primer pago:** la ficha tiene que estar completa. La regla está en `_extender_membresia`, así vale para el pago en efectivo (CU06) y la transferencia aprobada (CU08).
- **Estados** (calculados en `v_membresias`): En clase de prueba → Activo → Inactivo. Ver `img/diagrama-estados-alumno.png`.
- **Baja lógica:** `usuarios.activo = false`. No se borra nada; el alumno no puede ingresar.
- La tabla `usuarios` ya no se edita directo desde el front: todo pasa por funciones.

## Cambios en la base

Sobre una base ya cargada se corren solo las migraciones, en orden. También están incorporadas en `supabase/schema.sql` (sección 19.9).

| Migración | Qué agrega |
|-----------|-----------|
| `20261107_01_a1_plan_unico_alta_alumnos.sql` | Plan único, `alta_clase_prueba`, `debe_cambiar_clave`, `marcar_clave_cambiada` |
| `20261107_02_a1_editar_baja_alumnos.sql` | `editar_alumno`, `dar_baja_alumno`, `reactivar_alumno`, `v_alumnos_baja`, protege `usuarios` |
| `20261107_03_a1_ficha_alumno.sql` | `domicilio`, email obligatorio en el alta, ficha completa al primer pago, `v_membresias` con `email`, `domicilio` y `datos_faltantes` (columnas al final) |

### Para la Pareja B

- `v_membresias` suma tres columnas **al final**: no cambia ninguna de las que ya usan.
- `_extender_membresia` (la usa `aprobar_comprobante`, CU08) ahora rechaza el **primer** pago si la ficha está incompleta, con el error `FICHA_INCOMPLETA`. Los pagos siguientes no cambian.
