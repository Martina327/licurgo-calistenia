import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, formatearPesos, hoyAR, mensajeError } from '../../lib/utils'
import {
  CONCEPTOS, COLOR_CONCEPTO, NOMBRE_CONCEPTO, RANGOS, aCsv, calcularRango, resumir, serieDiaria,
} from '../../lib/ingresos'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import CampoFecha from '../../components/CampoFecha'
import AvisoCierres from '../../components/AvisoCierres'
import ResumenInicio from '../../components/ResumenInicio'

// CU12 · Dashboard de ingresos (A7). SOLO SuperAdmin: v_movimientos, v_cierres_caja y
// configuracion_admin no devuelven filas a otros roles (RNF01), y la ruta /admin es solo suya.
//   · Selector de rango: hoy, semana en curso, mes actual, mes anterior o personalizado
//   · Total del período y tarjetas por concepto (efectivo / transferencia)
//   · Ingresos por día (barras apiladas por concepto)
//   · Movimientos del período con descarga en CSV (para Sheets o Excel)
//   · Historial de cierres de caja
//   · Link a la planilla de Google Sheets de la administración (RF14)
//   · Arriba: aviso de cierres con diferencia sin revisar (A5)

const formatearHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export default function DashboardIngresos() {
  const hoy = hoyAR()
  const [rangoId, setRangoId] = useState('mes')
  const [personalizado, setPersonalizado] = useState({ desde: calcularRango('mes', hoy).desde, hasta: hoy })
  const [movs, setMovs] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [seccion, setSeccion] = useState('movimientos')

  const rango = rangoId === 'personalizado' ? personalizado : calcularRango(rangoId, hoy)
  const rangoValido = rango.desde && rango.hasta && rango.desde <= rango.hasta

  useEffect(() => {
    if (!rangoValido) return
    let cancelado = false
    setCargando(true)
    supabase
      .from('v_movimientos')
      .select('*')
      .gte('fecha', rango.desde)
      .lte('fecha', rango.hasta)
      .order('created_at', { ascending: false })
      .then(({ data, error: e }) => {
        if (cancelado) return
        setError(e ? mensajeError(e) : '')
        setMovs(data ?? [])
        setCargando(false)
      })
    return () => { cancelado = true }
  }, [rango.desde, rango.hasta, rangoValido])

  const resumen = useMemo(() => resumir(movs), [movs])
  const serie = useMemo(() => (rangoValido ? serieDiaria(movs, rango.desde, rango.hasta) : []), [movs, rango.desde, rango.hasta, rangoValido])

  // Descarga lo que se ve en la tabla: si hay un concepto filtrado, solo ese
  const descargar = (filas, concepto) => {
    const blob = new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const sufijo = concepto ? `_${NOMBRE_CONCEPTO[concepto].toLowerCase()}` : ''
    a.href = url
    a.download = `ingresos${sufijo}_${rango.desde}_a_${rango.hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <AvisoCierres />
      <ResumenInicio />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Ingresos</h2>
          <p className="text-sm text-neutral-400">
            {rango.desde === rango.hasta ? formatearFecha(rango.desde) : `Del ${formatearFecha(rango.desde)} al ${formatearFecha(rango.hasta)}`}
          </p>
        </div>
        <Planilla />
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGOS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRangoId(r.id)}
            className={`rounded-full border px-3 py-1 text-sm ${rangoId === r.id ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'}`}
          >
            {r.texto}
          </button>
        ))}
      </div>

      {rangoId === 'personalizado' && (
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-neutral-400">Desde</span>
            <CampoFecha value={personalizado.desde} max={hoy} onChange={(e) => e.target.value && setPersonalizado((p) => ({ ...p, desde: e.target.value }))}
              className="w-40 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400" />
          </label>
          <label className="space-y-1">
            <span className="block text-neutral-400">Hasta</span>
            <CampoFecha value={personalizado.hasta} max={hoy} onChange={(e) => e.target.value && setPersonalizado((p) => ({ ...p, hasta: e.target.value }))}
              className="w-40 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400" />
          </label>
          {!rangoValido && <span className="text-red-400">La fecha "desde" tiene que ser anterior a "hasta".</span>}
        </div>
      )}

      <Aviso tipo="error" texto={error} />

      {cargando ? (
        <Cargando />
      ) : (
        <>
          <div>
            <p className="text-sm text-neutral-400">Total del período · {resumen.cantidad} {resumen.cantidad === 1 ? 'movimiento' : 'movimientos'}</p>
            <p className="text-3xl font-bold tabular-nums">{formatearPesos(resumen.total)}</p>
            {resumen.fueraDeCaja > 0 && (
              <p className="text-xs text-neutral-500">Incluye {formatearPesos(resumen.fueraDeCaja)} en efectivo cobrado por vos, fuera de la caja.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {CONCEPTOS.map((c) => {
              const d = resumen.porConcepto[c]
              const pct = resumen.total ? Math.round((d.total / resumen.total) * 100) : 0
              return (
                <div key={c} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <span className={`h-2.5 w-2.5 rounded-sm ${COLOR_CONCEPTO[c]}`} />
                    {NOMBRE_CONCEPTO[c]}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">{formatearPesos(d.total)}</div>
                  <div className="text-xs text-neutral-500">{pct}% del total · {d.cantidad} {d.cantidad === 1 ? 'cobro' : 'cobros'}</div>
                  <div className="mt-2 space-y-0.5 text-xs text-neutral-400">
                    <div>Efectivo: {formatearPesos(d.Efectivo)}</div>
                    <div>Transferencia: {formatearPesos(d.Transferencia)}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {serie.length > 1 && <GraficoDiario serie={serie} />}

          <div className="flex gap-1 border-b border-neutral-800">
            {[
              { id: 'movimientos', texto: 'Movimientos' },
              { id: 'cierres', texto: 'Cierres de caja' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setSeccion(t.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${seccion === t.id ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}
              >
                {t.texto}
              </button>
            ))}
          </div>

          {seccion === 'movimientos' ? (
            <Movimientos movs={movs} alDescargar={descargar} />
          ) : (
            <Cierres desde={rango.desde} hasta={rango.hasta} />
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Ingresos por día: barras apiladas por concepto
// ---------------------------------------------------------------
function GraficoDiario({ serie }) {
  const max = Math.max(...serie.map((d) => d.total), 1)
  const muchos = serie.length > 31
  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-300">Ingresos por día</h2>
        <div className="flex gap-3 text-xs text-neutral-400">
          {CONCEPTOS.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${COLOR_CONCEPTO[c]}`} />
              {NOMBRE_CONCEPTO[c]}
            </span>
          ))}
        </div>
      </div>
      <div className="flex h-40 items-end gap-px overflow-x-auto">
        {serie.map((d) => (
          <div
            key={d.fecha}
            title={`${formatearFecha(d.fecha)} · ${formatearPesos(d.total)}`}
            className="flex h-full min-w-[6px] flex-1 flex-col-reverse"
          >
            {CONCEPTOS.map((c) =>
              d[c] > 0 ? <div key={c} className={COLOR_CONCEPTO[c]} style={{ height: `${(d[c] / max) * 100}%` }} /> : null,
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{formatearFecha(serie[0].fecha)}</span>
        {!muchos && serie.length > 2 && <span>Máximo diario: {formatearPesos(max)}</span>}
        <span>{formatearFecha(serie[serie.length - 1].fecha)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Movimientos del período
// ---------------------------------------------------------------
function Movimientos({ movs, alDescargar }) {
  const [filtro, setFiltro] = useState('Todos')
  const visibles = filtro === 'Todos' ? movs : movs.filter((m) => m.concepto === filtro)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {['Todos', ...CONCEPTOS].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-full border px-3 py-1 text-sm ${filtro === f ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
            >
              {f === 'Todos' ? 'Todos' : NOMBRE_CONCEPTO[f]}
            </button>
          ))}
        </div>
        <button onClick={() => alDescargar(visibles, filtro === 'Todos' ? null : filtro)} disabled={visibles.length === 0} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-40">
          {filtro === 'Todos' ? 'Descargar CSV' : `Descargar CSV de ${NOMBRE_CONCEPTO[filtro].toLowerCase()}`}
        </button>
      </div>
      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay movimientos en este período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Medio</th>
                <th className="px-3 py-2">Cobró</th>
                <th className="px-3 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => (
                <tr key={m.id} className="border-t border-neutral-800">
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-400">{formatearHora(m.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-sm ${COLOR_CONCEPTO[m.concepto]}`} />
                      {m.concepto}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-300">{m.alumno ?? m.detalle ?? '—'}</td>
                  <td className="px-3 py-2">{m.medio_pago}{m.fuera_de_caja ? <span className="text-neutral-500"> · fuera de caja</span> : ''}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-400">{m.cobrado_por}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatearPesos(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Historial de cierres de caja del período
// ---------------------------------------------------------------
function Cierres({ desde, hasta }) {
  const [cierres, setCierres] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('v_cierres_caja')
      .select('*')
      .gte('cerrado_at', `${desde}T00:00:00-03:00`)
      .lte('cerrado_at', `${hasta}T23:59:59-03:00`)
      .order('cerrado_at', { ascending: false })
      .then(({ data, error: e }) => {
        setError(e ? mensajeError(e) : '')
        setCierres(data ?? [])
      })
  }, [desde, hasta])

  if (!cierres) return <Cargando />
  if (error) return <Aviso tipo="error" texto={error} />
  if (cierres.length === 0) return <p className="text-sm text-neutral-400">No hubo cierres de caja en este período.</p>

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900 text-left text-neutral-400">
          <tr>
            <th className="px-3 py-2">Cierre</th>
            <th className="px-3 py-2">Recepcionista</th>
            <th className="px-3 py-2 text-right">Debía haber</th>
            <th className="px-3 py-2 text-right">Contó</th>
            <th className="px-3 py-2 text-right">Diferencia</th>
            <th className="px-3 py-2">Justificación</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {cierres.map((c) => {
            const d = Number(c.diferencia)
            return (
              <tr key={c.id} className="border-t border-neutral-800">
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">{formatearHora(c.cerrado_at)}</td>
                <td className="whitespace-nowrap px-3 py-2">{c.recepcionista}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatearPesos(c.monto_esperado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatearPesos(c.monto_contado)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${d < 0 ? 'text-red-400' : d > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                  {d === 0 ? 'Justo' : `${d > 0 ? '+' : '−'}${formatearPesos(Math.abs(d))}`}
                </td>
                <td className="px-3 py-2 text-neutral-300">
                  {c.comentario ?? '—'}
                  {d !== 0 && !c.revisado_at && <span className="ml-2 text-xs text-amber-400">sin revisar</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link to={`/admin/cierres/${c.id}`} className="whitespace-nowrap text-neutral-300 hover:text-white hover:underline">Ver detalle</Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------
// Planilla de Google Sheets (RF14): link guardado, solo para el dueño
// ---------------------------------------------------------------
function Planilla() {
  const [url, setUrl] = useState(null)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('configuracion_admin').select('planilla_url').maybeSingle()
    setUrl(data?.planilla_url ?? '')
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const v = valor.trim()
    if (v && !v.startsWith('https://')) return setError('El link tiene que empezar con https://')
    const { error: err } = await supabase.rpc('guardar_planilla_url', { p_url: v || null })
    if (err) return setError(mensajeError(err))
    setEditando(false)
    await cargar()
  }

  if (url === null) return null

  if (editando) {
    return (
      <form onSubmit={guardar} className="flex w-full max-w-md flex-wrap items-start gap-2 sm:w-auto">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
          autoFocus
        />
        <button type="submit" className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-950">Guardar</button>
        <button type="button" onClick={() => { setEditando(false); setError('') }} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm">Cancelar</button>
        {error && <p className="basis-full text-xs text-red-400">{error}</p>}
      </form>
    )
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {url ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-neutral-950">
            Abrir planilla
          </a>
          <button onClick={() => { setValor(url); setEditando(true) }} className="text-neutral-400 hover:text-white hover:underline">
            Cambiar link
          </button>
        </>
      ) : (
        <button onClick={() => { setValor(''); setEditando(true) }} className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800">
          Cargar link de la planilla
        </button>
      )}
    </div>
  )
}
