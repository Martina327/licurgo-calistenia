import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, hoyAR, linkWhatsApp, mensajeError } from '../../lib/utils'
import { esPDF } from '../../lib/comprobantes'
import { BUCKET_APTOS, MOTIVOS_RECHAZO_APTO, vencimientoSugerido } from '../../lib/aptos'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import EstadoComprobante from '../../components/comprobantes/EstadoComprobante'

const CAMPOS = 'id, alumno_id, archivo_path, fecha_emision, estado, motivo_rechazo, created_at, revisado_at, nombre, apellido, dni, telefono, fecha_vencimiento, revisado_por_nombre'
const DURACION_LINK = 600

const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// Aptos médicos que cargan los alumnos (B4). Recepción y SuperAdmin:
//   · Aprobar → se crea el certificado con su vencimiento (por defecto, un año desde la firma)
//     y el alumno pasa a figurar "Vigente"
//   · Rechazar → con motivo, que el alumno ve en su pantalla de apto médico
export default function Aptos() {
  const [pestania, setPestania] = useState('pendientes')
  const [pendientes, setPendientes] = useState([])
  const [revisados, setRevisados] = useState([])
  const [links, setLinks] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('v_certificados_cargas').select(CAMPOS).eq('estado', 'Pendiente').order('created_at'),
      supabase.from('v_certificados_cargas').select(CAMPOS).neq('estado', 'Pendiente').order('revisado_at', { ascending: false }).limit(30),
    ])
    const error = p.error ?? r.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setPendientes(p.data ?? [])
    setRevisados(r.data ?? [])
    window.dispatchEvent(new Event('licurgo:comprobantes')) // el contador del menú se actualiza
    const rutas = [...(p.data ?? []), ...(r.data ?? [])].map((c) => c.archivo_path)
    if (rutas.length) {
      const { data } = await supabase.storage.from(BUCKET_APTOS).createSignedUrls(rutas, DURACION_LINK)
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
      <h1 className="text-xl font-semibold">Aptos médicos</h1>
      <div className="flex gap-2" role="tablist">
        {[['pendientes', 'Pendientes', pendientes.length], ['revisados', 'Revisados', null]].map(([k, t, n]) => (
          <button key={k} role="tab" aria-selected={pestania === k} onClick={() => { setPestania(k); setAbierto(null) }}
            className={`rounded-lg px-3 py-1.5 text-sm ${pestania === k ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'}`}>
            {t}
            {n != null && <span className={`ml-1.5 rounded-full px-1.5 text-xs ${n ? 'bg-amber-400 text-neutral-950' : 'text-neutral-500'}`}>{n}</span>}
          </button>
        ))}
      </div>

      {aviso && <Aviso {...aviso} />}

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          {pestania === 'pendientes' ? 'No hay aptos médicos para revisar.' : 'Todavía no se revisó ningún apto.'}
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
                      ? `Enviado ${fechaHora(c.created_at)} · firmado ${formatearFecha(c.fecha_emision)}`
                      : `${formatearFecha(c.revisado_at)}${c.revisado_por_nombre ? ` · ${c.revisado_por_nombre}` : ''}${c.estado === 'Aprobado' ? ` · vence ${formatearFecha(c.fecha_vencimiento)}` : ` · ${c.motivo_rechazo}`}`}
                  </div>
                </div>
                {c.estado !== 'Pendiente' && <EstadoComprobante estado={c.estado} />}
                <span aria-hidden className="shrink-0 text-neutral-500">{abierto === c.id ? '▾' : '▸'}</span>
              </button>
              {abierto === c.id && (
                <Detalle c={c} url={links[c.archivo_path]} onTerminado={terminar} onError={(texto) => setAviso({ tipo: 'error', texto })} />
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
    return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold text-neutral-300">{pdf ? 'PDF' : '—'}</span>
  }
  return <img src={url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md bg-neutral-800 object-cover" />
}

function Detalle({ c, url, onTerminado, onError }) {
  const [emision, setEmision] = useState(c.fecha_emision)
  const [vence, setVence] = useState(vencimientoSugerido(c.fecha_emision))
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pendiente = c.estado === 'Pendiente'
  const pdf = esPDF(c.archivo_path)

  const cambiarEmision = (v) => { setEmision(v); setVence(vencimientoSugerido(v)) }

  const aprobar = async () => {
    if (!emision || !vence || vence <= emision) return onError('El vencimiento tiene que ser posterior a la fecha de firma.')
    setEnviando(true)
    const { error } = await supabase.rpc('aprobar_certificado', { p_carga_id: c.id, p_emision: emision, p_vencimiento: vence })
    setEnviando(false)
    if (error) return onError(mensajeError(error))
    onTerminado(`Apto de ${c.nombre} ${c.apellido} aprobado. Vigente hasta el ${formatearFecha(vence)}.`)
  }
  const rechazar = async () => {
    if (!motivo.trim()) return onError('Elegí o escribí el motivo del rechazo.')
    setEnviando(true)
    const { error } = await supabase.rpc('rechazar_certificado', { p_carga_id: c.id, p_motivo: motivo.trim() })
    setEnviando(false)
    if (error) return onError(mensajeError(error))
    onTerminado(`Apto de ${c.nombre} ${c.apellido} rechazado. Lo va a ver con el motivo.`)
  }

  const input = 'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400 [color-scheme:dark]'

  return (
    <div className="grid gap-4 border-t border-neutral-800 bg-neutral-900/60 p-3 sm:grid-cols-2">
      <div className="space-y-2">
        {!url ? (
          <p className="rounded-lg bg-neutral-800 p-4 text-sm text-neutral-400">No se pudo cargar el archivo.</p>
        ) : pdf ? (
          <>
            <iframe title="Apto médico PDF" src={url} className="hidden h-80 w-full rounded-lg bg-white sm:block" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-neutral-700 px-3 py-3 sm:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold">PDF</span>
              <span className="font-medium">Abrir el apto</span>
            </a>
          </>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={`Apto de ${c.nombre} ${c.apellido}`} className="max-h-96 w-full rounded-lg bg-neutral-800 object-contain" />
          </a>
        )}
      </div>

      <div className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-neutral-400">Alumno</dt><dd>{c.nombre} {c.apellido} · DNI {c.dni}</dd>
          <dt className="text-neutral-400">Enviado</dt><dd>{fechaHora(c.created_at)}</dd>
          {!pendiente && <><dt className="text-neutral-400">Firmado</dt><dd>{formatearFecha(c.fecha_emision)}</dd></>}
          {c.estado === 'Aprobado' && <><dt className="text-neutral-400">Vence</dt><dd>{formatearFecha(c.fecha_vencimiento)}</dd></>}
          {c.estado === 'Rechazado' && <><dt className="text-neutral-400">Motivo</dt><dd>{c.motivo_rechazo}</dd></>}
          {!pendiente && c.revisado_por_nombre && <><dt className="text-neutral-400">Revisó</dt><dd>{c.revisado_por_nombre} · {formatearFecha(c.revisado_at)}</dd></>}
        </dl>

        {c.estado === 'Rechazado' && c.telefono && (
          <a href={linkWhatsApp(c.telefono, `Hola ${c.nombre}, te escribimos de Licurgo Calistenia. Rechazamos tu apto médico: ${c.motivo_rechazo}. Podés subir uno nuevo desde la app.`)}
            target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800">
            Avisarle por WhatsApp
          </a>
        )}

        {pendiente && !rechazando && (
          <div className="space-y-3 border-t border-neutral-800 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-neutral-300">Firmado el</span>
                <input type="date" value={emision} max={hoyAR()} onChange={(e) => cambiarEmision(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className="text-neutral-300">Vence el</span>
                <input type="date" value={vence} min={emision} onChange={(e) => setVence(e.target.value)} className={input} />
              </label>
            </div>
            <p className="text-xs text-neutral-500">Revisá la fecha del certificado. El vencimiento se propone a un año; si el médico indicó otro, cambialo.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={aprobar} disabled={enviando}
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-40">
                {enviando ? 'Aprobando…' : 'Aprobar apto'}
              </button>
              <button onClick={() => setRechazando(true)} disabled={enviando}
                className="rounded-lg border border-red-900 px-4 py-2 text-red-300 hover:bg-red-950">Rechazar</button>
            </div>
          </div>
        )}

        {pendiente && rechazando && (
          <div className="space-y-2 border-t border-neutral-800 pt-3">
            <p className="text-neutral-300">¿Por qué lo rechazás? <span className="text-neutral-500">El alumno lo va a ver.</span></p>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_RECHAZO_APTO.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)}
                  className={`rounded-full px-2.5 py-1 text-xs ${motivo === m ? 'bg-red-900 text-red-100' : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}>
                  {m}
                </button>
              ))}
            </div>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={200} placeholder="O escribí el motivo…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400" />
            <div className="flex flex-wrap gap-2">
              <button onClick={rechazar} disabled={enviando}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-40">
                {enviando ? 'Rechazando…' : 'Confirmar rechazo'}
              </button>
              <button onClick={() => { setRechazando(false); setMotivo('') }} className="rounded-lg px-3 py-2 text-neutral-400 hover:text-white">Volver</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
