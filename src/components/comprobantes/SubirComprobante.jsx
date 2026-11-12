import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { mensajeError } from '../../lib/utils'
import { ACEPTA, BUCKET, leerMonto, rutaArchivo, validarArchivo } from '../../lib/comprobantes'
import Aviso from '../Aviso'

// CU07 · Subir comprobante de transferencia (RF02, RNF02)
//   1. El archivo va al bucket privado `comprobantes`, en la carpeta del alumno.
//   2. Se registra el comprobante en estado Pendiente.
//   Si el paso 2 falla, se borra el archivo del paso 1 (la política solo deja borrar
//   archivos propios que no quedaron registrados).
export default function SubirComprobante({ alumnoId, montoSugerido, onSubido }) {
  const [archivo, setArchivo] = useState(null)
  const [vista, setVista] = useState(null) // URL local para la miniatura
  const [monto, setMonto] = useState(montoSugerido ? String(Math.round(montoSugerido)) : '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const input = useRef(null)

  useEffect(() => () => vista && URL.revokeObjectURL(vista), [vista])

  const elegir = (ev) => {
    const f = ev.target.files?.[0] ?? null
    setError('')
    const problema = f && validarArchivo(f)
    if (problema) {
      setError(problema)
      setArchivo(null)
      setVista(null)
      ev.target.value = ''
      return
    }
    setArchivo(f)
    setVista(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }

  const enviar = async (ev) => {
    ev.preventDefault()
    setError('')
    const problema = validarArchivo(archivo)
    if (problema) return setError(problema)
    const montoDeclarado = leerMonto(monto)
    if (Number.isNaN(montoDeclarado)) return setError('Revisá el monto: solo números, mayor a 0.')

    setEnviando(true)
    const ruta = rutaArchivo(alumnoId, archivo)
    const subida = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: false })
    if (subida.error) {
      setEnviando(false)
      return setError('No se pudo subir el archivo. Revisá tu conexión y probá de nuevo.')
    }
    const { error: errAlta } = await supabase
      .from('comprobantes_pago')
      .insert({ alumno_id: alumnoId, archivo_path: ruta, monto_declarado: montoDeclarado })
    if (errAlta) {
      await supabase.storage.from(BUCKET).remove([ruta]) // no dejar el archivo suelto
      setEnviando(false)
      return setError(errAlta.code === '23505'
        ? 'Ya tenés un comprobante en revisión. Esperá a que recepción lo revise.'
        : mensajeError(errAlta))
    }
    setEnviando(false)
    setArchivo(null)
    setVista(null)
    onSubido()
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <input ref={input} type="file" accept={ACEPTA} onChange={elegir} className="hidden" id="archivo-comprobante" />
      <label htmlFor="archivo-comprobante"
        className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-neutral-700 px-3 py-3 active:bg-neutral-800">
        {vista ? (
          <img src={vista} alt="Vista previa del comprobante" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        ) : (
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xl">
            {archivo ? '📄' : '＋'}
          </span>
        )}
        <span className="min-w-0 text-sm">
          <span className="block truncate text-neutral-100">{archivo ? archivo.name : 'Elegir foto o PDF'}</span>
          <span className="block text-neutral-500">{archivo ? 'Tocá para cambiarlo' : 'Captura del banco o PDF, hasta 5 MB'}</span>
        </span>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-300">Monto que transferiste</span>
        <div className="mt-1 flex items-center rounded-xl border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
          <span className="pl-3 text-neutral-500">$</span>
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal"
            className="w-full bg-transparent px-2 py-2.5 outline-none" />
        </div>
      </label>

      {error && <Aviso tipo="error" texto={error} />}

      <button disabled={enviando || !archivo}
        className="w-full rounded-xl bg-white py-3 font-semibold text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-500">
        {enviando ? 'Enviando…' : 'Enviar comprobante'}
      </button>
    </form>
  )
}
