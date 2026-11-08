import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatearPesos, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Caja (Pareja A). Recepción y SuperAdmin.
//   A2 · Paso 1: abrir el turno de caja con el monto inicial (el cambio que hay en la caja).
//   Sin turno abierto no se puede cobrar en efectivo: la base lo rechaza (_turno_abierto).
//   El total esperado del turno NO se muestra: el cierre es un arqueo ciego (A5).
//   Próximos pasos: cobro de cuota (A2), kiosco (A3), subalquileres (A4), cierre (A5).

const formatearHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export default function Caja() {
  const { perfil } = useAuth()
  const [turno, setTurno] = useState(null) // turno abierto de este usuario, o null
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('turnos_caja')
      .select('id, abierto_at, monto_inicial')
      .eq('usuario_id', perfil.id)
      .is('cerrado_at', null)
      .maybeSingle()
    setError(error ? mensajeError(error) : '')
    setTurno(data)
    setCargando(false)
  }, [perfil.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Caja</h1>
        <p className="text-sm text-neutral-400">Cobros en efectivo del mostrador. Se registran en tu turno de caja.</p>
      </div>

      <Aviso tipo="error" texto={error} />

      {turno ? <TurnoAbierto turno={turno} /> : <AbrirTurno alAbrir={cargar} />}
    </div>
  )
}

// ---------------------------------------------------------------
// Abrir turno
// ---------------------------------------------------------------
function AbrirTurno({ alAbrir }) {
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const abrir = async (e) => {
    e.preventDefault()
    setError('')
    const valor = Number(String(monto).replace(/\./g, '').replace(',', '.'))
    if (monto.trim() === '' || Number.isNaN(valor) || valor < 0) {
      return setError('Ingresá el efectivo que hay en la caja al empezar (0 si no hay).')
    }
    setEnviando(true)
    const { error } = await supabase.rpc('abrir_turno', { p_monto_inicial: valor })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alAbrir()
  }

  return (
    <form onSubmit={abrir} className="max-w-md space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">Abrir turno de caja</h2>
        <p className="text-sm text-neutral-400">
          Contá el efectivo que hay en la caja antes de empezar (el cambio) y anotalo.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-neutral-400">Efectivo inicial</span>
        <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
          <span className="pl-3 text-neutral-500">$</span>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-transparent px-2 py-2 outline-none"
            autoFocus
          />
        </div>
      </label>
      <Aviso tipo="error" texto={error} />
      <button type="submit" disabled={enviando} className="w-full rounded-lg bg-white px-4 py-2 font-semibold text-neutral-950 disabled:opacity-50">
        {enviando ? 'Abriendo…' : 'Abrir turno'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------
// Turno abierto
// ---------------------------------------------------------------
function TurnoAbierto({ turno }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div>
          <p className="font-medium text-emerald-200">Turno abierto</p>
          <p className="text-sm text-emerald-300/70">
            Desde el {formatearHora(turno.abierto_at)} · Efectivo inicial {formatearPesos(turno.monto_inicial)}
          </p>
        </div>
      </div>
    </div>
  )
}
