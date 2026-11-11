import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { BLOQUES_EJERCICIO, CATEGORIAS_EJERCICIO, formatearFecha, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { EtiquetaTipo } from './ObservacionesAlumno'

const MAX_DIAS = 7
let siguienteClave = 1
const clave = () => `k${siguienteClave++}`

const itemVacio = (bloque) => ({ key: clave(), ejercicio_id: '', bloque, series: 3, repeticiones: '', descanso_seg: '', nota: '' })
const diaVacio = () => ({ key: clave(), nombre: '', items: [] })

// Fila de la base → estado del editor (días ordenados, ítems ordenados por `orden`)
function aEstado(rutina) {
  const dias = [...(rutina.rutina_dias ?? [])].sort((a, b) => a.numero_dia - b.numero_dia)
  return {
    id: rutina.id,
    nombre: rutina.nombre,
    objetivo: rutina.objetivo ?? '',
    fecha_actualizacion: rutina.fecha_actualizacion,
    dias: dias.map((d) => ({
      key: clave(),
      nombre: d.nombre ?? '',
      items: [...(d.rutina_items ?? [])]
        .sort((a, b) => a.orden - b.orden)
        .map((i) => ({
          key: clave(),
          ejercicio_id: i.ejercicio_id,
          bloque: i.bloque,
          series: i.series,
          repeticiones: i.repeticiones,
          descanso_seg: i.descanso_seg ?? '',
          nota: i.nota ?? '',
        })),
    })),
  }
}

// CU09 – Diseñar la rutina del alumno por días y bloques (Entrada en calor / Fuerza / Accesorios).
// Se guarda todo junto con la RPC guardar_rutina (una sola transacción).
export default function RutinaAlumno() {
  const { alumnoId } = useParams()
  const [alumno, setAlumno] = useState(null)
  const [observaciones, setObservaciones] = useState([])
  const [ejercicios, setEjercicios] = useState([])
  const [rutina, setRutina] = useState(null) // estado del editor; null = sin rutina activa
  const [diaSel, setDiaSel] = useState(0)
  const [cambios, setCambios] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    const [alumnoRes, ejerciciosRes, rutinaRes, obsRes] = await Promise.all([
      supabase.from('v_membresias').select('alumno_id, nombre, apellido, plan').eq('alumno_id', alumnoId).maybeSingle(),
      supabase.from('ejercicios').select('id, nombre, categoria, activo').order('nombre'),
      supabase
        .from('rutinas')
        .select('id, nombre, objetivo, fecha_actualizacion, rutina_dias(numero_dia, nombre, rutina_items(ejercicio_id, bloque, orden, series, repeticiones, descanso_seg, nota))')
        .eq('alumno_id', alumnoId)
        .eq('activa', true)
        .maybeSingle(),
      supabase.from('observaciones_alumno').select('id, tipo, titulo, descripcion')
        .eq('alumno_id', alumnoId).eq('vigente', true).order('fecha', { ascending: false }),
    ])
    const error = alumnoRes.error ?? ejerciciosRes.error ?? rutinaRes.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setAlumno(alumnoRes.data)
    setObservaciones(obsRes.data ?? [])
    setEjercicios(ejerciciosRes.data ?? [])
    setRutina(rutinaRes.data ? aEstado(rutinaRes.data) : null)
    setDiaSel(0)
    setCambios(false)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [alumnoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- edición del estado -------------------------------------------------
  const editar = (cambio) => { setRutina((r) => cambio(structuredClone(r))); setCambios(true) }
  const dia = rutina?.dias[diaSel]

  const empezarRutina = () => {
    setRutina({ id: null, nombre: '', objetivo: '', dias: [diaVacio()] })
    setDiaSel(0)
    setCambios(true)
  }
  const agregarDia = () => {
    editar((r) => { r.dias.push(diaVacio()); return r })
    setDiaSel(rutina.dias.length)
  }
  const quitarDia = () => {
    if (!window.confirm(`¿Quitar el Día ${diaSel + 1} y sus ejercicios?`)) return
    editar((r) => { r.dias.splice(diaSel, 1); return r })
    setDiaSel((i) => Math.max(0, i - 1))
  }
  const cambiarItem = (key, campo, valor) =>
    editar((r) => { const it = r.dias[diaSel].items.find((i) => i.key === key); it[campo] = valor; return r })
  const agregarItem = (bloque) => editar((r) => { r.dias[diaSel].items.push(itemVacio(bloque)); return r })
  const quitarItem = (key) => editar((r) => { r.dias[diaSel].items = r.dias[diaSel].items.filter((i) => i.key !== key); return r })
  // Sube o baja un ítem dentro de su mismo bloque
  const moverItem = (key, delta) =>
    editar((r) => {
      const items = r.dias[diaSel].items
      const desde = items.findIndex((i) => i.key === key)
      const delBloque = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.bloque === items[desde].bloque)
      const pos = delBloque.findIndex(({ idx }) => idx === desde)
      const destino = delBloque[pos + delta]
      if (destino) [items[desde], items[destino.idx]] = [items[destino.idx], items[desde]]
      return r
    })

  // --- validación y guardado --------------------------------------------
  const validar = () => {
    if (!rutina.nombre.trim()) return 'Poné un nombre a la rutina.'
    for (const [n, d] of rutina.dias.entries()) {
      if (d.items.length === 0) return `El Día ${n + 1} no tiene ejercicios.`
      for (const it of d.items) {
        if (!it.ejercicio_id) return `Día ${n + 1}: hay un ejercicio sin elegir.`
        if (!(Number(it.series) >= 1)) return `Día ${n + 1}: las series tienen que ser 1 o más.`
        if (!String(it.repeticiones).trim()) return `Día ${n + 1}: faltan repeticiones (ej: 8, 30s, máx).`
      }
    }
    return null
  }

  const guardar = async (comoNueva) => {
    setAviso(null)
    const problema = validar()
    if (problema) return setAviso({ tipo: 'error', texto: problema })
    if (comoNueva && rutina.id && !window.confirm('La rutina actual quedará archivada y el alumno verá la nueva. ¿Continuar?')) return

    setGuardando(true)
    const { error } = await supabase.rpc('guardar_rutina', {
      p_alumno_id: alumnoId,
      p_nombre: rutina.nombre,
      p_objetivo: rutina.objetivo,
      p_rutina_id: comoNueva ? null : rutina.id,
      p_dias: rutina.dias.map((d) => ({
        nombre: d.nombre,
        items: d.items.map((i) => ({
          ejercicio_id: i.ejercicio_id,
          bloque: i.bloque,
          series: Number(i.series),
          repeticiones: String(i.repeticiones).trim(),
          descanso_seg: i.descanso_seg === '' ? null : Number(i.descanso_seg),
          nota: i.nota,
        })),
      })),
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

  const input = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400'

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
        <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center">
          <p className="text-neutral-400">Este alumno no tiene una rutina activa.</p>
          <button onClick={empezarRutina} className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            Armar rutina
          </button>
        </div>
      ) : (
        <>
          <section className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-neutral-300">Nombre de la rutina</span>
              <input value={rutina.nombre} onChange={(e) => editar((r) => { r.nombre = e.target.value; return r })}
                placeholder="Ej: Fuerza básica – tren superior" className={`mt-1 ${input}`} />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-300">Objetivo (lo ve el alumno)</span>
              <input value={rutina.objetivo} onChange={(e) => editar((r) => { r.objetivo = e.target.value; return r })}
                placeholder="Ej: primera dominada estricta en 8 semanas" className={`mt-1 ${input}`} />
            </label>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            {rutina.dias.map((d, i) => (
              <button key={d.key} onClick={() => setDiaSel(i)}
                className={`rounded-lg px-3 py-1.5 text-sm ${i === diaSel ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'}`}>
                Día {i + 1}{d.nombre && ` · ${d.nombre}`}
              </button>
            ))}
            {rutina.dias.length < MAX_DIAS && (
              <button onClick={agregarDia} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-white">+ Día</button>
            )}
          </div>

          {dia && (
            <section className="space-y-4 rounded-xl border border-neutral-800 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block min-w-48 flex-1 text-sm">
                  <span className="text-neutral-300">Nombre del Día {diaSel + 1}</span>
                  <input value={dia.nombre} onChange={(e) => editar((r) => { r.dias[diaSel].nombre = e.target.value; return r })}
                    placeholder="Ej: Tracción + Core" className={`mt-1 ${input}`} />
                </label>
                {rutina.dias.length > 1 && (
                  <button onClick={quitarDia} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">Quitar día</button>
                )}
              </div>

              {BLOQUES_EJERCICIO.map((bloque) => (
                <BloqueEditor
                  key={bloque}
                  bloque={bloque}
                  items={dia.items.filter((i) => i.bloque === bloque)}
                  ejercicios={ejercicios}
                  input={input}
                  onCambiar={cambiarItem}
                  onMover={moverItem}
                  onQuitar={quitarItem}
                  onAgregar={() => agregarItem(bloque)}
                />
              ))}
            </section>
          )}

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

function BloqueEditor({ bloque, items, ejercicios, input, onCambiar, onMover, onQuitar, onAgregar }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">{bloque}</h3>
      {items.length === 0 && <p className="text-sm text-neutral-600">Sin ejercicios en este bloque.</p>}
      {items.map((it, n) => (
        <div key={it.key} className="grid grid-cols-6 gap-2 rounded-lg bg-neutral-900 p-2 sm:grid-cols-12">
          <SelectorEjercicio value={it.ejercicio_id} ejercicios={ejercicios} className={`${input} col-span-6 sm:col-span-4`}
            onChange={(v) => onCambiar(it.key, 'ejercicio_id', v)} />
          <input type="number" min="1" value={it.series} onChange={(e) => onCambiar(it.key, 'series', e.target.value)}
            title="Series" placeholder="Series" className={`${input} col-span-2 sm:col-span-1`} />
          <input value={it.repeticiones} onChange={(e) => onCambiar(it.key, 'repeticiones', e.target.value)}
            title="Repeticiones" placeholder="Reps (8, 30s…)" className={`${input} col-span-2 sm:col-span-2`} />
          <input type="number" min="0" step="15" value={it.descanso_seg} onChange={(e) => onCambiar(it.key, 'descanso_seg', e.target.value)}
            title="Descanso en segundos" placeholder="Desc. (s)" className={`${input} col-span-2 sm:col-span-1`} />
          <input value={it.nota} onChange={(e) => onCambiar(it.key, 'nota', e.target.value)}
            placeholder="Nota para el alumno" className={`${input} col-span-4 sm:col-span-3`} />
          <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
            <BotonIcono titulo="Subir" disabled={n === 0} onClick={() => onMover(it.key, -1)}>↑</BotonIcono>
            <BotonIcono titulo="Bajar" disabled={n === items.length - 1} onClick={() => onMover(it.key, 1)}>↓</BotonIcono>
            <BotonIcono titulo="Quitar" onClick={() => onQuitar(it.key)}>✕</BotonIcono>
          </div>
        </div>
      ))}
      <button onClick={onAgregar} className="text-sm text-neutral-400 hover:text-white">+ Agregar a {bloque}</button>
    </div>
  )
}

// Solo ofrece ejercicios activos, salvo el que ya estaba elegido (para no perderlo si se desactivó)
function SelectorEjercicio({ value, ejercicios, onChange, className }) {
  const opciones = useMemo(() => ejercicios.filter((e) => e.activo || e.id === value), [ejercicios, value])
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Elegir ejercicio…</option>
      {CATEGORIAS_EJERCICIO.map((c) => {
        const grupo = opciones.filter((e) => e.categoria === c)
        return grupo.length ? (
          <optgroup key={c} label={c}>
            {grupo.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.activo ? '' : ' (inactivo)'}</option>)}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

function BotonIcono({ titulo, onClick, disabled, children }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={disabled}
      className="h-8 w-8 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30">
      {children}
    </button>
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
