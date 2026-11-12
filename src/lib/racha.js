// ---------------------------------------------------------------
// Racha de entrenamiento del alumno (Inicio)
//
// Un día cuenta como entrenado si recepción le marcó el presente (asistencias)
// o si completó un día de su rutina en la app (dias_completados).
// El objetivo semanal es la cantidad de días de su rutina (si no tiene, 3).
// La racha se cuenta en SEMANAS cumplidas seguidas: en calistenia se descansa,
// así que una racha diaria se cortaría siempre en los días de descanso.
//   · la semana en curso suma si ya cumplió; si todavía no, no corta la racha
// ---------------------------------------------------------------
import { lunesDe } from './semana.js'

export const OBJETIVO_POR_DEFECTO = 3
export const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const sumar = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const objetivoSemanal = (diasRutina) =>
  Math.min(7, Math.max(1, diasRutina || OBJETIVO_POR_DEFECTO))

// Fechas entrenadas (sin repetir) a partir de las dos fuentes
export const fechasEntrenadas = (asistencias = [], completados = []) =>
  new Set([...asistencias, ...completados].map((x) => x.fecha))

// Últimas `n` semanas (lunes a domingo), de la más vieja a la actual
export function semanas(fechas, hoy, objetivo, n = 8) {
  const lunesHoy = lunesDe(hoy)
  return Array.from({ length: n }, (_, i) => {
    const lunes = sumar(lunesHoy, -7 * (n - 1 - i))
    const dias = Array.from({ length: 7 }, (_, k) => sumar(lunes, k))
    const entrenados = dias.filter((d) => fechas.has(d)).length
    return { lunes, entrenados, cumplida: entrenados >= objetivo, actual: lunes === lunesHoy }
  })
}

// Semanas cumplidas seguidas hasta hoy (mirando hasta 52 semanas atrás)
export function rachaSemanas(fechas, hoy, objetivo) {
  const todas = semanas(fechas, hoy, objetivo, 52)
  const actual = todas[todas.length - 1]
  let racha = actual.cumplida ? 1 : 0
  for (let i = todas.length - 2; i >= 0 && todas[i].cumplida; i--) racha++
  return racha
}

// La semana en curso, día por día
export function semanaActual(fechas, hoy) {
  const lunes = lunesDe(hoy)
  return DIAS_CORTOS.map((letra, k) => {
    const fecha = sumar(lunes, k)
    return { letra, fecha, entrenado: fechas.has(fecha), hoy: fecha === hoy, futuro: fecha > hoy }
  })
}

// Calendario del mes de `hoy`: semanas que empiezan en lunes; null = casilla vacía
export function mes(fechas, hoy) {
  const [a, m] = hoy.split('-').map(Number)
  const primero = `${hoy.slice(0, 8)}01`
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const corrimiento = (new Date(`${primero}T12:00:00Z`).getUTCDay() + 6) % 7
  const celdas = [...Array(corrimiento).fill(null)]
  for (let d = 1; d <= ultimoDia; d++) {
    const fecha = `${hoy.slice(0, 8)}${String(d).padStart(2, '0')}`
    celdas.push({ dia: d, fecha, entrenado: fechas.has(fecha), hoy: fecha === hoy, futuro: fecha > hoy })
  }
  while (celdas.length % 7) celdas.push(null)
  const total = celdas.filter((c) => c?.entrenado).length
  return { celdas, total }
}

// Frase de la tarjeta de racha según cómo viene la semana
export function mensajeSemana({ entrenados, objetivo, racha, entrenoHoy }) {
  const faltan = objetivo - entrenados
  if (faltan <= 0) return racha > 1 ? `¡Semana cumplida! Llevás ${racha} semanas seguidas.` : '¡Semana cumplida! Seguí así la próxima.'
  if (entrenoHoy) return faltan === 1 ? 'Bien hoy. Te falta 1 día para cumplir la semana.' : `Bien hoy. Te faltan ${faltan} días para cumplir la semana.`
  if (entrenados === 0) return racha > 0 ? `Arrancá la semana y mantené tu racha de ${racha}.` : `Tu meta: ${objetivo} días esta semana. ¡Hoy puede ser el primero!`
  return faltan === 1 ? 'Te falta 1 día para cumplir la semana.' : `Te faltan ${faltan} días para cumplir la semana.`
}

// Frases para entrenar: cada foto del Inicio lleva una (ver frasePara)
export const FRASES = [
  'La fuerza no viene de lo que podés hacer hoy, sino de superar lo que ayer no podías.',
  'Una repetición más. Siempre hay una más.',
  'El cuerpo logra lo que la cabeza cree.',
  'No hace falta ser bueno para empezar, hace falta empezar para ser bueno.',
  'Disciplina es hacerlo aunque no tengas ganas.',
  'Cada dominada cuenta. Cada día suma.',
  'Tu único rival es el que eras ayer.',
  'Constancia le gana a intensidad.',
  'Lo difícil hoy es tu calentamiento de mañana.',
  'Dominá tu peso, dominá tu cabeza.',
  'No pares cuando estés cansado. Pará cuando termines.',
  'Pequeños progresos todos los días suman grandes resultados.',
  'La barra no se mueve sola: subite.',
  'Entrenar es una forma de cuidarte.',
  'Hoy es un buen día para ser más fuerte.',
]
const diaDelAnio = (hoy) => {
  const [a, m, d] = hoy.split('-').map(Number)
  return Math.floor((Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 0)) / 86_400_000)
}
// La frase de la foto número `k`: cambia junto con la foto y se corre un lugar por día
export function frasePara(hoy, k = 0) {
  return FRASES[(diaDelAnio(hoy) + k) % FRASES.length]
}
export const fraseDelDia = (hoy) => frasePara(hoy, 0)
