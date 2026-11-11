import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, mensajeError } from '../../lib/utils'
import {
  BLOQUE_CALENTAMIENTO, aPayload, clave, desdePayload, itemsCalentamiento, validarRutina,
} from '../../lib/rutinas'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import EditorRutina from '../../components/rutinas/EditorRutina'

// Rutinas preestablecidas (ej. "Fuerza básica") y el calentamiento estándar.
// El coach las usa como base desde la rutina de cada alumno ("Usar plantilla");
// modificar la rutina del alumno no cambia la plantilla.
export default function Plantillas() {
  const [plantillas, setPlantillas] = useState([])
  const [ejercicios, setEjercicios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [edicion, setEdicion] = useState(null) // { id, tipo, nombre, objetivo, dias } o null
  const [editorKey, setEditorKey] = useState(clave())
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    const [pRes, eRes] = await Promise.all([
      supabase.from('rutinas_plantilla').select('id, tipo, nombre, objetivo, dias, fecha_actualizacion')
        .eq('activa', true).order('nombre'),
      supabase.from('ejercicios').select('id, nombre, categoria, activo').order('nombre'),
    ])
    const error = pRes.error ?? eRes.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setPlantillas(pRes.data ?? [])
    setEjercicios(eRes.data ?? [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const calentamiento = plantillas.find((p) => p.tipo === 'Calentamiento')
  const rutinas = plantillas.filter((p) => p.tipo === 'Rutina')

  const abrir = (p) => {
    setAviso(null)
    setEdicion({ id: p.id ?? null, tipo: p.tipo, nombre: p.nombre, objetivo: p.objetivo ?? '', dias: desdePayload(p.dias) })
    setEditorKey(clave())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const nueva = () => abrir({ tipo: 'Rutina', nombre: '', objetivo: '', dias: [{ items: itemsCalentamiento(calentamiento) }] })
  const nuevoCalentamiento = () => abrir({ tipo: 'Calentamiento', nombre: 'Calentamiento estándar', dias: [{ nombre: 'Calentamiento', items: [] }] })
  const duplicar = (p) => abrir({ ...p, id: null, nombre: `${p.nombre} (copia)` })

  const guardar = async () => {
    setAviso(null)
    const esCal = edicion.tipo === 'Calentamiento'
    const problema = esCal
      ? (!edicion.nombre.trim() ? 'Poné un nombre.' : validarRutina({ nombre: edicion.nombre, dias: edicion.dias }))
      : validarRutina(edicion)
    if (problema) return setAviso({ tipo: 'error', texto: problema })

    const fila = {
      tipo: edicion.tipo,
      nombre: edicion.nombre.trim(),
      objetivo: esCal ? null : edicion.objetivo.trim() || null,
      dias: aPayload(edicion.dias),
    }
    setGuardando(true)
    const { error } = edicion.id
      ? await supabase.from('rutinas_plantilla').update(fila).eq('id', edicion.id)
      : await supabase.from('rutinas_plantilla').insert(fila)
    setGuardando(false)
    if (error) {
      const texto = error.code === '23505'
        ? (esCal ? 'Ya hay un calentamiento estándar.' : 'Ya existe una plantilla con ese nombre.')
        : mensajeError(error)
      return setAviso({ tipo: 'error', texto })
    }
    setEdicion(null)
    await cargar()
    setAviso({ tipo: 'ok', texto: `Plantilla "${fila.nombre}" guardada.` })
  }

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar la plantilla "${p.nombre}"? Las rutinas que ya armaste con ella no cambian.`)) return
    const { error } = await supabase.from('rutinas_plantilla').update({ activa: false }).eq('id', p.id)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })
    await cargar()
    setAviso({ tipo: 'ok', texto: `Plantilla "${p.nombre}" eliminada.` })
  }

  if (cargando) return <Cargando />

  if (edicion) {
    const esCal = edicion.tipo === 'Calentamiento'
    return (
      <div className="space-y-4">
        <div>
          <button onClick={() => setEdicion(null)} className="text-sm text-neutral-400 hover:text-white">← Plantillas</button>
          <h1 className="mt-1 text-xl font-semibold">
            {esCal ? 'Calentamiento estándar' : edicion.id ? `Editar plantilla` : 'Nueva plantilla'}
          </h1>
          <p className="text-sm text-neutral-500">
            {esCal
              ? 'Se carga solo en la Entrada en calor de cada día nuevo. En cada rutina se puede modificar.'
              : `Si un día no tiene ${BLOQUE_CALENTAMIENTO}, al usar la plantilla se le carga el calentamiento estándar.`}
          </p>
        </div>
        {aviso && <Aviso {...aviso} />}
        <EditorRutina key={editorKey} value={edicion} onChange={setEdicion} ejercicios={ejercicios}
          calentamiento={esCal ? [] : itemsCalentamiento(calentamiento)} soloCalentamiento={esCal} />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEdicion(null)} disabled={guardando} className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-white">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      </div>
    )
  }

  const boton = 'rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Plantillas de rutina</h1>
        <button onClick={nueva} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-950">+ Nueva plantilla</button>
      </div>
      <p className="text-sm text-neutral-500">
        Rutinas base para no escribir lo mismo a cada alumno. Desde la rutina de un alumno: <b>Usar plantilla</b>.
        También podés guardar la rutina de un alumno como plantilla.
      </p>

      {aviso && <Aviso {...aviso} />}

      <section className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">🔥 Calentamiento estándar</h2>
            <p className="text-sm text-neutral-400">
              {calentamiento
                ? calentamiento.dias[0]?.items?.length
                  ? `${calentamiento.dias[0].items.length} ejercicios · se carga en la Entrada en calor de cada día nuevo`
                  : 'Sin ejercicios todavía'
                : 'No hay calentamiento estándar cargado.'}
            </p>
          </div>
          {calentamiento
            ? <button onClick={() => abrir(calentamiento)} className={boton}>Editar</button>
            : <button onClick={nuevoCalentamiento} className={boton}>Crear</button>}
        </div>
      </section>

      {rutinas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">Todavía no hay plantillas.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {rutinas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.nombre}</div>
                {p.objetivo && <p className="text-sm text-neutral-400">{p.objetivo}</p>}
                <p className="text-xs text-neutral-500">
                  {p.dias.map((d, i) => `Día ${i + 1}${d.nombre ? ` · ${d.nombre}` : ''}`).join('  ·  ')}
                  {' — '}actualizada el {formatearFecha(p.fecha_actualizacion)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => abrir(p)} className={boton}>Editar</button>
                <button onClick={() => duplicar(p)} className={boton}>Duplicar</button>
                <button onClick={() => eliminar(p)} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
