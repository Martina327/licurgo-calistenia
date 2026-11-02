# B1 · Catálogo de ejercicios y rutinas

**Pareja B** · Casos de uso: CU09 (diseñar rutina), CU11 (consultar rutina y checklist)

## Flujo de ramas

```
dev
 └── feature/estructura-base            (PR #1, base del front)
      └── feature/b1-catalogo-rutinas    ← rama de integración de la pareja B
           ├── feature/b1-catalogo-ejercicios   → PR a la rama de integración
           ├── feature/b1-armado-rutinas        → PR a la rama de integración
           └── feature/b1-rutina-alumno         → PR a la rama de integración
```

Cada funcionalidad se trabaja en su propia rama `feature/b1-*`, se revisa en un PR
contra `feature/b1-catalogo-rutinas` y, cuando las tres están integradas, se abre
un único PR de la rama de integración hacia `dev`.

## Funcionalidades

| Rama | Rol | Pantalla | Qué hace |
|------|-----|----------|----------|
| `feature/b1-catalogo-ejercicios` | Coach / SuperAdmin | `/coach/ejercicios` | Alta, edición y baja lógica de ejercicios; progresiones (prerrequisito) |
| `feature/b1-armado-rutinas` | Coach / SuperAdmin | `/coach/alumnos/:id/rutina` | Arma la rutina activa del alumno por días y bloques (CU09) |
| `feature/b1-rutina-alumno` | Alumno | `/alumno/rutina` | Ve su rutina del día y marca ejercicios en un checklist (CU11) |

## Cambios en la base

Las migraciones están en `supabase/migrations/` y también se incorporaron a
`supabase/schema.sql` para que el script completo siga siendo la fuente de verdad.
Sobre una base ya cargada se corren solo las migraciones, en orden.
