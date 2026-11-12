// ---------------------------------------------------------------
// Métricas de concurrencia (B7 · CU13)
// Arma, a partir de metricas_concurrencia(), el mapa de franjas y el resumen.
// ---------------------------------------------------------------

export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] // isodow 1..7
export const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const HORA_DESDE = 8 // CU13: franjas de 8:00 a 22:00
export const HORA_HASTA = 22

export const RANGOS = [
  { id: 7, texto: '7 días' },
  { id: 30, texto: '30 días' },
  { id: 90, texto: '90 días' },
]

// 'YYYY-MM-DD' de hace n días (contando hoy como el día 1 del rango)
export function desdeHace(n, hoy) {
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (n - 1))
  return d.toISOString().slice(0, 10)
}

// Matriz [hora][día] con el promedio de alumnos. Las asistencias fuera de 8–22 se suman
// a la primera o última franja para no perderlas.
export function matrizFranjas(franjas, desde = HORA_DESDE, hasta = HORA_HASTA) {
  const horas = Array.from({ length: hasta - desde }, (_, i) => desde + i)
  const celdas = horas.map(() => Array(7).fill(0))
  const totales = horas.map(() => Array(7).fill(0))
  for (const f of franjas ?? []) {
    const fila = Math.min(Math.max(f.hora, desde), hasta - 1) - desde
    celdas[fila][f.dia - 1] += Number(f.promedio)
    totales[fila][f.dia - 1] += Number(f.total)
  }
  const maximo = Math.max(0, ...celdas.flat())
  return { horas, celdas, totales, maximo }
}

// Intensidad 0..1 para el color de la celda (escala lineal sobre el máximo)
export const intensidad = (valor, maximo) => (maximo > 0 ? valor / maximo : 0)

export function resumen(m) {
  if (!m) return null
  const promedioDiario = m.dias_con_asistencia ? m.total / m.dias_con_asistencia : 0
  const dias = [...(m.por_dia_semana ?? [])].sort((a, b) => b.promedio - a.promedio)
  const pico = [...(m.franjas ?? [])].sort((a, b) => b.promedio - a.promedio || a.dia - b.dia)[0] ?? null
  return {
    total: m.total,
    promedioDiario: Math.round(promedioDiario * 10) / 10,
    diaTop: dias[0]?.promedio > 0 ? dias[0] : null,
    franjaPico: pico,
  }
}

export const textoFranja = (hora) => `${String(hora).padStart(2, '0')}–${String(hora + 1).padStart(2, '0')} h`

export const formatearDecimal = (n) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n ?? 0)
