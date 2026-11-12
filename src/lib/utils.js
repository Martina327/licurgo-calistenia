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

// Fecha de hoy en Argentina como 'YYYY-MM-DD' (misma idea que public.hoy_ar() en la base)
export const hoyAR = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

// Enums de la base (public.categoria_ejercicio y public.bloque_ejercicio).
// Si cambian en schema.sql, actualizar acá también.
export const CATEGORIAS_EJERCICIO = ['Tracción', 'Empuje', 'Core', 'Piernas', 'Movilidad', 'Skill']
export const BLOQUES_EJERCICIO = ['Entrada en calor', 'Fuerza', 'Accesorios', 'Estiramientos']

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
  ALUMNO_REQUERIDO: 'Elegí un alumno.',
  SIN_TURNO_ABIERTO: 'Abrí un turno de caja para cobrar en efectivo.',
  TURNO_YA_ABIERTO: 'Ya tenés un turno de caja abierto.',
  STOCK_INSUFICIENTE: 'No hay stock suficiente de uno de los productos.',
  COMPROBANTE_YA_REVISADO: 'Ese comprobante ya fue revisado.',
  SIN_PLAN: 'El alumno no tiene un plan asignado.',
  MOTIVO_REQUERIDO: 'Indicá el motivo del rechazo.',
  MONTO_INVALIDO: 'El monto tiene que ser mayor a 0.',
  SIN_MONTO: 'El alumno no tiene plan: indicá el monto a acreditar.',
  COMPROBANTE_INEXISTENTE: 'No encontramos ese comprobante.',
  COMPROBANTE_INEXISTENTE_O_YA_REVISADO: 'Ese comprobante ya fue revisado por otra persona.',
  ALUMNO_INEXISTENTE: 'No encontramos a ese alumno (puede estar dado de baja).',
  RUTINA_INVALIDA: 'Revisá la rutina: falta el nombre o algún dato de un ejercicio.',
  RUTINA_SIN_DIAS: 'La rutina tiene que tener entre 1 y 7 días.',
  DIA_VACIO: 'Cada día necesita al menos un ejercicio.',
  RUTINA_NO_ENCONTRADA: 'Esa rutina ya no está activa (alguien la cambió). Recargá la pantalla.',
  BISERIE_INVALIDA: 'Una bi-serie necesita 2 o más ejercicios seguidos del mismo bloque.',
  PROGRESION_CICLICA: 'Esa progresión formaría un círculo: el ejercicio elegido ya depende de este.',
  DNI_INVALIDO: 'El DNI tiene que tener 7 u 8 números, sin puntos.',
  DATOS_REQUERIDOS: 'Completá nombre y apellido.',
  CELULAR_INVALIDO: 'Revisá el celular: código de área y número, sin el 0 ni el 15.',
  DNI_EXISTENTE: 'Ya hay un alumno o integrante del staff con ese DNI.',
  DNI_DADO_DE_BAJA: 'Ese DNI pertenece a alguien dado de baja. Buscalo en "Dados de baja" y reactivalo.',
  EMAIL_INVALIDO: 'Revisá el email.',
  EMAIL_REQUERIDO: 'El email es obligatorio.',
  FICHA_INCOMPLETA: 'Falta completar la ficha del alumno (fecha de nacimiento, domicilio y contacto de emergencia) antes de cobrar la primera cuota.',
  FECHA_NACIMIENTO_INVALIDA: 'Revisá la fecha de nacimiento.',
}
export const mensajeError = (error) => {
  if (!error) return ''
  const codigo = String(error.message ?? '').split(':')[0].trim()
  return MENSAJES[codigo] ?? error.message ?? 'Ocurrió un error inesperado.'
}

// Mensajes armados para WhatsApp: recepción los abre con un toque y los envía a mano (sin costo).
export const MENSAJES_WHATSAPP = {
  vencimiento: (nombre, dias) =>
    dias < 0
      ? `Hola ${nombre}, te escribimos de Licurgo Calistenia. Tu cuota venció hace ${Math.abs(dias)} día(s). Podés abonarla en recepción o subir el comprobante de transferencia en la app.`
      : `Hola ${nombre}, te escribimos de Licurgo Calistenia. Tu cuota vence ${dias === 0 ? 'hoy' : `en ${dias} día(s)`}. Podés abonarla en recepción o subir el comprobante de transferencia en la app.`,
  certificado: (nombre) =>
    `Hola ${nombre}, te escribimos de Licurgo Calistenia. Necesitamos que cargues tu certificado de aptitud física actualizado.`,
  'Clase de prueba': (nombre) =>
    `Hola ${nombre}, ¿cómo estás? Hace unos días viniste a tu clase de prueba en Licurgo Calistenia. ¡Nos encantaría verte de nuevo! Si querés empezar, pasá por recepción y te dejamos todo listo.`,
  Inactivo: (nombre) =>
    `Hola ${nombre}, ¿cómo estás? Hace un tiempo que no te vemos por Licurgo Calistenia. ¡Te esperamos para retomar los entrenamientos! Cualquier consulta, escribinos.`,
}
