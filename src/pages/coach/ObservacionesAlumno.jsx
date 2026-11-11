import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

export const TIPOS_OBSERVACION = ['Lesión', 'Movilidad', 'Progresión técnica', 'General'] // enum tipo_observacion

const COLOR_TIPO = {
  Lesión: 'bg-red-950 text-red-300',
  Movilidad: 'bg-sky-950 text-sky-300',
  'Progresión técnica': 'bg-violet-950 text-violet-300',
  General: 'bg-neutral-800 text-neutral-300',
}

export function EtiquetaTipo({ tipo }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${COLOR_TIPO[tipo] ?? COLOR_TIPO.General}`}>{tipo}</span>
}

// CU10 – Observaciones del alumno (lesiones, movilidad, progresiones).
// Privadas: solo Coach y SuperAdmin (RLS "observaciones_coach"). El alumno no las ve.
export default function ObservacionesAlumno() {
  const { alumnoId } = useParams()
  const [alumno, setAlumno] = useState(null)
  const [observaciones, setObservaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [verResueltas, setVerResueltas] = useState(false)
  const [form, setForm] = useState(null) // null = cerrado
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    const [alumnoRes, obsRes] = await Promise.all([
      supabase.from('v_membresias').select('alumno_id, nombre, apellido').eq('alumno_id', alumnoId).maybeSingle(),
      supabase
        .from('observaciones_alumno')
        .select('id, tipo, titulo, descripcion, vigente, fecha, coach:usuarios!observaciones_alumno_coach_id_fkey(nombre, apellido)')
        .eq('alumno_id', alumnoId)
        .order('vigente', { ascending: false })
        .order('fecha', { ascending: false }),
    ])
    const error = alumnoRes.error ?? obsRes.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setAlumno(alumnoRes.data)
    setObservaciones(obsRes.data ?? [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [alumnoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarVigente = async (o) => {
    setAviso(null)
    const { error } = await supabase.from('observaciones_alumno').update({ vigente: !o.vigente }).eq('id', o.id)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })
    setAviso({ tipo: 'ok', texto: o.vigente ? `"${o.titulo}" marcada como resuelta.` : `"${o.titulo}" vuelve a estar vigente.` })
    cargar()
  }

  if (cargando) return <Cargando />
  if (!alumno) return <p className="text-neutral-400">No encontramos a ese alumno. <Link to="/coach" className="underline">Volver</Link></p>

  const vigentes = observaciones.filter((o) => o.vigente)
  const resueltas = observaciones.filter((o) => !o.vigente)

  return (
    <div className="space-y-4">
      <div>
        <Link to="/coach" className="text-sm text-neutral-400 hover:text-white">← Alumnos</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Observaciones de {alumno.nombre} {alumno.apellido}</h1>
          <div className="flex gap-2">
            <Link to={`/coach/alumnos/${alumnoId}/rutina`}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
              Ver rutina
            </Link>
            <button onClick={() => { setAviso(null); setForm({ id: null, tipo: 'Lesión', titulo: '', descripcion: '' }) }}
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-950">
              + Nueva observación
            </button>
          </div>
        </div>
        <p className="text-sm text-neutral-500">Solo las ven los coaches y el administrador. El alumno no tiene acceso.</p>
      </div>

      {aviso && <Aviso {...aviso} />}

      {form && (
        <FormObservacion
          inicial={form}
          alumnoId={alumnoId}
          onCancelar={() => setForm(null)}
          onGuardado={(texto) => { setForm(null); setAviso({ tipo: 'ok', texto }); cargar() }}
        />
      )}

      {vigentes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          No tiene observaciones vigentes.
        </p>
      ) : (
        <ListaObservaciones items={vigentes} onEditar={(o) => { setAviso(null); setForm(o) }} onCambiarVigente={cambiarVigente} />
      )}

      {resueltas.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setVerResueltas((v) => !v)} className="text-sm text-neutral-400 hover:text-white">
            {verResueltas ? '▾' : '▸'} Resueltas ({resueltas.length})
          </button>
          {verResueltas && (
            <ListaObservaciones items={resueltas} onEditar={(o) => { setAviso(null); setForm(o) }} onCambiarVigente={cambiarVigente} />
          )}
        </div>
      )}
    </div>
  )
}

function ListaObservaciones({ items, onEditar, onCambiarVigente }) {
  return (
    <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
      {items.map((o) => (
        <li key={o.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${o.vigente ? '' : 'opacity-60'}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <EtiquetaTipo tipo={o.tipo} />
              <span className="font-medium">{o.titulo}</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-300">{o.descripcion}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {formatearFecha(o.fecha)}{o.coach && ` · ${o.coach.nombre} ${o.coach.apellido}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onEditar(o)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800">
              Editar
            </button>
            <button onClick={() => onCambiarVigente(o)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800">
              {o.vigente ? 'Marcar resuelta' : 'Reactivar'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function FormObservacion({ inicial, alumnoId, onCancelar, onGuardado }) {
  const [datos, setDatos] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const esNueva = !inicial.id
  const campo = (k) => (ev) => setDatos({ ...datos, [k]: ev.target.value })

  const guardar = async (ev) => {
    ev.preventDefault()
    setError('')
    const titulo = datos.titulo.trim()
    const descripcion = datos.descripcion.trim()
    if (!titulo || !descripcion) return setError('Completá el título y la descripción.')
    setGuardando(true)
    const fila = { tipo: datos.tipo, titulo, descripcion }
    const { error } = esNueva
      ? await supabase.from('observaciones_alumno').insert({ ...fila, alumno_id: alumnoId })
      : await supabase.from('observaciones_alumno').update(fila).eq('id', inicial.id)
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    onGuardado(esNueva ? 'Observación guardada.' : 'Observación actualizada.')
  }

  const input = 'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-400'

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      <h2 className="font-medium">{esNueva ? 'Nueva observación' : 'Editar observación'}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-neutral-300">Tipo</span>
          <select value={datos.tipo} onChange={campo('tipo')} className={input}>
            {TIPOS_OBSERVACION.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-neutral-300">Título</span>
          <input value={datos.titulo} onChange={campo('titulo')} placeholder="Ej: Dolor en hombro derecho" className={input} autoFocus />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-neutral-300">Descripción</span>
        <textarea value={datos.descripcion} onChange={campo('descripcion')} rows={3}
          placeholder="Qué le pasa, qué evitar, qué hacer en su lugar…" className={input} />
      </label>
      {error && <Aviso tipo="error" texto={error} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-white">Cancelar</button>
        <button disabled={guardando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
