import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BLOQUES_EJERCICIO, formatearFecha, mensajeError } from '../../lib/utils'
import { NIVELES, aPayload, clave, desdePayload, diaVacio, validarRutina } from '../../lib/rutinas'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import EditorRutina from '../../components/rutinas/EditorRutina'

// Plantillas de rutina en tres niveles (las mismas que se pegan desde la rutina de cada alumno):
//   · Planificación → varios días (la semana)          ej. "Fuerza básica"
//   · Día           → un día completo con sus secciones  ej. "Tren superior"
//   · Sección       → un bloque                          ej. "Calentamiento piernas", "Estiramiento tren superior"
// Usar una plantilla carga una copia: modificar la rutina del alumno no cambia la plantilla.
const PESTANIAS = [
  { tipo: NIVELES.planificacion, texto: 'Planificaciones', ayuda: 'Varios días. Se pegan desde "☰ Planificación" en la rutina del alumno.' },
  { tipo: NIVELES.dia, texto: 'Días', ayuda: 'Un día completo con todas sus secciones. Se pegan desde "⋯ Día" o se agregan como día nuevo.' },
  { tipo: NIVELES.seccion, texto: 'Secciones', ayuda: 'Calentamientos, fuerza, accesorios o estiramientos. Se pegan desde "⋯ Sección" de cada bloque.' },
]
const MODO = { [NIVELES.planificacion]: 'planificacion', [NIVELES.dia]: 'dia', [NIVELES.seccion]: 'seccion' }

