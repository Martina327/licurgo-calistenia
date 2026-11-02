import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BLOQUES_EJERCICIO, formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import { alternarMarca, guardarChecklist, leerChecklist } from '../../lib/checklist'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Filas planas de v_rutina_alumno → días con sus ítems ordenados
function agruparPorDia(filas) {
  const dias = new Map()
  for (const f of filas) {
    if (!dias.has(f.numero_dia)) dias.set(f.numero_dia, { numero: f.numero_dia, nombre: f.dia, items: [] })
    if (f.item_id) dias.get(f.numero_dia).items.push(f)
  }
  return [...dias.values()]
    .sort((a, b) => a.numero - b.numero)
    .map((d) => ({ ...d, items: d.items.sort((a, b) => a.orden - b.orden) }))
}

// CU11 – El alumno consulta su rutina activa y marca lo que va haciendo en el día.
// Las observaciones del coach NO se muestran acá: son privadas.
export default function MiRutina() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [check, setCheck] = useState({ marcados: [], dia: null })

  useEffect(() => {
    // El RLS hace que el alumno solo reciba su propia rutina
    supabase
      .from('v_rutina_alumno')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        setFilas(data ?? [])
        if (data?.length) setCheck(leerChecklist(data[0].rutina_id, hoyAR()))
        setCargando(false)
      })
  }, [])

  const dias = useMemo(() => agruparPorDia(filas), [filas])
  const rutina = filas[0]
  const diaActual = dias.find((d) => d.numero === check.dia) ?? dias[0]

  const actualizar = (nuevo) => {
    setCheck(nuevo)
    guardarChecklist(rutina.rutina_id, nuevo)
  }
  const elegirDia = (numero) => actualizar({ ...check, dia: numero })
  const marcar = (itemId) => actualizar(alternarMarca({ ...check, fecha: hoyAR() }, itemId))
  const reiniciar = () =>
    actualizar({ ...check, fecha: hoyAR(), marcados: check.marcados.filter((id) => !diaActual.items.some((i) => i.item_id === id)) })

  if (cargando) return <Cargando />
  if (error) return <div className="mx-auto max-w-md"><Aviso tipo="error" texto={error} /></div>
  if (!rutina) {
    return (
      <div className="mx-auto max-w-md space-y-2 text-center">
        <h1 className="text-xl font-semibold">Mi rutina</h1>
        <p className="text-neutral-400">Todavía no tenés una rutina asignada. Consultá con tu coach.</p>
      </div>
    )
  }

  const hechos = diaActual.items.filter((i) => check.marcados.includes(i.item_id)).length
  const total = diaActual.items.length
  const completo = total > 0 && hechos === total

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{rutina.rutina}</h1>
        {rutina.objetivo && <p className="text-sm text-neutral-300">🎯 {rutina.objetivo}</p>}
        <p className="text-xs text-neutral-500">Actualizada el {formatearFecha(rutina.fecha_actualizacion)}</p>
      </div>

      {dias.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dias.map((d) => (
            <button key={d.numero} onClick={() => elegirDia(d.numero)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                d.numero === diaActual.numero ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'
              }`}>
              Día {d.numero}{d.nombre && ` · ${d.nombre}`}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-300">{hechos} de {total} hechos</span>
          {hechos > 0 && <button onClick={reiniciar} className="text-neutral-500 hover:text-white">Reiniciar</button>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-valuenow={hechos} aria-valuemax={total}>
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} />
        </div>
      </div>

      {completo && <Aviso tipo="ok" texto="¡Día completado! Buen entrenamiento 💪" />}

      {BLOQUES_EJERCICIO.map((bloque) => {
        const items = diaActual.items.filter((i) => i.bloque === bloque)
        if (!items.length) return null
        return (
          <section key={bloque} className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">{bloque}</h2>
            <ul className="space-y-2">
              {items.map((it) => {
                const hecho = check.marcados.includes(it.item_id)
                return (
                  <li key={it.item_id}>
                    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                      hecho ? 'border-emerald-900 bg-emerald-950/40' : 'border-neutral-800 bg-neutral-900'
                    }`}>
                      <input type="checkbox" checked={hecho} onChange={() => marcar(it.item_id)} className="mt-1 h-5 w-5 shrink-0 accent-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <div className={hecho ? 'text-neutral-400 line-through' : ''}>{it.ejercicio}</div>
                        <div className="text-sm text-neutral-400">
                          {it.series} × {it.repeticiones}
                          {it.descanso_seg != null && ` · descanso ${it.descanso_seg}s`}
                        </div>
                        {it.nota && <div className="text-sm text-amber-300">{it.nota}</div>}
                        {it.video_url && (
                          <a href={it.video_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            className="text-sm text-neutral-400 underline hover:text-white">
                            Ver video
                          </a>
                        )}
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
