// Kiosco: reglas compartidas entre Productos (dueño) y la venta en Caja (recepción).
import { normalizar } from './filtroAlumnos.js'

// Desde cuántas unidades se avisa en amarillo (decisión de Martina, 12/11/2026)
export const STOCK_BAJO = 10
// Cuántos días antes del vencimiento se avisa en amarillo
export const DIAS_POR_VENCER = 7

// 'sin' (0, rojo) · 'bajo' (≤ 10, amarillo) · 'ok'
export const estadoStock = (stock) => (stock <= 0 ? 'sin' : stock <= STOCK_BAJO ? 'bajo' : 'ok')

const diasEntre = (desde, hasta) => {
  const f = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))))
  return Math.round((f(hasta) - f(desde)) / 86400000)
}

// null si no tiene fecha · 'vencido' (rojo) · 'por_vencer' (amarillo) · 'ok'
export function estadoVencimiento(vencimiento, hoy) {
  if (!vencimiento) return null
  const dias = diasEntre(hoy, vencimiento)
  if (dias < 0) return 'vencido'
  return dias <= DIAS_POR_VENCER ? 'por_vencer' : 'ok'
}

// Busca por nombre sin importar tildes ni mayúsculas; cada palabra tiene que estar
export function buscarProductos(productos, busqueda) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return productos
  return productos.filter((p) => {
    const nombre = normalizar(p.nombre)
    return palabras.every((w) => nombre.includes(w))
  })
}

// Colores de texto para stock y vencimiento
export const COLOR_STOCK = { sin: 'text-red-400', bajo: 'text-amber-400', ok: 'text-neutral-400' }
export const COLOR_VENCIMIENTO = { vencido: 'text-red-400', por_vencer: 'text-amber-400', ok: 'text-neutral-400' }

// Texto que aparece al pasar el mouse sobre un número en color (explica qué significa)
export const AYUDA_STOCK = {
  sin: 'Sin stock, no se puede vender.',
  bajo: `Stock bajo: quedan ${STOCK_BAJO} o menos. Conviene reponer.`,
}
// Para la fecha en amarillo dice exactamente cuántos días faltan
export function ayudaVencimiento(vencimiento, hoy) {
  const estado = estadoVencimiento(vencimiento, hoy)
  if (estado === 'vencido') return 'El producto ya venció.'
  if (estado !== 'por_vencer') return undefined
  const dias = diasEntre(hoy, vencimiento)
  return dias === 0 ? 'Vence hoy.' : dias === 1 ? 'Vence mañana.' : `Faltan ${dias} días para que venza.`
}
