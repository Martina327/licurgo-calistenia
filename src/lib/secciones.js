// Color e ícono de cada sección del día, compartidos por la vista del alumno y la del coach.
// Las clases van completas: Tailwind no reconoce nombres armados con variables.
export const SECCION = {
  'Entrada en calor': {
    icono: '🔥', titulo: 'Entrada en calor', panel: 'border-orange-500/30 bg-orange-500/[0.07]',
    chip: 'bg-orange-500/20 text-orange-200', numero: 'text-orange-300', tramo: 'bg-orange-400',
  },
  Fuerza: {
    icono: '💪', titulo: 'Fuerza', panel: 'border-sky-500/30 bg-sky-500/[0.07]',
    chip: 'bg-sky-500/20 text-sky-200', numero: 'text-sky-300', tramo: 'bg-sky-400',
  },
  Accesorios: {
    icono: '🏋️', titulo: 'Accesorios', panel: 'border-indigo-500/30 bg-indigo-500/[0.07]',
    chip: 'bg-indigo-500/20 text-indigo-200', numero: 'text-indigo-300', tramo: 'bg-indigo-400',
  },
  Estiramientos: {
    icono: '🧘', titulo: 'Estiramientos', panel: 'border-teal-500/30 bg-teal-500/[0.07]',
    chip: 'bg-teal-500/20 text-teal-200', numero: 'text-teal-300', tramo: 'bg-teal-400',
  },
}

// Bi-series / tri-series (en las dos vistas)
export const CADENA = {
  caja: 'border-fuchsia-500/50 bg-fuchsia-500/[0.08]', etiqueta: 'bg-fuchsia-500 text-white', texto: 'text-fuchsia-200',
}

// Estado de la membresía en el panel del coach
export const COLOR_ESTADO = {
  'Al día': 'bg-emerald-500/15 text-emerald-300',
  'Por vencer': 'bg-amber-500/15 text-amber-300',
  Vencida: 'bg-red-500/15 text-red-300',
  'Clase de prueba': 'bg-sky-500/15 text-sky-300',
  Inactivo: 'bg-neutral-700/60 text-neutral-300',
}

// Etiqueta de estado del alumno para el panel del coach
export const etiquetaEstado = (a) =>
  a.estado_alumno === 'Inactivo' ? 'Inactivo' : a.estado_alumno === 'En clase de prueba' ? 'Clase de prueba' : a.estado_membresia
export const estiloSeccion = (bloque) => SECCION[bloque] ?? SECCION.Fuerza
