import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFechaHora, formatearHoraAR, formatearPesos, mensajeError } from '../../lib/utils'
import { CONCEPTOS, COLOR_CONCEPTO, NOMBRE_CONCEPTO } from '../../lib/ingresos'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { Atras } from '../../components/Iconos'

// Detalle de un cierre de caja (A5 · opción B), solo SuperAdmin.
// Se llega desde el aviso "Revisar cierre de caja" o desde la pestaña Cierres de Ingresos.
//   · Resultado: sobra / falta / justo y la justificación de la recepcionista.
//   · Arqueo: inicial + cobrado en efectivo = debía haber; lo que contó; diferencia.
//   · Todo lo cobrado en efectivo en ese turno, y las transferencias que registró
//     en ese horario (no entran en la caja, se muestran para tener el panorama).
//   · "Marcar caja revisada": saca el aviso de Ingresos.
export default function DetalleCierre() {
  const { id } = useParams()
  const [cierre, setCierre] = useState(null)
  const [efectivo, setEfectivo] = useState([])
  const [transferencias, setTransferencias] = useState([])
  const [revisor, setRevisor] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const { data: c, error: e1 } = await supabase.from('v_cierres_caja').select('*').eq('id', id).maybeSingle()
    if (e1 || !c) {
      setError(e1 ? mensajeError(e1) : 'No encontramos ese cierre de caja.')
      setCargando(false)
      return
    }
    const campos = 'id, created_at, concepto, medio_pago, monto, alumno, detalle'
    const [ef, tr, rev] = await Promise.all([
      supabase.from('v_movimientos').select(campos).eq('turno_id', id).order('created_at'),
      supabase.from('v_movimientos').select(campos)
        .eq('registrado_por', c.usuario_id).eq('medio_pago', 'Transferencia')
        .gte('created_at', c.abierto_at).lte('created_at', c.cerrado_at).order('created_at'),
      c.revisado_por
        ? supabase.from('usuarios').select('nombre, apellido').eq('id', c.revisado_por).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setError(ef.error || tr.error ? mensajeError(ef.error || tr.error) : '')
    setCierre(c)
    setEfectivo(ef.data ?? [])
    setTransferencias(tr.data ?? [])
    setRevisor(rev.data ? `${rev.data.nombre} ${rev.data.apellido}` : '')
    setCargando(false)
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const marcarRevisada = async () => {
    setError('')
    setEnviando(true)
    const { error } = await supabase.rpc('marcar_cierre_revisado', { p_turno_id: id })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    await cargar()
  }

  if (cargando) return <Cargando />

  const volver = (
    <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
      <Atras className="h-4 w-4" /> Ingresos
    </Link>
  )

  if (!cierre) {
    return (
      <div className="space-y-4">
        {volver}
        <Aviso tipo="error" texto={error} />
      </div>
    )
  }

  const d = Number(cierre.diferencia)
  const tono =
    d < 0 ? 'border-red-900 bg-red-950/40 text-red-200'
    : d > 0 ? 'border-amber-900 bg-amber-950/40 text-amber-100'
    : 'border-emerald-900 bg-emerald-950/40 text-emerald-200'
  const porConcepto = CONCEPTOS.map((c) => {
    const movs = efectivo.filter((m) => m.concepto === c)
    return { concepto: c, cantidad: movs.length, total: movs.reduce((t, m) => t + Number(m.monto), 0) }
  }).filter((x) => x.cantidad > 0)

  return (
    <div className="space-y-5">
      {volver}

      <div>
        <h1 className="text-xl font-semibold">Cierre de caja</h1>
        <p className="text-sm text-neutral-400">
          {cierre.recepcionista} · {new Date(cierre.abierto_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' })} · de {formatearHoraAR(cierre.abierto_at)} a {formatearHoraAR(cierre.cerrado_at)}
        </p>
      </div>

      {/* Resultado */}
      <div className={`space-y-1 rounded-xl border px-4 py-4 ${tono}`}>
        <p className="text-2xl font-bold tabular-nums">
          {d === 0 ? 'Caja justa' : d < 0 ? `Faltan ${formatearPesos(-d)}` : `Sobran ${formatearPesos(d)}`}
        </p>
        {d !== 0 && (
          <p className="text-sm opacity-90">
            {cierre.comentario ? <>Justificación: “{cierre.comentario}”</> : 'La recepcionista no dejó justificación.'}
          </p>
        )}
      </div>

      {/* Arqueo */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">Arqueo</h2>
        <dl className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 text-sm">
          <Fila texto="Efectivo inicial" valor={cierre.monto_inicial} />
          <Fila texto="+ Cobrado en efectivo" valor={cierre.efectivo_cobrado} />
          <Fila texto="= Debía haber" valor={cierre.monto_esperado} fuerte />
          <Fila texto="Contó" valor={cierre.monto_contado} fuerte />
          <Fila
            texto="Diferencia"
            valor={d}
            fuerte
            color={d < 0 ? 'text-red-400' : d > 0 ? 'text-amber-300' : 'text-emerald-400'}
            signo
          />
        </dl>
      </section>

      {/* Lo cobrado en efectivo */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">Cobrado en efectivo en el turno</h2>
        {porConcepto.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {porConcepto.map((x) => (
              <span key={x.concepto} className="flex items-center gap-2 rounded-full border border-neutral-800 px-3 py-1 text-sm">
                <span className={`h-2 w-2 rounded-sm ${COLOR_CONCEPTO[x.concepto]}`} />
                {NOMBRE_CONCEPTO[x.concepto]} <span className="tabular-nums text-neutral-400">{formatearPesos(x.total)} ({x.cantidad})</span>
              </span>
            ))}
          </div>
        )}
        <ListaMovimientos movs={efectivo} vacio="No cobró nada en efectivo en este turno." />
      </section>

      {transferencias.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500">Transferencias en ese horario (no entran en la caja)</h2>
          <ListaMovimientos movs={transferencias} />
        </section>
      )}

      <Aviso tipo="error" texto={error} />

      {/* Revisión */}
      {cierre.revisado_at ? (
        <p className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {d === 0 ? 'Caja justa: no hacía falta revisarla.' : `Revisada el ${formatearFechaHora(cierre.revisado_at)}${revisor ? ` por ${revisor}` : ''}.`}
        </p>
      ) : (
        <button
          onClick={marcarRevisada}
          disabled={enviando}
          className="w-full rounded-lg bg-white py-3 font-semibold text-neutral-950 disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {enviando ? 'Guardando…' : 'Marcar caja revisada'}
        </button>
      )}
    </div>
  )
}

function Fila({ texto, valor, fuerte, color = '', signo }) {
  const n = Number(valor)
  const monto = signo && n !== 0 ? `${n > 0 ? '+' : '−'}${formatearPesos(Math.abs(n))}` : formatearPesos(n)
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className={fuerte ? 'font-medium' : 'text-neutral-400'}>{texto}</dt>
      <dd className={`tabular-nums ${fuerte ? 'font-semibold' : ''} ${color}`}>{monto}</dd>
    </div>
  )
}

function ListaMovimientos({ movs, vacio }) {
  if (movs.length === 0) return vacio ? <p className="text-sm text-neutral-400">{vacio}</p> : null
  return (
    <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 text-sm">
      {movs.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-12 shrink-0 tabular-nums text-neutral-500">{formatearHoraAR(m.created_at)}</span>
          <span className={`h-2 w-2 shrink-0 rounded-sm ${COLOR_CONCEPTO[m.concepto]}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{m.alumno ?? m.detalle ?? m.concepto}</span>
            <span className="block text-xs text-neutral-500">{m.concepto}</span>
          </span>
          <span className="tabular-nums">{formatearPesos(m.monto)}</span>
        </li>
      ))}
    </ul>
  )
}
