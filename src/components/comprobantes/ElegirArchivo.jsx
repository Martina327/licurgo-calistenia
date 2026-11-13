import { useEffect, useState } from 'react'
import { ACEPTA, validarArchivo } from '../../lib/comprobantes'

// Selector de foto o PDF con miniatura (comprobantes de pago y apto médico).
// Valida tipo y tamaño; si el archivo no sirve, avisa con onError y no lo toma.
export default function ElegirArchivo({ id, archivo, onElegir, onError, ayuda = 'Foto o PDF, hasta 5 MB' }) {
  const [vista, setVista] = useState(null)

  useEffect(() => {
    if (!archivo || !archivo.type.startsWith('image/')) return setVista(null)
    const url = URL.createObjectURL(archivo)
    setVista(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  const elegir = (ev) => {
    const f = ev.target.files?.[0] ?? null
    onError('')
    const problema = f && validarArchivo(f)
    if (problema) {
      onError(problema)
      onElegir(null)
      ev.target.value = ''
      return
    }
    onElegir(f)
  }

  return (
    <>
      <input type="file" accept={ACEPTA} onChange={elegir} className="hidden" id={id} />
      <label htmlFor={id}
        className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-neutral-700 px-3 py-3 active:bg-neutral-800">
        {vista ? (
          <img src={vista} alt="Vista previa" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        ) : (
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xl">
            {archivo ? '📄' : '＋'}
          </span>
        )}
        <span className="min-w-0 text-sm">
          <span className="block truncate text-neutral-100">{archivo ? archivo.name : 'Elegir foto o PDF'}</span>
          <span className="block text-neutral-500">{archivo ? 'Tocá para cambiarlo' : ayuda}</span>
        </span>
      </label>
    </>
  )
}
