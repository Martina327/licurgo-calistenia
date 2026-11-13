import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatearFechaHora, formatearPesos, mensajeError } from '../lib/utils'
import { Chevron } from './Iconos'

// Aviso al dueño (A5 · opción B): cierres de caja con diferencia que todavía no revisó.
//   · Cerrado: una franja corta "Revisar cierre de caja".
//   · Al tocarla: cada cierre con sobra/falta y el monto, y "Ver detalle".
//   · En el detalle (/admin/cierres/:id) está todo y se marca como revisado.
// Solo devuelve filas al SuperAdmin (v_cierres_caja).
export default function AvisoCierres() {
  const [cierres, setCierres] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const ir = useNavigate()

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_cierres_caja')
      .select('id, recepcionista, cerrado_at, diferencia')
      .is('revisado_at', null)
      .neq('diferencia', 0)
      .order('cerrado_at', { ascending: false })
    if (error) setError(mensajeError(error))
    setCierres(data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cierres.length === 0 && !error) return null

  return (
    <div className="overflow-hidden rounded-xl border border-amber-900 bg-amber-950/40 text-sm text-amber-100">
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-amber-900/20"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
        <span className="flex-1 font-medium">
          {cierres.length === 1 ? 'Revisar cierre de caja' : `Revisar ${cierres.length} cierres de caja`}
        </span>
        <Chevron className={`h-4 w-4 transition-transform ${abierto ? 'rotate-90' : ''}`} />
      </button>

      {error && <p className="px-4 pb-3 text-red-300">{error}</p>}

      {abierto && (
        <ul className="divide-y divide-amber-900/60 border-t border-amber-900/60">
          {cierres.map((c) => {
            const d = Number(c.diferencia)
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className={`font-semibold ${d < 0 ? 'text-red-300' : 'text-amber-200'}`}>
                    {d < 0 ? `Faltan ${formatearPesos(-d)}` : `Sobran ${formatearPesos(d)}`}
                  </p>
                  <p className="text-xs text-amber-200/70">{c.recepcionista} · {formatearFechaHora(c.cerrado_at)}</p>
                </div>
                <button
                  onClick={() => ir(`/admin/cierres/${c.id}`)}
                  className="rounded-lg border border-amber-800 px-3 py-1.5 hover:bg-amber-900/40"
                >
                  Ver detalle
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
