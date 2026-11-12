// ---------------------------------------------------------------
// Comprobantes de transferencia (B4 · CU07 y B5 · CU08)
// Lógica sin pantalla: validar el archivo, armar la ruta en el bucket,
// calcular el vencimiento que va a quedar y los textos de cada estado.
// ---------------------------------------------------------------

export const BUCKET = 'comprobantes'
export const TAMANIO_MAXIMO = 5 * 1024 * 1024 // igual que el bucket (file_size_limit)
export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const ACEPTA = TIPOS_PERMITIDOS.join(',')

// Motivos habituales para rechazar: un toque y listo (se puede escribir otro)
export const MOTIVOS_RECHAZO = [
  'Monto incorrecto',
  'No se lee el comprobante',
  'Comprobante duplicado',
  'La transferencia no llegó a la cuenta',
  'No es un comprobante de transferencia',
]

// Devuelve el problema del archivo o null si está bien
export function validarArchivo(archivo) {
  if (!archivo) return 'Elegí la foto o el PDF del comprobante.'
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) return 'El comprobante tiene que ser una imagen (JPG, PNG o WEBP) o un PDF.'
  if (archivo.size > TAMANIO_MAXIMO) return 'El archivo pesa más de 5 MB. Probá con una captura de pantalla.'
  if (archivo.size === 0) return 'El archivo está vacío.'
  return null
}

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

// Ruta en el bucket privado: '<alumno_id>/<fecha-hora>-<aleatorio>.<ext>'
// La carpeta tiene que ser el id del alumno (lo exigen las políticas de Storage).
// No se usa el nombre original: puede traer espacios, tildes o datos personales.
export function rutaArchivo(alumnoId, archivo, ahora = new Date(), azar = Math.random) {
  const sello = ahora.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '') // 20261112T031500
  const sufijo = azar().toString(36).slice(2, 8).padEnd(6, '0')
  return `${alumnoId}/${sello}-${sufijo}.${EXTENSION[archivo.type] ?? 'bin'}`
}

export const esPDF = (ruta) => /\.pdf$/i.test(ruta ?? '')

const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Mismo cálculo que _extender_membresia (regla de Pareja A, A2), para mostrarlo ANTES de aprobar:
//   · primer pago (sin vencimiento)        → hoy + 30
//   · inactivo (vencido hace más de 30 d.) → hoy + 30
//   · el resto                             → vencimiento actual + 30
// La base calcula el definitivo; esto es solo la vista previa.
export function nuevoVencimiento(vencimientoActual, hoy) {
  if (!vencimientoActual || vencimientoActual < sumarDias(hoy, -30)) return sumarDias(hoy, 30)
  return sumarDias(vencimientoActual, 30)
}

// Estado del comprobante → texto y color para el alumno y para recepción
export const ESTADO_COMPROBANTE = {
  Pendiente: { texto: 'En revisión', clase: 'bg-amber-950 text-amber-300' },
  Aprobado: { texto: 'Aprobado', clase: 'bg-emerald-950 text-emerald-300' },
  Rechazado: { texto: 'Rechazado', clase: 'bg-red-950 text-red-300' },
}

// Qué muestra la tarjeta "Pagar por transferencia" del alumno según sus comprobantes (más nuevo primero)
//   'pendiente' → hay uno en revisión: no puede subir otro
//   'rechazado' → el último fue rechazado: ve el motivo y sube uno nuevo
//   'subir'     → puede subir
export function situacionComprobantes(comprobantes) {
  const ultimo = comprobantes?.[0]
  if (!ultimo) return { modo: 'subir', ultimo: null }
  if (ultimo.estado === 'Pendiente') return { modo: 'pendiente', ultimo }
  if (ultimo.estado === 'Rechazado') return { modo: 'rechazado', ultimo }
  return { modo: 'subir', ultimo }
}

// Monto que escribe el alumno o recepción: acepta "26.000", "26000", "26000,50"
export function leerMonto(texto) {
  const limpio = String(texto ?? '').trim().replace(/\$|\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN
}

// CBU: 22 números. Alias: 6 a 20 letras, números, puntos o guiones (reglas del BCRA)
export const esCbuValido = (cbu) => /^[0-9]{22}$/.test(cbu)
export const esAliasValido = (alias) => /^[A-Za-z0-9.-]{6,20}$/.test(alias)
export const esCuitValido = (cuit) => /^[0-9]{11}$/.test(cuit)
export const soloNumeros = (t) => String(t ?? '').replace(/\D/g, '')
