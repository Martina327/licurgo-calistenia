// ---------------------------------------------------------------
// Semana del alumno: qué días de la rutina ya completó (lunes a domingo)
// y qué día le toca hoy. Funciones puras; los datos vienen de la tabla
// dias_completados ({ numero_dia, fecha }).
// ---------------------------------------------------------------

// Lunes de la semana de una fecha 'YYYY-MM-DD' (también 'YYYY-MM-DD')
export function lunesDe(fecha) {
  const [a, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  const desdeLunes = (f.getUTCDay() + 6) % 7 // lunes = 0 … domingo = 6
  f.setUTCDate(f.getUTCDate() - desdeLunes)
  return f.toISOString().slice(0, 10)
}

// Números de día completados en la semana de `hoy`
export function completadosEnSemana(completados, hoy) {
  const lunes = lunesDe(hoy)
  return new Set(completados.filter((c) => c.fecha >= lunes && c.fecha <= hoy).map((c) => c.numero_dia))
}

// Qué día abrir al entrar:
//   1. el que el alumno eligió hoy, si todavía no lo completó (ej. recargó a mitad del entrenamiento)
//   2. el primer día de la rutina que todavía no hizo esta semana
//   3. si ya hizo todos: el que sigue al último que completó (vuelve a empezar)
// Un día ya completado no se vuelve a abrir solo: el alumno entra y empieza lo que le toca.
export function diaQueToca({ dias, completados, hoy, elegidoHoy = null }) {
  if (!dias.length) return null
  const hechos = completadosEnSemana(completados, hoy)
  if (elegidoHoy != null && dias.includes(elegidoHoy) && !hechos.has(elegidoHoy)) return elegidoHoy
  const pendiente = dias.find((n) => !hechos.has(n))
  if (pendiente != null) return pendiente
  const ultimo = [...completados].filter((c) => dias.includes(c.numero_dia))
    .sort((a, b) => (a.fecha + (a.creado ?? '')).localeCompare(b.fecha + (b.creado ?? ''))).pop()
  const i = ultimo ? dias.indexOf(ultimo.numero_dia) : -1
  return dias[(i + 1) % dias.length]
}
