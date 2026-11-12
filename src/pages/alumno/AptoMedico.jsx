import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import { esPDF, rutaArchivo, validarArchivo } from '../../lib/comprobantes'
import { BUCKET_APTOS, TONO_APTO, situacionApto } from '../../lib/aptos'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import ElegirArchivo from '../../components/comprobantes/ElegirArchivo'
import EstadoComprobante from '../../components/comprobantes/EstadoComprobante'
import { Chevron } from '../../components/Iconos'

// Apto médico del alumno (pantalla aparte de Mensualidad):
//   · Estado: vigente hasta / por vencer / vencido / en revisión / rechazado con motivo
//   · Subir la foto o PDF del apto con la fecha en que lo firmó el médico → queda Pendiente
//   · Lo que cargó (tocar para ver el archivo)
// Recién cuando recepción lo aprueba figura Vigente.
export default function AptoMedico() {
  const { perfil } = useAuth()
  const [datos, setDatos] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [renovar, setRenovar] = useState(false)

  const cargar = useCallback(async () => {
    const [m, c] = await Promise.all([
      supabase.from('v_membresias').select('estado_certificado, certificado_vencimiento').maybeSingle(),
      supabase.from('v_certificados_cargas').select('id, archivo_path, fecha_emision, estado, motivo_rechazo, created_at, fecha_vencimiento')
        .order('created_at', { ascending: false }),
    ])
    const error = m.error ?? c.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setDatos({ membresia: m.data, cargas: c.data ?? [] })
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const abrir = async (path) => {
    const { data, error } = await supabase.storage.from(BUCKET_APTOS).createSignedUrl(path, 60)
    if (error) return setAviso({ tipo: 'error', texto: 'No se pudo abrir el archivo.' })
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (!datos) return <Cargando />
  const { membresia, cargas } = datos
  const sit = situacionApto({
    estadoCertificado: membresia?.estado_certificado,
    vencimiento: formatearFecha(membresia?.certificado_vencimiento),
    ultimaCarga: cargas[0],
  })

  return (
    <div className="space-y-6">
      {aviso && <Aviso {...aviso} />}

      <section className={`rounded-3xl border p-5 ${TONO_APTO[sit.tono]}`}>
        <p className="text-sm opacity-80">Apto médico</p>
        <p className="mt-1 text-3xl font-bold">{sit.titulo}</p>
        <p className="mt-1 text-sm opacity-90">{sit.texto}</p>
        {sit.rechazo && (
          <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            Rechazamos el último que enviaste: {sit.rechazo}.
          </p>
        )}
      </section>

      {sit.puedeSubir && sit.tono === 'ok' && !renovar && (
        <button onClick={() => setRenovar(true)}
          className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-medium text-neutral-200 active:bg-neutral-800">
          Subir uno nuevo
        </button>
      )}

      {sit.puedeSubir && (sit.tono !== 'ok' || renovar) && (
        <section className="space-y-2.5">
          <h2 className="px-1 text-sm font-medium text-neutral-300">Subir apto médico</h2>
          <div className="rounded-2xl bg-neutral-900 p-3">
            <SubirApto alumnoId={perfil.id}
              onSubido={() => { setRenovar(false); setAviso({ tipo: 'ok', texto: 'Apto enviado. Recepción lo va a revisar.' }); cargar() }} />
          </div>
        </section>
      )}

      {cargas.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="px-1 text-sm font-medium text-neutral-300">Lo que cargaste</h2>
          <ul className="divide-y divide-neutral-800 overflow-hidden rounded-2xl bg-neutral-900">
            {cargas.map((c) => (
              <li key={c.id}>
                <button onClick={() => abrir(c.archivo_path)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-800">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-[10px] font-semibold text-neutral-300">
                    {esPDF(c.archivo_path) ? 'PDF' : 'IMG'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Firmado el {formatearFecha(c.fecha_emision)}</span>
                    <span className="block truncate text-sm text-neutral-400">
                      Enviado el {formatearFecha(c.created_at)}
                      {c.estado === 'Aprobado' && c.fecha_vencimiento && ` · vence ${formatearFecha(c.fecha_vencimiento)}`}
                      {c.estado === 'Rechazado' && ` · ${c.motivo_rechazo}`}
                    </span>
                  </span>
                  <EstadoComprobante estado={c.estado} />
                  <Chevron className="h-5 w-5 shrink-0 text-neutral-600" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SubirApto({ alumnoId, onSubido }) {
  const [archivo, setArchivo] = useState(null)
  const [emision, setEmision] = useState(hoyAR())
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (ev) => {
    ev.preventDefault()
    setError('')
    const problema = validarArchivo(archivo)
    if (problema) return setError(problema)
    if (!emision || emision > hoyAR()) return setError('Indicá la fecha en que lo firmó el médico (no puede ser futura).')
    setEnviando(true)
    const ruta = rutaArchivo(alumnoId, archivo)
    const subida = await supabase.storage.from(BUCKET_APTOS).upload(ruta, archivo, { contentType: archivo.type, upsert: false })
    if (subida.error) {
      setEnviando(false)
      return setError('No se pudo subir el archivo. Revisá tu conexión y probá de nuevo.')
    }
    const { error: e } = await supabase.from('certificados_cargas').insert({ alumno_id: alumnoId, archivo_path: ruta, fecha_emision: emision })
    if (e) {
      await supabase.storage.from(BUCKET_APTOS).remove([ruta])
      setEnviando(false)
      return setError(e.code === '23505' ? 'Ya tenés un apto en revisión.' : mensajeError(e))
    }
    setEnviando(false)
    setArchivo(null)
    onSubido()
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <ElegirArchivo id="archivo-apto" archivo={archivo} onElegir={setArchivo} onError={setError}
        ayuda="Foto del certificado o PDF, hasta 5 MB" />
      <label className="block text-sm">
        <span className="text-neutral-300">Fecha en que lo firmó el médico</span>
        <input type="date" value={emision} max={hoyAR()} onChange={(e) => setEmision(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 outline-none focus:border-neutral-400 [color-scheme:dark]" />
      </label>
      {error && <Aviso tipo="error" texto={error} />}
      <button disabled={enviando || !archivo}
        className="w-full rounded-xl bg-white py-3 font-semibold text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-500">
        {enviando ? 'Enviando…' : 'Enviar apto médico'}
      </button>
    </form>
  )
}
