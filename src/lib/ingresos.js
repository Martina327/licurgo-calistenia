// A7 · Dashboard de ingresos: cálculos puros (rangos, totales, serie diaria, CSV).
// Las fechas son 'YYYY-MM-DD' en hora de Argentina (hoyAR / v_movimientos.fecha).

export const CONCEPTOS = ['Cuota', 'Kiosco', 'Subalquiler']
export const NOMBRE_CONCEPTO = { Cuota: 'Cuotas', Kiosco: 'Kiosco', Subalquiler: 'Subalquileres' }
// Colores de cada concepto (tarjetas, barras y leyenda)
export const COLOR_CONCEPTO = { Cuota: 'bg-emerald-400', Kiosco: 'bg-amber-400', Subalquiler: 'bg-sky-400' }

const aFecha = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}
const aIso = (f) => f.toISOString().slice(0, 10)
export const sumarDias = (iso, n) => {
  const f = aFecha(iso)
  f.setUTCDate(f.getUTCDate() + n)
  return aIso(f)
}

// Rangos rápidos. La semana arranca el lunes.
export const RANGOS = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'semana', texto: 'Semana en curso' },
  { id: 'mes', texto: 'Mes actual' },
  { id: 'mes_anterior', texto: 'Mes anterior' },
  { id: 'personalizado', texto: 'Personalizado' },
]

export function calcularRango(id, hoy) {
  const f = aFecha(hoy)
  if (id === 'hoy') return { desde: hoy, hasta: hoy }
  if (id === 'semana') {
    const dia = (f.getUTCDay() + 6) % 7 // lunes = 0
    return { desde: sumarDias(hoy, -dia), hasta: hoy }
  }
  if (id === 'mes') return { desde: hoy.slice(0, 8) + '01', hasta: hoy }
  if (id === 'mes_anterior') {
    const primero = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1))
    const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0))
    return { desde: aIso(primero), hasta: aIso(ultimo) }
  }
  return null
}

// Totales por concepto y medio
export function resumir(movs) {
  const porConcepto = Object.fromEntries(CONCEPTOS.map((c) => [c, { Efectivo: 0, Transferencia: 0, total: 0, cantidad: 0 }]))
  let total = 0
  let fueraDeCaja = 0
  for (const m of movs) {
    const monto = Number(m.monto)
    const c = porConcepto[m.concepto]
    if (!c) continue
    c[m.medio_pago] += monto
    c.total += monto
    c.cantidad += 1
    total += monto
    if (m.fuera_de_caja) fueraDeCaja += monto
  }
  return { porConcepto, total, fueraDeCaja, cantidad: movs.length }
}

// Una fila por día del rango (incluye días sin ingresos), con el total por concepto
export function serieDiaria(movs, desde, hasta) {
  const dias = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    dias.push({ fecha: d, ...Object.fromEntries(CONCEPTOS.map((c) => [c, 0])), total: 0 })
    if (dias.length > 400) break // tope de seguridad
  }
  const porFecha = Object.fromEntries(dias.map((d) => [d.fecha, d]))
  for (const m of movs) {
    const d = porFecha[m.fecha]
    if (!d) continue
    d[m.concepto] += Number(m.monto)
    d.total += Number(m.monto)
  }
  return dias
}

// CSV con ; (Excel y Sheets en español) y BOM para que respete las tildes
export function aCsv(movs) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const filas = [
    ['Fecha', 'Hora', 'Concepto', 'Medio', 'Monto', 'Alumno', 'Detalle', 'Cobrado por', 'Fuera de caja'],
    ...movs.map((m) => [
      m.fecha,
      new Date(m.created_at).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }),
      m.concepto,
      m.medio_pago,
      String(Number(m.monto)).replace('.', ','),
      m.alumno ?? '',
      m.detalle ?? '',
      m.cobrado_por,
      m.fuera_de_caja ? 'Sí' : 'No',
    ]),
  ]
  return '﻿' + filas.map((f) => f.map(esc).join(';')).join('\n')
}
