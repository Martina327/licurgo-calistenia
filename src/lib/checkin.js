// ---------------------------------------------------------------
// Check-in en recepción (B6 · CU03 · RF11)
// Lógica sin pantalla: buscar al alumno y decidir qué avisar al marcar el presente.
// La cuota vencida NO bloquea: se avisa y se registra igual.
// ---------------------------------------------------------------
import { normalizar } from './filtroAlumnos.js'

const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '')

const esConsultaDni = (consulta) => soloDigitos(consulta).length > 0 && /^[\d.\s]+$/.test(String(consulta ?? '').trim())

// Mínimo para empezar a buscar: 3 números de DNI o 2 letras de nombre.
// Devuelve el texto de ayuda si todavía falta escribir, o null si ya se puede buscar.
export function faltaParaBuscar(consulta) {
  if (!String(consulta ?? '').trim()) return null
  if (esConsultaDni(consulta)) return soloDigitos(consulta).length < 3 ? 'Escribí al menos 3 números del DNI.' : null
  return normalizar(consulta).length < 2 ? 'Escribí al menos 2 letras del nombre.' : null
}

// Busca por DNI (con o sin puntos) o por nombre/apellido (sin importar tildes ni el orden).
// Orden: DNI exacto → DNI que empieza igual → apellido/nombre que empieza igual → resto.
export function buscarParaCheckin(alumnos, consulta, limite = 6) {
  const q = normalizar(consulta)
  const digitos = soloDigitos(consulta)
  const esDni = esConsultaDni(consulta)
  // Sin nada escrito no muestra a nadie: la lista aparece solo al buscar
  if (!String(consulta ?? '').trim() || faltaParaBuscar(consulta)) return []

  const palabras = q.split(/\s+/).filter(Boolean)
  const puntaje = (a) => {
    if (esDni) {
      const dni = soloDigitos(a.dni)
      if (dni === digitos) return 0
      if (dni.startsWith(digitos)) return 1
      return dni.includes(digitos) ? 2 : null
    }
    const nombre = normalizar(`${a.nombre} ${a.apellido}`)
    if (!palabras.every((p) => nombre.includes(p))) return null
    const empieza = [normalizar(a.apellido), normalizar(a.nombre)].some((t) => t.startsWith(palabras[0]))
    return empieza ? 3 : 4
  }
  return alumnos
    .map((a) => ({ a, p: puntaje(a) }))
    .filter((x) => x.p !== null)
    .sort((x, y) => x.p - y.p || x.a.apellido.localeCompare(y.a.apellido, 'es'))
    .slice(0, limite)
    .map((x) => x.a)
}

// Pase Libre (RF12) lo agrega Pareja A (A6). Mientras no exista la columna, se lee como falso.
export const tienePaseLibre = (a) => Boolean(a?.pase_libre ?? false)

// Qué mostrar para un alumno en el check-in:
//   tono: 'ok' (verde) · 'aviso' (amarillo) · 'alerta' (rojo) · 'info' (celeste)
export function situacionCheckin(a) {
  const dias = a.dias_restantes
  if (tienePaseLibre(a)) return { tono: 'ok', etiqueta: 'Pase libre', texto: 'Pase libre: cuenta como al día.' }
  if (a.estado_alumno === 'En clase de prueba') {
    return { tono: 'info', etiqueta: 'Clase de prueba', texto: 'Está en su clase de prueba (todavía no pagó ninguna cuota).' }
  }
  if (a.estado_membresia === 'Vencida') {
    const hace = Math.abs(dias)
    return {
      tono: 'alerta',
      etiqueta: a.estado_alumno === 'Inactivo' ? 'Inactivo' : 'Vencida',
      texto: `Cuota vencida hace ${hace} día${hace === 1 ? '' : 's'}. Puede entrenar igual: recordale pasar por caja.`,
    }
  }
  if (a.estado_membresia === 'Por vencer') {
    return {
      tono: 'aviso',
      etiqueta: 'Por vencer',
      texto: dias === 0 ? 'La cuota vence hoy.' : `La cuota vence en ${dias} día${dias === 1 ? '' : 's'}.`,
    }
  }
  return { tono: 'ok', etiqueta: 'Al día', texto: 'Cuota al día.' }
}

export const TONOS = {
  ok: { chip: 'bg-emerald-950 text-emerald-300', caja: 'border-emerald-800 bg-emerald-950/60 text-emerald-100' },
  aviso: { chip: 'bg-amber-950 text-amber-300', caja: 'border-amber-800 bg-amber-950/60 text-amber-100' },
  alerta: { chip: 'bg-red-950 text-red-300', caja: 'border-red-800 bg-red-950/60 text-red-100' },
  info: { chip: 'bg-sky-950 text-sky-300', caja: 'border-sky-800 bg-sky-950/60 text-sky-100' },
}

export const horaAR = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
