import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, formatearPesos, hoyAR, linkWhatsApp, mensajeError } from '../../lib/utils'
import { BUCKET, MOTIVOS_RECHAZO, esPDF, leerMonto, nuevoVencimiento } from '../../lib/comprobantes'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import EstadoComprobante from '../../components/comprobantes/EstadoComprobante'

const CAMPOS = 'id, alumno_id, archivo_path, monto_declarado, estado, motivo_rechazo, created_at, revisado_at, nombre, apellido, dni, telefono, fecha_vencimiento, precio_plan, estado_alumno, monto_acreditado, revisado_por_nombre, cuenta_destino'
const DURACION_LINK = 600 // segundos que vale el link firmado del archivo (bucket privado)

const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// B5 · Validar comprobantes (CU08, RF03)
//   · Bandeja de pendientes, del más viejo al más nuevo (se atiende por orden de llegada)
//   · Aprobar → aprobar_comprobante: ingreso por transferencia + 30 días al vencimiento (regla de A2)
//   · Rechazar → rechazar_comprobante con motivo; el alumno lo ve en "Mi membresía"
export default function Comprobantes() {
  const [pestania, setPestania] = useState('pendientes')
  const [pendientes, setPendientes] = useState([])
  const [revisados, setRevisados] = useState([])
  const [faltantes, setFaltantes] = useState({}) // alumno_id → datos de ficha que faltan
  const [links, setLinks] = useState({}) // archivo_path → url firmada
  const [abierto, setAbierto] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('v_comprobantes').select(CAMPOS).eq('estado', 'Pendiente').order('created_at'),
      supabase.from('v_comprobantes').select(CAMPOS).neq('estado', 'Pendiente').order('revisado_at', { ascending: false }).limit(30),
    ])
    const error = p.error ?? r.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    const pend = p.data ?? []
    setPendientes(pend)
    setRevisados(r.data ?? [])
    window.dispatchEvent(new Event('licurgo:comprobantes')) // el contador del menú se actualiza

    // Ficha incompleta: el primer pago no se puede aprobar sin ficha (regla de A1/A2)
    const primeros = pend.filter((c) => !c.fecha_vencimiento).map((c) => c.alumno_id)
    if (primeros.length) {
      const { data } = await supabase.from('v_membresias').select('alumno_id, datos_faltantes').in('alumno_id', primeros)
      setFaltantes(Object.fromEntries((data ?? []).map((m) => [m.alumno_id, m.datos_faltantes ?? []])))
    } else setFaltantes({})

    // Links firmados para las miniaturas (una sola llamada)
    const rutas = [...pend, ...(r.data ?? [])].map((c) => c.archivo_path)
    if (rutas.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, DURACION_LINK)
      setLinks(Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl])))
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const terminar = async (texto) => {
    setAbierto(null)
    setAviso({ tipo: 'ok', texto })
    await cargar()
  }

  if (cargando) return <Cargando />

  const lista = pestania === 'pendientes' ? pendientes : revisados

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Comprobantes de transferencia</h1>

      <div className="flex gap-2" role="tablist">
        {[['pendientes', 'Pendientes', pendientes.length], ['revisados', 'Revisados', null]].map(([k, t, n]) => (
          <button key={k} role="tab" aria-selected={pestania === k} onClick={() => { setPestania(k); setAbierto(null) }}
            className={`rounded-lg px-3 py-1.5 text-sm ${pestania === k ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'}`}>
            {t}
            {n != null && (
              <span className={`ml-1.5 rounded-full px-1.5 text-xs ${n ? 'bg-amber-400 text-neutral-950' : 'text-neutral-500'}`}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {aviso && <Aviso {...aviso} />}

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          {pestania === 'pendientes' ? 'No hay comprobantes para revisar.' : 'Todavía no se revisó ningún comprobante.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {lista.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setAviso(null); setAbierto(abierto === c.id ? null : c.id) }} aria-expanded={abierto === c.id}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-neutral-900">
                <Miniatura url={links[c.archivo_path]} pdf={esPDF(c.archivo_path)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.apellido}, {c.nombre}</div>
                  <div className="truncate text-sm text-neutral-400">
                    {c.estado === 'Pendiente'
                      ? `Enviado ${fechaHora(c.created_at)} · declara ${c.monto_declarado ? formatearPesos(c.monto_declarado) : 'sin monto'}`
                      : `${formatearFecha(c.revisado_at)}${c.revisado_por_nombre ? ` · ${c.revisado_por_nombre}` : ''}${c.estado === 'Aprobado' ? ` · ${formatearPesos(c.monto_acreditado)}` : ` · ${c.motivo_rechazo}`}`}
                  </div>
                </div>
                {c.estado === 'Pendiente'
                  ? (c.estado_alumno === 'En clase de prueba' && <span className="shrink-0 rounded-full bg-sky-950 px-2 py-0.5 text-xs text-sky-300">1.er pago</span>)
                  : <EstadoComprobante estado={c.estado} />}
                <span aria-hidden className="shrink-0 text-neutral-500">{abierto === c.id ? '▾' : '▸'}</span>
              </button>
              {abierto === c.id && (
                <Detalle c={c} url={links[c.archivo_path]} faltantes={faltantes[c.alumno_id] ?? []}
                  onTerminado={terminar} onError={(texto) => setAviso({ tipo: 'error', texto })} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Miniatura({ url, pdf }) {
  if (pdf || !url) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold text-neutral-300">
        {pdf ? 'PDF' : '—'}
      </span>
    )
  }
  return <img src={url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md bg-neutral-800 object-cover" />
}

function Detalle({ c, url, faltantes, onTerminado, onError }) {
  const [monto, setMonto] = useState(String(Math.round(c.precio_plan ?? c.monto_declarado ?? 0) || ''))
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pendiente = c.estado === 'Pendiente'
  const pdf = esPDF(c.archivo_path)
  const vence = nuevoVencimiento(c.fecha_vencimiento, hoyAR())
  const fichaIncompleta = pendiente && !c.fecha_vencimiento && faltantes.length > 0
  const montoDistinto = c.monto_declarado && c.precio_plan && Number(c.monto_declarado) !== Number(c.precio_plan)

  const aprobar = async () => {
    const m = leerMonto(monto)
    if (!m) return onError('Indicá el monto a acreditar (mayor a 0).')
    setEnviando(true)
    const { data, error } = await supabase.rpc('aprobar_comprobante', { p_comprobante_id: c.id, p_monto: m })
    setEnviando(false)
    if (error) return onError(mensajeError(error))
    onTerminado(`Pago de ${c.nombre} ${c.apellido} aprobado: ${formatearPesos(m)}. Nuevo vencimiento: ${formatearFecha(data)}.`)
  }

  const rechazar = async () => {
    if (!motivo.trim()) return onError('Elegí o escribí el motivo del rechazo.')
    setEnviando(true)
    const { error } = await supabase.rpc('rechazar_comprobante', { p_comprobante_id: c.id, p_motivo: motivo.trim() })
    setEnviando(false)
    if (error) return onError(mensajeError(error))
    onTerminado(`Comprobante de ${c.nombre} ${c.apellido} rechazado. Lo va a ver en su pantalla con el motivo.`)
  }

  const avisoWhatsApp = linkWhatsApp(c.telefono,
    `Hola ${c.nombre}, te escribimos de Licurgo Calistenia. Rechazamos tu comprobante de transferencia: ${c.motivo_rechazo}. Podés subir uno nuevo desde la app.`)

  return (
    <div className="grid gap-4 border-t border-neutral-800 bg-neutral-900/60 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Archivo: imagen grande o PDF */}
      <div className="space-y-2">
        {!url ? (
          <p className="rounded-lg bg-neutral-800 p-4 text-sm text-neutral-400">No se pudo cargar el archivo.</p>
        ) : pdf ? (
          <>
            {/* En el celular el navegador no muestra PDFs incrustados: se abre aparte */}
            <iframe title="Comprobante PDF" src={url} className="hidden h-80 w-full rounded-lg bg-white sm:block" />
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-neutral-700 px-3 py-3 sm:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold">PDF</span>
              <span className="font-medium">Abrir el comprobante</span>
            </a>
          </>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={`Comprobante de ${c.nombre} ${c.apellido}`} className="max-h-96 w-full rounded-lg bg-neutral-800 object-contain" />
          </a>
        )}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={`${pdf ? 'hidden sm:inline-block' : 'inline-block'} text-xs text-neutral-400 underline hover:text-white`}>
            Abrir en otra pestaña
          </a>
        )}
      </div>

      {/* Datos y acciones */}
      <div className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-neutral-400">Alumno</dt><dd>{c.nombre} {c.apellido} · DNI {c.dni}</dd>
          <dt className="text-neutral-400">Enviado</dt><dd>{fechaHora(c.created_at)}</dd>
          {c.cuenta_destino && <><dt className="text-neutral-400">Transfirió a</dt><dd className="font-medium">{c.cuenta_destino}</dd></>}
          <dt className="text-neutral-400">Declara</dt>
          <dd>{c.monto_declarado ? formatearPesos(c.monto_declarado) : '—'}{montoDistinto && <span className="text-amber-300"> · la cuota es {formatearPesos(c.precio_plan)}</span>}</dd>
          <dt className="text-neutral-400">Vencimiento</dt><dd>{c.fecha_vencimiento ? formatearFecha(c.fecha_vencimiento) : 'Primer pago'}</dd>
          {pendiente && <><dt className="text-neutral-400">Si aprobás</dt><dd className="font-semibold text-emerald-300">{formatearFecha(vence)}</dd></>}
          {c.estado === 'Aprobado' && <><dt className="text-neutral-400">Acreditado</dt><dd>{formatearPesos(c.monto_acreditado)}</dd></>}
          {c.estado === 'Rechazado' && <><dt className="text-neutral-400">Motivo</dt><dd>{c.motivo_rechazo}</dd></>}
          {!pendiente && c.revisado_por_nombre && <><dt className="text-neutral-400">Revisó</dt><dd>{c.revisado_por_nombre} · {formatearFecha(c.revisado_at)}</dd></>}
        </dl>

        {fichaIncompleta && (
          <div className="rounded-lg bg-amber-950/70 px-3 py-2 text-amber-200">
            Es su primer pago y le falta completar la ficha ({faltantes.join(', ')}).{' '}
            <Link to={`/recepcion/alumnos/${c.alumno_id}?editar=1`} className="font-semibold underline">Completar ficha</Link> y después aprobá.
          </div>
        )}

        {c.estado === 'Rechazado' && c.telefono && (
          <a href={avisoWhatsApp} target="_blank" rel="noopener noreferrer"
            className="inline-block rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800">
            Avisarle por WhatsApp
          </a>
        )}

        {pendiente && !rechazando && (
          <div className="space-y-2 border-t border-neutral-800 pt-3">
            <label className="block">
              <span className="text-neutral-300">Monto a acreditar</span>
              <div className="mt-1 flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
                <span className="pl-3 text-neutral-500">$</span>
                <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal"
                  className="w-full bg-transparent px-2 py-2 outline-none" />
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={aprobar} disabled={enviando || fichaIncompleta}
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-40">
                {enviando ? 'Aprobando…' : 'Aprobar pago'}
              </button>
              <button onClick={() => setRechazando(true)} disabled={enviando}
                className="rounded-lg border border-red-900 px-4 py-2 text-red-300 hover:bg-red-950">
                Rechazar
              </button>
            </div>
            <p className="text-xs text-neutral-500">Revisá en el banco que el importe y la fecha coincidan antes de aprobar.</p>
          </div>
        )}

        {pendiente && rechazando && (
          <div className="space-y-2 border-t border-neutral-800 pt-3">
            <p className="text-neutral-300">¿Por qué lo rechazás? <span className="text-neutral-500">El alumno lo va a ver.</span></p>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_RECHAZO.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)}
                  className={`rounded-full px-2.5 py-1 text-xs ${motivo === m ? 'bg-red-900 text-red-100' : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}>
                  {m}
                </button>
              ))}
            </div>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={200}
              placeholder="O escribí el motivo…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400" />
            <div className="flex flex-wrap gap-2">
              <button onClick={rechazar} disabled={enviando}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-40">
                {enviando ? 'Rechazando…' : 'Confirmar rechazo'}
              </button>
              <button onClick={() => { setRechazando(false); setMotivo('') }} className="rounded-lg px-3 py-2 text-neutral-400 hover:text-white">
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
