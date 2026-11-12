// Buscador y filtro de alumnos del panel del coach. Funciones puras.

// Filtros por estado (v_membresias: estado_alumno y estado_membresia)
export const FILTROS_ALUMNOS = [
  { id: 'al-dia', texto: 'Al día', cumple: (a) => a.estado_alumno === 'Activo' && ['Al día', 'Por vencer'].includes(a.estado_membresia) },
  { id: 'vencidos', texto: 'Cuota vencida', cumple: (a) => a.estado_alumno === 'Activo' && a.estado_membresia === 'Vencida' },
  { id: 'prueba', texto: 'Clase de prueba', cumple: (a) => a.estado_alumno === 'En clase de prueba' },
  { id: 'inactivos', texto: 'Inactivos', cumple: (a) => a.estado_alumno === 'Inactivo' },
  { id: 'todos', texto: 'Todos', cumple: () => true },
]
export const FILTRO_INICIAL = 'al-dia'

// Minúsculas y sin tildes: "Lucía" coincide con "lucia"
export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Cada palabra buscada tiene que estar en el nombre, el apellido o el DNI ("gomez luc" encuentra a Lucía Gómez)
export function coincide(alumno, busqueda) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const texto = normalizar(`${alumno.nombre} ${alumno.apellido} ${alumno.dni ?? ''}`)
  return palabras.every((p) => texto.includes(p.replace(/\./g, '')))
}

export function filtrarAlumnos(alumnos, filtroId, busqueda) {
  const filtro = FILTROS_ALUMNOS.find((f) => f.id === filtroId) ?? FILTROS_ALUMNOS[0]
  return alumnos.filter((a) => filtro.cumple(a) && coincide(a, busqueda))
}

export const contarPorFiltro = (alumnos, busqueda) =>
  Object.fromEntries(FILTROS_ALUMNOS.map((f) => [f.id, filtrarAlumnos(alumnos, f.id, busqueda).length]))