export default function Plantillas() {
  const [plantillas, setPlantillas] = useState([])
  const [ejercicios, setEjercicios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [pestania, setPestania] = useState(NIVELES.planificacion)
  const [edicion, setEdicion] = useState(null) // { id, tipo, bloque, nombre, objetivo, dias } o null
  const [editorKey, setEditorKey] = useState(clave())
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    const [pRes, eRes] = await Promise.all([
      supabase.from('rutinas_plantilla').select('id, tipo, bloque, nombre, objetivo, dias, fecha_actualizacion')
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

  const abrir = (p) => {
    setAviso(null)
    setEdicion({
      id: p.id ?? null, tipo: p.tipo, bloque: p.bloque ?? null, nombre: p.nombre, objetivo: p.objetivo ?? '',
      dias: p.dias?.length ? desdePayload(p.dias) : [diaVacio()],
    })
    setEditorKey(clave())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const nueva = (tipo, bloque = null) => abrir({ tipo, bloque, nombre: '', objetivo: '', dias: [] })
  const duplicar = (p) => abrir({ ...p, id: null, nombre: `${p.nombre} (copia)` })

  // "Guardar como plantilla" desde los menús del editor (ej. guardar el calentamiento de esta plantilla de día)
  const guardarDesdeEditor = async ({ tipo, bloque, nombre, objetivo, dias }) => {
    const { error } = await supabase.from('rutinas_plantilla')
      .insert({ tipo, bloque: bloque ?? null, nombre, objetivo: objetivo?.trim() || null, dias })
    if (error) return error.code === '23505' ? `Ya hay una plantilla de ${tipo.toLowerCase()} con ese nombre.` : mensajeError(error)
    const { data } = await supabase.from('rutinas_plantilla').select('id, tipo, bloque, nombre, objetivo, dias, fecha_actualizacion')
      .eq('activa', true).order('nombre')
    if (data) setPlantillas(data)
    return null
  }

  const guardar = async () => {
    setAviso(null)
    const { tipo, bloque } = edicion
    const problema = validarRutina(edicion)
    if (problema) return setAviso({ tipo: 'error', texto: problema })

    // En una plantilla de día, el nombre del día es el de la plantilla; en una sección, solo esa sección
    let dias = aPayload(edicion.dias)
    if (tipo === NIVELES.dia) dias = [{ ...dias[0], nombre: edicion.nombre.trim() }]
    if (tipo === NIVELES.seccion) dias = [{ nombre: edicion.nombre.trim(), items: dias[0].items.filter((i) => i.bloque === bloque) }]

    const fila = {
      tipo, bloque: tipo === NIVELES.seccion ? bloque : null,
      nombre: edicion.nombre.trim(),
      objetivo: tipo === NIVELES.planificacion ? edicion.objetivo.trim() || null : null,
      dias,
    }
    setGuardando(true)
    const { error } = edicion.id
      ? await supabase.from('rutinas_plantilla').update(fila).eq('id', edicion.id)
      : await supabase.from('rutinas_plantilla').insert(fila)
    setGuardando(false)
    if (error) {
      return setAviso({ tipo: 'error', texto: error.code === '23505' ? `Ya hay una plantilla de ${tipo.toLowerCase()} con ese nombre.` : mensajeError(error) })
    }
    setEdicion(null)
    setPestania(tipo)
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
    const { tipo, bloque } = edicion
    const titulo = tipo === NIVELES.seccion ? `Plantilla de ${bloque}` : `Plantilla de ${tipo.toLowerCase()}`
    return (
      <div className="space-y-4">
        <div>
          <button onClick={() => setEdicion(null)} className="text-sm text-neutral-400 hover:text-white">← Plantillas</button>
          <h1 className="mt-1 text-xl font-semibold">{edicion.id ? 'Editar' : 'Nueva'}: {titulo.toLowerCase()}</h1>
          <p className="text-sm text-neutral-500">{PESTANIAS.find((x) => x.tipo === tipo).ayuda}</p>
        </div>
        {aviso && <Aviso {...aviso} />}
        <EditorRutina key={editorKey} value={edicion} onChange={setEdicion} ejercicios={ejercicios}
          modo={MODO[tipo]} bloque={bloque} etiquetaNombre="Nombre de la plantilla"
          plantillas={plantillas.filter((p) => p.id !== edicion.id)} onGuardarPlantilla={guardarDesdeEditor}
          onAviso={setAviso} origen={edicion.nombre || 'plantilla'} />
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

  const actual = PESTANIAS.find((x) => x.tipo === pestania)
  const delTipo = plantillas.filter((p) => p.tipo === pestania)
  const boton = 'rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Plantillas</h1>

      <div className="flex flex-wrap gap-2" role="tablist">
        {PESTANIAS.map((x) => (
          <button key={x.tipo} role="tab" aria-selected={pestania === x.tipo} onClick={() => setPestania(x.tipo)}
            className={`rounded-lg px-3 py-1.5 text-sm ${pestania === x.tipo ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'}`}>
            {x.texto} <span className="text-neutral-500">{plantillas.filter((p) => p.tipo === x.tipo).length}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-500">{actual.ayuda}</p>

      {aviso && <Aviso {...aviso} />}

      {pestania === NIVELES.seccion ? (
        BLOQUES_EJERCICIO.map((b) => (
          <section key={b} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">{b}</h2>
              <button onClick={() => nueva(NIVELES.seccion, b)} className="text-sm text-neutral-400 hover:text-white">+ Nueva de {b}</button>
            </div>
            <ListaPlantillas items={delTipo.filter((p) => p.bloque === b)} boton={boton}
              onAbrir={abrir} onDuplicar={duplicar} onEliminar={eliminar} />
          </section>
        ))
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={() => nueva(pestania)} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-950">
              + Nueva plantilla de {pestania.toLowerCase()}
            </button>
          </div>
          <ListaPlantillas items={delTipo} boton={boton} onAbrir={abrir} onDuplicar={duplicar} onEliminar={eliminar} />
        </>
      )}
    </div>
  )
}

function ListaPlantillas({ items, boton, onAbrir, onDuplicar, onEliminar }) {
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-neutral-700 p-3 text-sm text-neutral-500">Todavía no hay plantillas.</p>
  }
  return (
    <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
      {items.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{p.nombre}</div>
            {p.objetivo && <p className="text-sm text-neutral-400">{p.objetivo}</p>}
            <p className="text-xs text-neutral-500">{resumen(p)} — actualizada el {formatearFecha(p.fecha_actualizacion)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onAbrir(p)} className={boton}>Editar</button>
            <button onClick={() => onDuplicar(p)} className={boton}>Duplicar</button>
            <button onClick={() => onEliminar(p)} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">Eliminar</button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function resumen(p) {
  const n = (p.dias ?? []).reduce((t, d) => t + (d.items?.length ?? 0), 0)
  if (p.tipo === NIVELES.planificacion) {
    return p.dias.map((d, i) => `Día ${i + 1}${d.nombre ? ` · ${d.nombre}` : ''}`).join('  ·  ')
  }
  return `${n} ejercicio${n === 1 ? '' : 's'}`
}
