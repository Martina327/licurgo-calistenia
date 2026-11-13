// Fechas escritas a mano como dd/mm/aaaa (formato argentino), sin depender del idioma del navegador.

// "20112026" o "20/11/2026" → "20/11/2026" mientras se escribe (agrega las barras solas)
export function formatearTipeo(texto) {
  const d = String(texto ?? '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "20/11/2026" → "2026-11-20" · '' si está vacía · null si está incompleta o no existe (ej. 31/02)
export function aIso(texto) {
  const d = String(texto ?? '').replace(/\D/g, '')
  if (d.length === 0) return ''
  if (d.length !== 8) return null
  const dia = Number(d.slice(0, 2))
  const mes = Number(d.slice(2, 4))
  const anio = Number(d.slice(4))
  if (anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1) return null
  const f = new Date(Date.UTC(anio, mes - 1, dia))
  if (f.getUTCMonth() !== mes - 1) return null // ej. 31/02 no existe
  return f.toISOString().slice(0, 10)
}

// "2026-11-20" → "20/11/2026"
export const desdeIso = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
