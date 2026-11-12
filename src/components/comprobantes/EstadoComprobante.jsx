import { ESTADO_COMPROBANTE } from '../../lib/comprobantes'

export default function EstadoComprobante({ estado }) {
  const e = ESTADO_COMPROBANTE[estado] ?? ESTADO_COMPROBANTE.Pendiente
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${e.clase}`}>{e.texto}</span>
}
