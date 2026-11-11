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

### Iteración 3: segunda ronda de pruebas con el coach
```
dev
 └── feature/b1-iteracion-3                 ← integración
      ├── feature/b1-buscador-alumnos        #13
      ├── feature/b1-estiramientos           #14
      └── feature/b1-plantillas-niveles      (este PR)
```

## Funcionalidades

| Rol | Pantalla | Qué hace |
|-----|----------|----------|
| Coach / SuperAdmin | `/coach/ejercicios` | Catálogo: alta, edición y baja lógica. Nombre, categoría y **descripción** (la ve el alumno en ⓘ). Sin video ni progresión: se enseñan en persona |
| Coach / SuperAdmin | `/coach` | Alumnos con buscador (nombre, apellido o DNI) y filtro por estado (por defecto **Al día**) |
| Coach / SuperAdmin | `/coach/alumnos/:id/rutina` | Arma la rutina activa por días y secciones (CU09). Muestra las observaciones vigentes del alumno. Menús para pegar plantillas, copiar/pegar y guardar como plantilla en tres niveles: sección, día y planificación |
| Coach / SuperAdmin | `/coach/alumnos/:id/observaciones` | Observaciones privadas del alumno: lesiones, movilidad, etc. Alta, edición, marcar resuelta (CU10) |
| Coach / SuperAdmin | `/coach/plantillas` | Plantillas de **planificación** (ej. *Fuerza básica*), de **día** (ej. *Tren superior*) y de **sección** (ej. *Calentamiento piernas*, *Estiramiento tren superior*) |
| Alumno | `/alumno/rutina` | Rutina del día con checklist (CU11). Cada sección con su color. **Un tilde** por ejercicio suelto, **uno para toda la Entrada en calor**, **uno para todos los Estiramientos** y **uno por bi-serie/tri-serie**. Barra de progreso fija arriba (un tramo por tilde, del color de su sección). ⓘ con descripción y observación del coach |

## Reglas

- **Secciones del día**: Entrada en calor → Fuerza → Accesorios → Estiramientos.
- **Descanso**: el coach lo carga en `seg` o `min`; en la base siempre son segundos. Si lo deja vacío, el alumno ve **"Largá con el ¡VAMOS!"** (el crono del gimnasio). **Entrada en calor y Estiramientos no llevan descanso** (ni bi-series): el editor no muestra la columna y el alumno no ve nada.
- **Bi-serie**: 2 o más ejercicios seguidos del mismo bloque que se hacen sin descanso entre ellos.
  - Se descansa al terminar el último.
  - Comparten las mismas series.
  - El alumno los ve en un recuadro violeta con un aviso automático.
  - En la base comparten `rutina_items.grupo`.
- **Plantillas y copiar/pegar por nivel**: lo que se pega es una base editable y no se guarda hasta tocar *Guardar*. La plantilla original no cambia.
  - **Sección** (menú *⋯ Sección* de cada bloque): reemplaza solo esa sección del día. Lo copiado de una sección se pega en la misma sección (un calentamiento en un calentamiento).
  - **Día** (menú *⋯ Día*): reemplaza solo ese día; los demás no cambian.
  - **Planificación** (menú *☰ Planificación*, arriba de los días): pega todos los días. Si ya hay ejercicios, el coach elige *Agregar sus días al final* o *Reemplazar todos los días*. Desde el mismo menú se agrega un día (plantilla o copiado) al final. Máximo 7 días.
  - Copiar guarda la copia en el navegador del coach, una por nivel: copiar un día no pisa una planificación copiada.
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
| `20261111_01_b1_bloque_estiramientos` | Enum `bloque_ejercicio` + `Estiramientos` (va sola: regla de Postgres con enums) |
| `20261111_02_b1_sin_descanso_calentamiento` | `guardar_rutina` limpia descanso y bi-serie en Entrada en calor y Estiramientos; ejercicios de estiramiento |
| `20261111_03_b1_plantillas_por_nivel` | Plantillas por nivel (Planificación / Día / Sección + columna `bloque`) y plantillas de ejemplo |

## Código compartido

- `src/lib/rutinas.js`: lógica pura de rutinas (base ⇄ editor ⇄ payload, descanso, bi-series, calentamiento, validación)
- `src/lib/portapapeles.js`: copiar/pegar por nivel (localStorage)
- `src/lib/filtroAlumnos.js`: buscador y filtro de alumnos del coach
- `src/lib/checklist.js`: checklist diario del alumno (localStorage)
- `src/components/rutinas/EditorRutina.jsx`: editor por días y bloques (rutina del alumno y plantillas)
