// ---------------------------------------------------------------
// Apto médico (B4): el alumno lo carga, recepción lo aprueba.
// El certificado oficial (con vencimiento) recién existe cuando se aprueba;
// el estado Vigente / Por vencer / Vencido sale de v_membresias.
// ---------------------------------------------------------------

export const BUCKET_APTOS = 'certificados'

export const MOTIVOS_RECHAZO_APTO = [
  'No se lee',
  'Falta la firma o el sello del médico',
  'Está vencido',
  'No es un apto médico',
  'Falta la fecha',
]

// Un apto suele valer un año desde que lo firma el médico
export function vencimientoSugerido(emision) {
  if (!emision) return ''
  const [a, m, d] = emision.split('-').map(Number)
  const f = new Date(Date.UTC(a + 1, m - 1, d))
  if (f.getUTCMonth() !== m - 1) f.setUTCDate(0) // 29/02 → 28/02
  return f.toISOString().slice(0, 10)
}

// Qué ve el alumno arriba de todo, combinando el certificado oficial y su última carga
//   tono: 'ok' · 'aviso' · 'alerta' · 'info' · 'neutro'
export function situacionApto({ estadoCertificado, vencimiento, ultimaCarga }) {
  if (ultimaCarga?.estado === 'Pendiente') {
    return { tono: 'info', titulo: 'En revisión', texto: 'Recepción está revisando el apto que enviaste.', puedeSubir: false }
  }
  const rechazo = ultimaCarga?.estado === 'Rechazado' ? ultimaCarga.motivo_rechazo : null
  const base = {
    Vigente: { tono: 'ok', titulo: 'Vigente', texto: `Vale hasta el ${vencimiento}.` },
    'Por vencer': { tono: 'aviso', titulo: 'Por vencer', texto: `Vence el ${vencimiento}. Subí el nuevo cuando lo tengas.` },
    Vencido: { tono: 'alerta', titulo: 'Vencido', texto: `Venció el ${vencimiento}. Subí uno nuevo.` },
  }[estadoCertificado] ?? { tono: 'neutro', titulo: 'Sin apto médico', texto: 'Todavía no tenés un apto médico cargado.' }
  return { ...base, rechazo, puedeSubir: true }
}

export const TONO_APTO = {
  ok: 'border-emerald-900/70 bg-emerald-500/10 text-emerald-200',
  aviso: 'border-amber-900/70 bg-amber-500/10 text-amber-200',
  alerta: 'border-red-900/70 bg-red-500/10 text-red-200',
  info: 'border-sky-900/70 bg-sky-500/10 text-sky-200',
  neutro: 'border-neutral-800 bg-neutral-900 text-neutral-200',
}
