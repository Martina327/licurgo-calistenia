import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { linkWhatsApp, mensajeError, MENSAJES_WHATSAPP } from '../lib/utils'
import { Chevron, IconoWhatsApp } from './Iconos'

// Aviso de cumpleaños arriba del Mostrador (recepción y dueño).
//   · Cerrado: "Hoy cumple años Lucía Fernández" (o "Hoy cumplen años 3 alumnos").
//   · Al tocarlo: cada alumno con "Saludar": abre WhatsApp con el mensaje de cumpleaños
//     y lo marca como saludado (registrar_saludo_cumple), así el aviso desaparece.
//   · Sin celular cargado: "Ya lo saludé" para sacarlo del aviso.
export default function AvisoCumple() {
  const [cumples, setCumples] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('v_cumpleanos_hoy').select('*').order('apellido')
    // Si la migración todavía no se corrió, el aviso simplemente no aparece
    if (!error) setCumples(data ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const marcarSaludado = async (alumno) => {
    setError('')
    setCumples((cs) => cs.filter((c) => c.alumno_id !== alumno.alumno_id))
    const { error } = await supabase.rpc('registrar_saludo_cumple', { p_alumno_id: alumno.alumno_id })
    if (error) {
      setError(mensajeError(error))
      cargar()
    }
  }

  if (cumples.length === 0 && !error) return null

  const titulo = cumples.length === 1
    ? `Hoy cumple años ${cumples[0].nombre} ${cumples[0].apellido}`
    : `Hoy cumplen años ${cumples.length} alumnos`

  return (
    <div className="overflow-hidden rounded-xl border border-fuchsia-900 bg-fuchsia-950/40 text-sm text-fuchsia-100">
      {cumples.length > 0 && (
        <button
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fuchsia-900/20"
        >
          <span aria-hidden className="text-lg leading-none">🎂</span>
          <span className="flex-1 font-medium">{titulo}</span>
          <Chevron className={`h-4 w-4 transition-transform ${abierto ? 'rotate-90' : ''}`} />
        </button>
      )}

      {error && <p className="px-4 py-2 text-red-300">{error}</p>}

      {abierto && cumples.length > 0 && (
        <ul className="divide-y divide-fuchsia-900/60 border-t border-fuchsia-900/60">
          {cumples.map((c) => {
            const wa = linkWhatsApp(c.telefono, MENSAJES_WHATSAPP.cumple(c.nombre))
            return (
              <li key={c.alumno_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="font-semibold">{c.nombre} {c.apellido}</p>
                  <p className="text-xs text-fuchsia-200/70">Cumple {c.edad} años</p>
                </div>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => marcarSaludado(c)}
                    className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold text-neutral-950 hover:bg-neutral-200"
                  >
                    <IconoWhatsApp className="h-4 w-4" /> Saludar
                  </a>
                ) : (
                  <button onClick={() => marcarSaludado(c)} className="rounded-lg border border-fuchsia-800 px-3 py-1.5 hover:bg-fuchsia-900/40">
                    Sin celular · Ya lo saludé
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
