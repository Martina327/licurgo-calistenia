// Etiquetas de estado compartidas (Mostrador, Alumnos, etc.)
//   · EtiquetaCuota  → estado_membresia de v_membresias
//   · EtiquetaAlumno → estado_alumno de v_membresias

const COLOR_CUOTA = {
  'Al día': 'bg-emerald-950 text-emerald-300',
  'Por vencer': 'bg-amber-950 text-amber-300',
  Vencida: 'bg-red-950 text-red-300',
  'Sin membresía': 'bg-neutral-800 text-neutral-300',
  'Pase libre': 'bg-sky-950 text-sky-300',
}

const COLOR_ALUMNO = {
  Activo: 'bg-emerald-950 text-emerald-300',
  'En clase de prueba': 'bg-sky-950 text-sky-300',
  Inactivo: 'bg-neutral-800 text-neutral-400',
}

const base = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs'

export function EtiquetaCuota({ estado }) {
  return <span className={`${base} ${COLOR_CUOTA[estado] ?? COLOR_CUOTA['Sin membresía']}`}>{estado}</span>
}

export function EtiquetaAlumno({ estado }) {
  return <span className={`${base} ${COLOR_ALUMNO[estado] ?? COLOR_ALUMNO.Inactivo}`}>{estado}</span>
}

// Una sola etiqueta para la lista de Alumnos: junta el estado del alumno y el de su cuota.
//   Pase libre · Clase de prueba · Inactivo · Vencida · Por vencer · Al día
const COLOR_UNICO = {
  'Pase libre': 'bg-sky-950 text-sky-300',
  'Clase de prueba': 'bg-sky-950 text-sky-300',
  Inactivo: 'bg-neutral-800 text-neutral-400',
  Vencida: 'bg-red-950 text-red-300',
  'Por vencer': 'bg-amber-950 text-amber-300',
  'Al día': 'bg-emerald-950 text-emerald-300',
}
export const estadoUnico = (a) =>
  a.pase_libre ? 'Pase libre'
  : a.estado_alumno === 'En clase de prueba' ? 'Clase de prueba'
  : a.estado_alumno === 'Inactivo' ? 'Inactivo'
  : a.estado_membresia === 'Vencida' ? 'Vencida'
  : a.estado_membresia === 'Por vencer' ? 'Por vencer'
  : 'Al día'

export function EtiquetaUnica({ alumno }) {
  const e = estadoUnico(alumno)
  return <span className={`${base} ${COLOR_UNICO[e]}`}>{e}</span>
}
