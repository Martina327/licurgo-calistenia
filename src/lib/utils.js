// ---------------------------------------------------------------
// Utilidades compartidas
// ---------------------------------------------------------------

// Login con DNI: Supabase Auth necesita un email, así que cada cuenta
// tiene un email interno que el usuario nunca ve.
export const DOMINIO_LOGIN = 'licurgo.test'
export const dniAEmail = (dni) => `${String(dni).trim()}@${DOMINIO_LOGIN}`
export const esDniValido = (dni) => /^[0-9]{7,8}$/.test(String(dni).trim())

// Pantalla de inicio de cada rol (CU02)
export const INICIO_POR_ROL = {
  SuperAdmin: '/admin',
  Recepcionista: '/recepcion',
  Coach: '/coach',
  Alumno: '/alumno',
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date (evita el corrimiento de un día por zona horaria)
export const formatearFecha = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const formatearPesos = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

// Link de WhatsApp para contactar a un alumno (móvil argentino: 54 9 + característica + número)
export const linkWhatsApp = (telefono, texto = '') => {
  const numero = String(telefono ?? '').replace(/\D/g, '')
  if (!numero) return null
  return `https://wa.me/549${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

// Las funciones RPC devuelven errores con un código al inicio ("MEMBRESIA_VENCIDA: ...").
// Esto los traduce a un mensaje para mostrar en pantalla.
const MENSAJES = {
  PERMISO_DENEGADO: 'No tenés permiso para realizar esta acción.',
  MEMBRESIA_VENCIDA: 'Tu membresía está vencida. Acercate a recepción o subí tu comprobante.',
  SIN_TURNO_ABIERTO: 'Abrí un turno de caja para cobrar en efectivo.',
  TURNO_YA_ABIERTO: 'Ya tenés un turno de caja abierto.',
  STOCK_INSUFICIENTE: 'No hay stock suficiente de uno de los productos.',
  COMPROBANTE_YA_REVISADO: 'Ese comprobante ya fue revisado.',
  SIN_PLAN: 'El alumno no tiene un plan asignado.',
  MOTIVO_REQUERIDO: 'Indicá el motivo del rechazo.',
}
export const mensajeError = (error) => {
  if (!error) return ''
  const codigo = String(error.message ?? '').split(':')[0].trim()
  return MENSAJES[codigo] ?? error.message ?? 'Ocurrió un error inesperado.'
}
