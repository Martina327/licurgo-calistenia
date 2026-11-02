import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CATEGORIAS_EJERCICIO, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

const VACIO = { id: null, nombre: '', categoria: 'Tracción', descripcion: '', video_url: '', prerrequisito_id: '' }

// Catálogo de ejercicios (B1). Coach y SuperAdmin dan de alta, editan y desactivan.
// No se borra: un ejercicio puede estar usado en rutinas, por eso la baja es lógica (activo = false).
export default function CatalogoEjercicios() {
  const [ejercicios, setEjercicios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [categoria, setCategoria] = useState('Todas')
  const [busqueda, setBusqueda] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [form, setForm] = useState(null) // null = cerrado
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    const { data, error } = await supabase
      .from('ejercicios')
      .select('id, nombre, categoria, descripcion, video_url, prerrequisito_id, activo')
      .order('nombre')
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setEjercicios(data ?? [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const porId = useMemo(() => Object.fromEntries(ejercicios.map((e) => [e.id, e])), [ejercicios])

  const visibles = ejercicios.filter(
    (e) =>
      (verInactivos || e.activo) &&
      (categoria === 'Todas' || e.categoria === categoria) &&
      e.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  )

  const cambiarActivo = async (e) => {
    setAviso(null)
    const { error } = await supabase.from('ejercicios').update({ activo: !e.activo }).eq('id', e.id)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })
    setAviso({ tipo: 'ok', texto: `${e.nombre} ${e.activo ? 'desactivado' : 'reactivado'}.` })
    cargar()
  }

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Catálogo de ejercicios</h1>
        <button
          onClick={() => { setAviso(null); setForm(VACIO) }}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-950"
        >
          + Nuevo ejercicio
        </button>
      </div>

      {aviso && <Aviso {...aviso} />}

      {form && (
        <FormEjercicio
          inicial={form}
          ejercicios={ejercicios}
          onCancelar={() => setForm(null)}
          onGuardado={(texto) => { setForm(null); setAviso({ tipo: 'ok', texto }); cargar() }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {['Todas', ...CATEGORIAS_EJERCICIO].map((c) => (
          <button
            key={c}
            onClick={() => setCategoria(c)}
            className={`rounded-full px-3 py-1 text-sm ${
              categoria === c ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Ver inactivos
        </label>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-500">No hay ejercicios con ese filtro.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {visibles.map((e) => (
            <li key={e.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${e.activo ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.nombre}</span>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{e.categoria}</span>
                  {!e.activo && <span className="text-xs text-neutral-500">Inactivo</span>}
                </div>
                {e.descripcion && <p className="mt-0.5 text-sm text-neutral-400">{e.descripcion}</p>}
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-neutral-500">
                  {e.prerrequisito_id && <span>Viene de: {porId[e.prerrequisito_id]?.nombre ?? '—'}</span>}
                  {e.video_url && (
                    <a href={e.video_url} target="_blank" rel="noreferrer" className="underline hover:text-neutral-300">
                      Ver video
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setAviso(null); setForm({ ...e, descripcion: e.descripcion ?? '', video_url: e.video_url ?? '', prerrequisito_id: e.prerrequisito_id ?? '' }) }}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Editar
                </button>
                <button
                  onClick={() => cambiarActivo(e)}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  {e.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Ejercicios que dependen (directa o indirectamente) de `id`: no se pueden elegir como su prerrequisito.
// La base también lo controla (trg_ejercicios_progresion); esto solo evita ofrecer opciones inválidas.
function descendientes(id, ejercicios) {
  const resultado = new Set()
  let frontera = [id]
  while (frontera.length) {
    const hijos = ejercicios.filter((e) => frontera.includes(e.prerrequisito_id) && !resultado.has(e.id))
    hijos.forEach((h) => resultado.add(h.id))
    frontera = hijos.map((h) => h.id)
  }
  return resultado
}

function FormEjercicio({ inicial, ejercicios, onCancelar, onGuardado }) {
  const [datos, setDatos] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const esNuevo = !inicial.id

  const opcionesPrerrequisito = useMemo(() => {
    const excluidos = esNuevo ? new Set() : descendientes(inicial.id, ejercicios)
    return ejercicios.filter((e) => e.activo && e.id !== inicial.id && !excluidos.has(e.id))
  }, [ejercicios, inicial.id, esNuevo])

  const campo = (k) => (ev) => setDatos({ ...datos, [k]: ev.target.value })

  const guardar = async (ev) => {
    ev.preventDefault()
    setError('')
    const nombre = datos.nombre.trim()
    if (!nombre) return setError('El nombre es obligatorio.')
    const video = datos.video_url.trim()
    if (video && !/^https?:\/\//i.test(video)) return setError('El link del video tiene que empezar con http:// o https://')

    const fila = {
      nombre,
      categoria: datos.categoria,
      descripcion: datos.descripcion.trim() || null,
      video_url: video || null,
      prerrequisito_id: datos.prerrequisito_id || null,
    }
    setGuardando(true)
    const { error } = esNuevo
      ? await supabase.from('ejercicios').insert(fila)
      : await supabase.from('ejercicios').update(fila).eq('id', inicial.id)
    setGuardando(false)

    if (error) {
      return setError(error.code === '23505' ? 'Ya existe un ejercicio con ese nombre.' : mensajeError(error))
    }
    onGuardado(esNuevo ? `Ejercicio "${nombre}" creado.` : `Ejercicio "${nombre}" actualizado.`)
  }

  const input = 'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-400'

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      <h2 className="font-medium">{esNuevo ? 'Nuevo ejercicio' : `Editar: ${inicial.nombre}`}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-300">Nombre</span>
          <input value={datos.nombre} onChange={campo('nombre')} className={input} autoFocus />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-300">Categoría</span>
          <select value={datos.categoria} onChange={campo('categoria')} className={input}>
            {CATEGORIAS_EJERCICIO.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-neutral-300">Descripción / indicaciones técnicas</span>
        <textarea value={datos.descripcion} onChange={campo('descripcion')} rows={2} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-300">Link de video (opcional)</span>
          <input value={datos.video_url} onChange={campo('video_url')} placeholder="https://…" className={input} />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-300">Progresión anterior (opcional)</span>
          <select value={datos.prerrequisito_id} onChange={campo('prerrequisito_id')} className={input}>
            <option value="">— Ninguna —</option>
            {CATEGORIAS_EJERCICIO.map((c) => {
              const grupo = opcionesPrerrequisito.filter((e) => e.categoria === c)
              return grupo.length ? (
                <optgroup key={c} label={c}>
                  {grupo.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </optgroup>
              ) : null
            })}
          </select>
        </label>
      </div>
      {error && <Aviso tipo="error" texto={error} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-white">
          Cancelar
        </button>
        <button disabled={guardando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
