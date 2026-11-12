import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import {
  DIAS, DIAS_LARGOS, RANGOS, desdeHace, formatearDecimal, intensidad, matrizFranjas, resumen, textoFranja,
} from '../../lib/metricas'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Celda del mapa: un solo tono (celeste) que crece con el promedio; vacío = superficie
const colorCelda = (t) => (t === 0 ? undefined : `rgba(56, 189, 248, ${0.12 + t * 0.78})`)

// CU13 · Métricas de concurrencia (solo SuperAdmin, metricas_concurrencia)
//   · Resumen: asistencias, promedio por día abierto, día y franja más concurridos
//   · Asistencias por día (barras)
//   · Promedio por día de la semana
//   · Mapa de franjas horarias 8–22 h × día de la semana
export default function Concurrencia() {
  const [rango, setRango] = useState(30)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [verTabla, setVerTabla] = useState(false)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    supabase.rpc('metricas_concurrencia', { p_desde: desdeHace(rango, hoyAR()) }).then(({ data, error: e }) => {
      if (cancelado) return
      setError(e ? mensajeError(e) : '')
      setDatos(data)
      setCargando(false)
    })
    return () => { cancelado = true }
  }, [rango])

  const r = resumen(datos)
  const mapa = matrizFranjas(datos?.franjas)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Concurrencia</h1>
          <p className="text-sm text-neutral-400">Asistencias registradas en recepción (check-in).</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-800 p-1" role="tablist" aria-label="Período">
          {RANGOS.map((x) => (
            <button key={x.id} role="tab" aria-selected={rango === x.id} onClick={() => setRango(x.id)}
              className={`rounded-md px-3 py-1 text-sm ${rango === x.id ? 'bg-white text-neutral-950' : 'text-neutral-400 hover:text-white'}`}>
              {x.texto}
            </button>
          ))}
        </div>
      </div>

      {error && <Aviso tipo="error" texto={error} />}
      {cargando && !datos ? <Cargando /> : datos && (
        <div className={`space-y-6 ${cargando ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato titulo="Asistencias" valor={r.total} pie={`${formatearFecha(datos.desde)} al ${formatearFecha(datos.hasta)}`} />
            <Dato titulo="Promedio por día" valor={formatearDecimal(r.promedioDiario)} pie={`en ${datos.dias_con_asistencia} días con gente`} />
            <Dato titulo="Día más concurrido" valor={r.diaTop ? DIAS_LARGOS[r.diaTop.dia - 1] : '—'}
              pie={r.diaTop ? `${formatearDecimal(r.diaTop.promedio)} alumnos en promedio` : 'sin datos'} capitalizar />
            <Dato titulo="Franja pico" valor={r.franjaPico ? textoFranja(r.franjaPico.hora) : '—'}
              pie={r.franjaPico ? `${DIAS_LARGOS[r.franjaPico.dia - 1]} · ${formatearDecimal(r.franjaPico.promedio)} alumnos` : 'sin datos'} />
          </div>

          <BarrasDiarias dias={datos.dias} />

          <section className="space-y-2">
            <h2 className="font-medium">Promedio por día de la semana</h2>
            <PorDiaSemana filas={datos.por_dia_semana} />
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">Franjas horarias</h2>
              <button onClick={() => setVerTabla((v) => !v)} className="text-sm text-neutral-400 underline hover:text-white">
                {verTabla ? 'Ver mapa' : 'Ver como tabla'}
              </button>
            </div>
            <p className="text-sm text-neutral-400">Promedio de alumnos que llegan en cada hora, por día de la semana. Más claro = más gente.</p>
            {verTabla ? <TablaFranjas mapa={mapa} /> : <MapaFranjas mapa={mapa} />}
          </section>
        </div>
      )}
    </div>
  )
}

function Dato({ titulo, valor, pie, capitalizar }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-sm text-neutral-400">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${capitalizar ? 'capitalize' : ''}`}>{valor}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{pie}</div>
    </div>
  )
}

