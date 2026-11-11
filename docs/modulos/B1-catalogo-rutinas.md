# B1 · Catálogo de ejercicios y rutinas

**Pareja B** · Casos de uso: CU09 (diseñar rutina), CU10 (observaciones del alumno), CU11 (consultar rutina y checklist)

## Flujo de ramas

Cada funcionalidad se trabaja en su propia rama `feature/b1-*` y se revisa en un PR
contra la rama de integración de la iteración. Cuando todas están integradas, se abre
un único PR de la rama de integración hacia `dev`.

### Iteración 1 (PR #5)
```
dev
 └── feature/b1-catalogo-rutinas            ← integración
      ├── feature/b1-catalogo-ejercicios     #2
      ├── feature/b1-armado-rutinas          #3
      └── feature/b1-rutina-alumno           #4
```

### Iteración 2: correcciones después de probar con el coach
```
dev
 └── feature/b1-iteracion-2                 ← integración
      ├── feature/b1-observaciones-coach     #8
      ├── feature/b1-info-descanso           #9
      ├── feature/b1-biseries                #10
      └── feature/b1-plantillas              #11
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Coach / SuperAdmin | `/coach/ejercicios` | Catálogo: alta, edición y baja lógica. Nombre, categoría y **descripción** (la ve el alumno en ⓘ). Sin video ni progresión: se enseñan en persona |
| Coach / SuperAdmin | `/coach/alumnos/:id/rutina` | Arma la rutina activa por días y bloques (CU09). Muestra las observaciones vigentes del alumno. Usar plantilla, copiar/pegar rutina entre alumnos, guardar como plantilla |
| Coach / SuperAdmin | `/coach/alumnos/:id/observaciones` | Observaciones privadas del alumno: lesiones, movilidad, etc. Alta, edición, marcar resuelta (CU10) |
| Coach / SuperAdmin | `/coach/plantillas` | Rutinas preestablecidas (ej. *Fuerza básica*) y el **calentamiento estándar** |
| Alumno | `/alumno/rutina` | Rutina del día con checklist. Cada ejercicio: nombre, series × reps, descanso y tilde; ⓘ con descripción y observación del coach (CU11) |

## Reglas

- **Descanso**: el coach lo carga en `seg` o `min`; en la base siempre son segundos. Si lo deja vacío, el alumno ve **"Largá con el ¡VAMOS!"** (el crono del gimnasio). En la entrada en calor, si está vacío no se muestra nada.
- **Bi-serie**: 2 o más ejercicios seguidos del mismo bloque que se hacen sin descanso entre ellos.
  - Se descansa al terminar el último.
  - Comparten las mismas series.
  - El alumno los ve en un recuadro violeta con un aviso automático.
  - En la base comparten `rutina_items.grupo`.
- **Calentamiento estándar**:
  - Se carga solo en la Entrada en calor de cada día nuevo, y al usar una plantilla en los días que no traen calentamiento.
  - Se puede modificar en cada rutina.
- **Plantillas y copiar/pegar**:
  - Lo que se carga es una base editable que no se guarda hasta tocar *Guardar*.
  - La plantilla original no cambia.
  - Copiar guarda la rutina en el navegador del coach.
- **Observación del coach** (por ejercicio, en la rutina): la ve el alumno tocando ⓘ.
- **Observaciones del alumno** (lesiones, etc.): **privadas**, solo Coach y SuperAdmin.

## Cambios en la base

Las migraciones están en `supabase/migrations/` y también se incorporaron a
`supabase/schema.sql`, para que el script completo siga siendo la fuente de verdad.
Sobre una base ya cargada se corren solo las migraciones, en orden:

| Migración | Qué hace |
|-----------|----------|
| `20261102_01_b1_progresiones_sin_ciclos` | Trigger anti-ciclos de progresiones |
| `20261102_02_b1_guardar_rutina` | RPC `guardar_rutina` (transacción única) |
| `20261110_01_b1_vista_rutina_descripcion` | `v_rutina_alumno` + descripción del ejercicio |
| `20261110_02_b1_biseries` | `rutina_items.grupo`, bi-series en `guardar_rutina` y en la vista |
| `20261110_03_b1_plantillas` | Tabla `rutinas_plantilla`, ejercicios de calentamiento y plantillas iniciales |

## Código compartido

- `src/lib/rutinas.js`: lógica pura de rutinas (base ⇄ editor ⇄ payload, descanso, bi-series, calentamiento, validación)
- `src/lib/portapapeles.js`: copiar/pegar rutinas (localStorage)
- `src/lib/checklist.js`: checklist diario del alumno (localStorage)
- `src/components/rutinas/EditorRutina.jsx`: editor por días y bloques (rutina del alumno y plantillas)
