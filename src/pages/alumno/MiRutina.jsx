import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BLOQUES_EJERCICIO, formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import { TEXTO_VAMOS, agruparPorDia, textoDescanso } from '../../lib/rutinas'
import { alternarMarca, guardarChecklist, leerChecklist } from '../../lib/checklist'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// CU11 – El alumno consulta su rutina activa y marca lo que va haciendo en el día.
// En cada ejercicio ve solo: nombre, series × repeticiones, descanso y el tilde.
// Tocando ⓘ ve la descripción del ejercicio y la observación que le dejó el coach.
// Las observaciones privadas del coach (lesiones, etc.) NO se muestran: son otra tabla.
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
              {items.map((it) => (
                <li key={it.item_id}>
                  <TarjetaEjercicio item={it} hecho={check.marcados.includes(it.item_id)} onMarcar={() => marcar(it.item_id)} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function TarjetaEjercicio({ item: it, hecho, onMarcar, descanso = it.descanso_seg, sinDescanso = false }) {
  const [verInfo, setVerInfo] = useState(false)
  const tieneInfo = Boolean(it.descripcion || it.nota)
  const descansoTxt = textoDescanso(descanso)

  return (
    <div className={`relative rounded-xl border ${hecho ? 'border-emerald-900 bg-emerald-950/40' : 'border-neutral-800 bg-neutral-900'}`}>
      <label className="flex cursor-pointer gap-3 p-3 pr-12">
        <input type="checkbox" checked={hecho} onChange={onMarcar} className="mt-1 h-5 w-5 shrink-0 accent-emerald-400" />
        <div className="min-w-0 flex-1">
          <div className={`font-medium ${hecho ? 'text-neutral-400 line-through' : ''}`}>{it.ejercicio}</div>
          <div className="text-sm text-neutral-300">{it.series} × {it.repeticiones}</div>
          {!sinDescanso && (
            <div className="text-sm text-neutral-400">
              {descansoTxt ? `Descanso ${descansoTxt}` : <span className="font-semibold text-amber-300">{TEXTO_VAMOS} 🔔</span>}
            </div>
          )}
        </div>
      </label>

      {tieneInfo && (
        <button type="button" onClick={() => setVerInfo((v) => !v)} aria-expanded={verInfo}
          aria-label={`Información de ${it.ejercicio}`} title="Información"
          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold italic ${
            verInfo ? 'border-white bg-white text-neutral-950' : 'border-neutral-600 text-neutral-300 hover:border-neutral-400'
          }`}>
          i
        </button>
      )}

      {verInfo && (
        <div className="space-y-2 border-t border-neutral-800 px-3 py-3 text-sm">
          {it.descripcion && (
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Descripción</div>
              <p className="whitespace-pre-line text-neutral-200">{it.descripcion}</p>
            </div>
          )}
          {it.nota && (
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Observación del coach</div>
              <p className="whitespace-pre-line text-amber-300">{it.nota}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
