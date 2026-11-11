import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, mensajeError } from '../../lib/utils'
import { aPayload, clave, desdePayload, diaVacio, payloadDesdeBase, validarRutina } from '../../lib/rutinas'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import EditorRutina from '../../components/rutinas/EditorRutina'
import { EtiquetaTipo } from './ObservacionesAlumno'

// Rutina activa de Supabase → estado del editor
const aEstado = (r) => ({
  id: r.id,
  nombre: r.nombre,
  objetivo: r.objetivo ?? '',
  fecha_actualizacion: r.fecha_actualizacion,
  dias: desdePayload(payloadDesdeBase(r.rutina_dias)),
})

// CU09 – Diseñar la rutina del alumno por días y bloques (Entrada en calor / Fuerza / Accesorios).
// Se guarda todo junto con la RPC guardar_rutina (una sola transacción).
// Para no escribir lo mismo a cada alumno, el editor tiene menús para pegar plantillas,
// copiar/pegar y guardar como plantilla en tres niveles: sección, día y planificación.
// Lo que se carga es una base: se modifica antes de guardar.
export default function RutinaAlumno() {
  const { alumnoId } = useParams()
  const [alumno, setAlumno] = useState(null)
  const [observaciones, setObservaciones] = useState([])
  const [ejercicios, setEjercicios] = useState([])
  const [rutina, setRutina] = useState(null) // estado del editor; null = sin rutina activa
  const [editorKey, setEditorKey] = useState(clave())
  const [cambios, setCambios] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [plantillas, setPlantillas] = useState([])

  const cargar = async () => {
    const [alumnoRes, ejerciciosRes, rutinaRes, obsRes, plantillasRes] = await Promise.all([
      supabase.from('v_membresias').select('alumno_id, nombre, apellido, plan').eq('alumno_id', alumnoId).maybeSingle(),
      supabase.from('ejercicios').select('id, nombre, categoria, activo').order('nombre'),
      supabase
        .from('rutinas')
        .select('id, nombre, objetivo, fecha_actualizacion, rutina_dias(numero_dia, nombre, rutina_items(ejercicio_id, bloque, orden, series, repeticiones, descanso_seg, nota, grupo))')
        .eq('alumno_id', alumnoId)
        .eq('activa', true)
        .maybeSingle(),
      supabase.from('observaciones_alumno').select('id, tipo, titulo, descripcion')
        .eq('alumno_id', alumnoId).eq('vigente', true).order('fecha', { ascending: false }),
      supabase.from('rutinas_plantilla').select('id, tipo, bloque, nombre, objetivo, dias').eq('activa', true).order('nombre'),
    ])
    const error = alumnoRes.error ?? ejerciciosRes.error ?? rutinaRes.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setAlumno(alumnoRes.data)
    setObservaciones(obsRes.data ?? [])
    setPlantillas(plantillasRes.data ?? [])
    setEjercicios(ejerciciosRes.data ?? [])
    setRutina(rutinaRes.data ? aEstado(rutinaRes.data) : null)
    setEditorKey(clave())
    setCambios(false)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [alumnoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const esteAlumno = alumno ? `${alumno.nombre} ${alumno.apellido}` : ''

  const cambiar = (nueva) => { setRutina(nueva); setCambios(true) }
  const empezarRutina = () => {
    setRutina({ id: null, nombre: '', objetivo: '', dias: [diaVacio()] })
    setEditorKey(clave())
    setCambios(true)
    setAviso({ tipo: 'ok', texto: 'Rutina nueva. Usá "☰ Planificación" para pegar una planificación entera, o los menús de cada día y sección.' })
  }

  const cargarPlantillas = async () => {
    const { data } = await supabase.from('rutinas_plantilla').select('id, tipo, bloque, nombre, objetivo, dias').eq('activa', true).order('nombre')
    if (data) setPlantillas(data)
  }
  // Lo llama el editor desde "Guardar como plantilla" de cualquier nivel
  const guardarPlantilla = async ({ tipo, bloque, nombre, objetivo, dias }) => {
    const { error } = await supabase.from('rutinas_plantilla')
      .insert({ tipo, bloque: bloque ?? null, nombre, objetivo: objetivo?.trim() || null, dias })
    if (error) return error.code === '23505' ? `Ya hay una plantilla de ${tipo.toLowerCase()} con ese nombre.` : mensajeError(error)
    await cargarPlantillas()
    return null
  }

  const guardar = async (comoNueva) => {
    setAviso(null)
    const problema = validarRutina(rutina)
    if (problema) return setAviso({ tipo: 'error', texto: problema })
    if (comoNueva && rutina.id && !window.confirm('La rutina actual quedará archivada y el alumno verá la nueva. ¿Continuar?')) return

    setGuardando(true)
    const { error } = await supabase.rpc('guardar_rutina', {
      p_alumno_id: alumnoId,
      p_nombre: rutina.nombre,
      p_objetivo: rutina.objetivo,
      p_rutina_id: comoNueva ? null : rutina.id,
      p_dias: aPayload(rutina.dias),
    })
    setGuardando(false)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })
    await cargar()
    setAviso({ tipo: 'ok', texto: comoNueva ? 'Rutina nueva guardada. La anterior quedó archivada.' : 'Cambios guardados.' })
  }

  const archivar = async () => {
    if (!window.confirm('El alumno dejará de ver esta rutina. ¿Archivarla?')) return
    const { error } = await supabase.from('rutinas').update({ activa: false }).eq('id', rutina.id)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })
    await cargar()
    setAviso({ tipo: 'ok', texto: 'Rutina archivada.' })
  }

  if (cargando) return <Cargando />
  if (!alumno) return <p className="text-neutral-400">No encontramos a ese alumno. <Link to="/coach" className="underline">Volver</Link></p>

  return (
    <div className="space-y-4">
      <div>
        <Link to="/coach" className="text-sm text-neutral-400 hover:text-white">← Alumnos</Link>
        <h1 className="mt-1 text-xl font-semibold">Rutina de {alumno.nombre} {alumno.apellido}</h1>
        <p className="text-sm text-neutral-500">
          {alumno.plan ?? 'Sin plan'}
          {rutina?.fecha_actualizacion && ` · Actualizada el ${formatearFecha(rutina.fecha_actualizacion)}`}
        </p>
      </div>

      <ResumenObservaciones alumnoId={alumnoId} observaciones={observaciones} />

      {aviso && <Aviso {...aviso} />}

      {!rutina ? (
        <div className="space-y-3 rounded-xl border border-dashed border-neutral-700 p-6 text-center">
          <p className="text-neutral-400">Este alumno no tiene una rutina activa.</p>
          <button onClick={empezarRutina} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            Armar rutina
          </button>
          <p className="text-xs text-neutral-500">Después podés pegar una planificación, un día o cada sección desde plantillas o desde otro alumno.</p>
        </div>
      ) : (
        <>
          <EditorRutina key={editorKey} value={rutina} onChange={cambiar} ejercicios={ejercicios}
            plantillas={plantillas} onGuardarPlantilla={guardarPlantilla} onAviso={setAviso} origen={esteAlumno} />

          <div className="flex flex-wrap items-center justify-end gap-2">
            {cambios && <span className="mr-auto text-sm text-amber-300">Cambios sin guardar</span>}
            {rutina.id && (
              <button onClick={archivar} disabled={guardando} className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-white">
                Archivar rutina
              </button>
            )}
            {cambios && (
              <button onClick={cargar} disabled={guardando} className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-white">
                Descartar
              </button>
            )}
            {rutina.id && (
              <button onClick={() => guardar(true)} disabled={guardando}
                className="rounded-lg border border-neutral-600 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50">
                Guardar como nueva
              </button>
            )}
            <button onClick={() => guardar(false)} disabled={guardando || !cambios}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
              {guardando ? 'Guardando…' : rutina.id ? 'Guardar cambios' : 'Guardar rutina'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Lesiones y demás observaciones vigentes, a la vista mientras el coach arma la rutina
function ResumenObservaciones({ alumnoId, observaciones }) {
  return (
    <section className={`rounded-xl border p-3 ${observaciones.length ? 'border-amber-900 bg-amber-950/30' : 'border-neutral-800'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {observaciones.length ? `⚠ Observaciones vigentes (${observaciones.length})` : 'Sin observaciones vigentes'}
        </h2>
        <Link to={`/coach/alumnos/${alumnoId}/observaciones`} className="text-sm text-neutral-400 underline hover:text-white">
          {observaciones.length ? 'Ver y editar' : 'Cargar observación'}
        </Link>
      </div>
      {observaciones.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {observaciones.map((o) => (
            <li key={o.id} className="text-sm">
              <EtiquetaTipo tipo={o.tipo} /> <span className="font-medium">{o.titulo}</span>
              <span className="text-neutral-400"> — {o.descripcion}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
