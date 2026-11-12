import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, formatearPesos } from '../../lib/utils'
import { BUCKET, esPDF } from '../../lib/comprobantes'
import { useMiMembresia } from '../../lib/useMiMembresia'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import EstadoComprobante from '../../components/comprobantes/EstadoComprobante'
import { Chevron, IconoRecibo } from '../../components/Iconos'

// Historial de comprobantes del alumno (B4). Tocar uno abre el archivo (link firmado de 1 minuto).
export default function MisComprobantes() {
  const { cargando, comprobantes, error } = useMiMembresia()
  const [aviso, setAviso] = useState(null)

  const abrir = async (c) => {
    const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(c.archivo_path, 60)
    if (e) return setAviso('No se pudo abrir el archivo.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (cargando) return <Cargando />

  if (!comprobantes.length) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-neutral-400"><IconoRecibo /></span>
        <p className="text-neutral-300">Todavía no enviaste comprobantes.</p>
        <Link to="/alumno/pagar" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950">Pagar por transferencia</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {(error || aviso) && <Aviso tipo="error" texto={error || aviso} />}
      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-2xl bg-neutral-900">
        {comprobantes.map((c) => (
          <li key={c.id}>
            <button onClick={() => abrir(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-800">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-[10px] font-semibold text-neutral-300">
                {esPDF(c.archivo_path) ? 'PDF' : 'IMG'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium tabular-nums">{formatearPesos(c.monto_acreditado ?? c.monto_declarado)}</span>
                <span className="block truncate text-sm text-neutral-400">
                  {formatearFecha(c.created_at)}{c.estado === 'Rechazado' && ` · ${c.motivo_rechazo}`}
                </span>
              </span>
              <EstadoComprobante estado={c.estado} />
              <Chevron className="h-5 w-5 shrink-0 text-neutral-600" />
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-center text-xs text-neutral-500">Tocá un comprobante para ver el archivo.</p>
    </div>
  )
}
