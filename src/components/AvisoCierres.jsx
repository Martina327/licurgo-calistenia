import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatearPesos, mensajeError } from '../lib/utils'

// Aviso al dueño (A5 · opción B): cierres de caja con diferencia que todavía no revisó.
// Solo devuelve filas al SuperAdmin (v_cierres_caja). Al marcar revisado, deja de aparecer.
const formatearFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export default function AvisoCierres() {
  const [cierres, setCierres] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_cierres_caja')
      .select('id, recepcionista, cerrado_at, monto_inicial, efectivo_cobrado, monto_esperado, monto_contado, diferencia, comentario')
      .is('revisado_at', null)
      .neq('diferencia', 0)
      .order('cerrado_at', { ascending: false })
    if (error) setError(mensajeError(error))
    setCierres(data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const revisar = async (id) => {
    setError('')
    const { error } = await supabase.rpc('marcar_cierre_revisado', { p_turno_id: id })
    if (error) return setError(mensajeError(error))
    await cargar()
  }

  if (cierres.length === 0 && !error) return null

  return (
    <div className="space-y-3 rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {cierres.length === 1 ? '1 cierre de caja con diferencia sin revisar' : `${cierres.length} cierres de caja con diferencia sin revisar`}
        </p>
        {cierres.length > 0 && (
          <button onClick={() => setAbierto((a) => !a)} className="rounded-lg border border-amber-800 px-3 py-1 hover:bg-amber-900/40">
            {abierto ? 'Ocultar' : 'Ver detalle'}
          </button>
        )}
      </div>
      {error && <p className="text-red-300">{error}</p>}
      {abierto && (
        <ul className="divide-y divide-amber-900/60">
          {cierres.map((c) => {
            const d = Number(c.diferencia)
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div className="space-y-0.5">
                  <p>
                    <span className="font-medium">{c.recepcionista}</span> · {formatearFechaHora(c.cerrado_at)} ·{' '}
                    <span className={d < 0 ? 'text-red-300' : 'text-amber-200'}>
                      {d < 0 ? `Faltan ${formatearPesos(-d)}` : `Sobran ${formatearPesos(d)}`}
                    </span>
                  </p>
                  <p className="text-amber-200/70">
                    Inicial {formatearPesos(c.monto_inicial)} · Cobrado en efectivo {formatearPesos(c.efectivo_cobrado)} ·
                    Debía haber {formatearPesos(c.monto_esperado)} · Contó {formatearPesos(c.monto_contado)}
                  </p>
                  <p className="text-amber-200/90">{c.comentario ? `“${c.comentario}”` : 'Sin justificación'}</p>
                </div>
                <button onClick={() => revisar(c.id)} className="rounded-lg bg-white px-3 py-1 font-semibold text-neutral-950">
                  Marcar revisado
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