// Una barra por día; tooltip con la fecha y la cantidad
function BarrasDiarias({ dias }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...dias.map((d) => d.asistencias))
  const marcas = [0, Math.round(max / 2), max]
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Asistencias por día</h2>
      <div className="relative rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex h-40 gap-3">
          <div className="flex flex-col justify-between text-right text-xs tabular-nums text-neutral-500">
            {[...marcas].reverse().map((m) => <span key={m}>{m}</span>)}
          </div>
          <div className="relative flex flex-1 items-end gap-[2px] border-b border-neutral-700" onMouseLeave={() => setHover(null)}>
            {dias.map((d, i) => (
              <div key={d.fecha} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
                tabIndex={0} aria-label={`${formatearFecha(d.fecha)}: ${d.asistencias} asistencias`}>
                <div className={`w-full rounded-t-[4px] ${hover === i ? 'bg-sky-300' : 'bg-sky-500'}`}
                  style={{ height: `${(d.asistencias / max) * 100}%`, minHeight: d.asistencias ? 2 : 0 }} />
              </div>
            ))}
            {hover !== null && (
              <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs shadow-lg"
                style={{ left: `${((hover + 0.5) / dias.length) * 100}%` }}>
                <span className="text-neutral-400">{DIAS[(new Date(`${dias[hover].fecha}T12:00:00Z`).getUTCDay() + 6) % 7]} {formatearFecha(dias[hover].fecha).slice(0, 5)}</span>{' '}
                <span className="font-semibold text-white">{dias[hover].asistencias}</span>
              </div>
            )}
          </div>
        </div>
        <div className="ml-8 mt-1 flex justify-between text-xs text-neutral-500">
          <span>{formatearFecha(dias[0]?.fecha).slice(0, 5)}</span>
          <span>{formatearFecha(dias[dias.length - 1]?.fecha).slice(0, 5)}</span>
        </div>
      </div>
    </section>
  )
}

function PorDiaSemana({ filas }) {
  const max = Math.max(1, ...filas.map((f) => Number(f.promedio)))
  return (
    <div className="space-y-1.5 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      {filas.map((f) => (
        <div key={f.dia} className="flex items-center gap-3 text-sm">
          <span className="w-9 shrink-0 text-neutral-400">{DIAS[f.dia - 1]}</span>
          <div className="h-5 flex-1">
            <div className="h-full rounded-r-[4px] bg-sky-500" style={{ width: `${(Number(f.promedio) / max) * 100}%`, minWidth: Number(f.promedio) ? 2 : 0 }}
              title={`${DIAS_LARGOS[f.dia - 1]}: ${formatearDecimal(f.promedio)} en promedio (${f.total} en ${f.veces} ${DIAS_LARGOS[f.dia - 1]})`} />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums">{formatearDecimal(f.promedio)}</span>
        </div>
      ))}
    </div>
  )
}

function MapaFranjas({ mapa }) {
  const [hover, setHover] = useState(null) // [fila, col]
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900 p-3">
      <table className="w-full min-w-[420px] border-separate border-spacing-[2px] text-xs" onMouseLeave={() => setHover(null)}>
        <thead>
          <tr>
            <th className="w-14" />
            {DIAS.map((d) => <th key={d} className="pb-1 font-medium text-neutral-400">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {mapa.horas.map((h, i) => (
            <tr key={h}>
              <th className="pr-2 text-right font-normal tabular-nums text-neutral-500">{String(h).padStart(2, '0')}:00</th>
              {mapa.celdas[i].map((v, j) => {
                const activa = hover && hover[0] === i && hover[1] === j
                return (
                  <td key={j} onMouseEnter={() => setHover([i, j])} tabIndex={0} onFocus={() => setHover([i, j])}
                    aria-label={`${DIAS_LARGOS[j]} ${textoFranja(h)}: ${formatearDecimal(v)} alumnos en promedio`}
                    className={`relative h-7 rounded-[4px] bg-neutral-800/60 ${activa ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: colorCelda(intensidad(v, mapa.maximo)) }}>
                    {activa && (
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 shadow-lg">
                        <span className="text-neutral-400">{DIAS[j]} {textoFranja(h)}</span>{' '}
                        <span className="font-semibold text-white">{formatearDecimal(v)}</span>
                        <span className="text-neutral-400"> · {mapa.totales[i][j]} en total</span>
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-neutral-400">
        <span>0</span>
        <span className="h-2.5 w-32 rounded-full" style={{ background: 'linear-gradient(to right, rgba(56,189,248,.12), rgba(56,189,248,.9))' }} />
        <span className="tabular-nums">{formatearDecimal(mapa.maximo)} alumnos</span>
      </div>
    </div>
  )
}

function TablaFranjas({ mapa }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-neutral-900 text-neutral-400">
          <tr><th className="px-3 py-2 text-left font-medium">Franja</th>{DIAS.map((d) => <th key={d} className="px-2 py-2 text-right font-medium">{d}</th>)}</tr>
        </thead>
        <tbody>
          {mapa.horas.map((h, i) => (
            <tr key={h} className="border-t border-neutral-800">
              <td className="px-3 py-1.5 text-neutral-400">{textoFranja(h)}</td>
              {mapa.celdas[i].map((v, j) => <td key={j} className="px-2 py-1.5 text-right">{v ? formatearDecimal(v) : '·'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
