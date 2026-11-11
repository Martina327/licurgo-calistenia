import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Cargando from '../../components/Cargando'
import { FILTROS_ALUMNOS, FILTRO_INICIAL, contarPorFiltro, filtrarAlumnos } from '../../lib/filtroAlumnos'

const CLAVE_FILTRO = 'licurgo.coach.filtroAlumnos'
const leerFiltro = () => {
  try { return localStorage.getItem(CLAVE_FILTRO) ?? FILTRO_INICIAL } catch { return FILTRO_INICIAL }
}

// Panel del coach: lista los alumnos, si tienen rutina activa y cuántas observaciones vigentes.
// Desde acá se entra a la rutina (CU09) y a las observaciones (CU10) de cada uno.
// Buscador por nombre, apellido o DNI y filtro por estado (por defecto, solo los que están al día).
export default function PanelCoach() {
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState(leerFiltro)

  const elegirFiltro = (id) => {
    setFiltro(id)
    try { localStorage.setItem(CLAVE_FILTRO, id) } catch { /* sin almacenamiento */ }
  }

  useEffect(() => {
    Promise.all([
      supabase.from('v_membresias').select('alumno_id, dni, nombre, apellido, plan, estado_membresia, estado_alumno').order('apellido'),
      supabase.from('observaciones_alumno').select('alumno_id').eq('vigente', true),
      supabase.from('rutinas').select('alumno_id').eq('activa', true),
    ]).then(([alumnosRes, obsRes, rutinasRes]) => {
      const conteo = {}
      for (const o of obsRes.data ?? []) conteo[o.alumno_id] = (conteo[o.alumno_id] ?? 0) + 1
      const conRutina = new Set((rutinasRes.data ?? []).map((r) => r.alumno_id))
      setAlumnos((alumnosRes.data ?? []).map((a) => ({
        ...a,
        observaciones: conteo[a.alumno_id] ?? 0,
        tieneRutina: conRutina.has(a.alumno_id),
      })))
      setCargando(false)
    })
  }, [])

  const visibles = useMemo(() => filtrarAlumnos(alumnos, filtro, busqueda), [alumnos, filtro, busqueda])
  const conteo = useMemo(() => contarPorFiltro(alumnos, busqueda), [alumnos, busqueda])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Alumnos</h1>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, apellido o DNI…"
        aria-label="Buscar alumno"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {FILTROS_ALUMNOS.map((f) => (
          <button
            key={f.id}
            onClick={() => elegirFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`rounded-full px-3 py-1 text-sm ${
              filtro === f.id ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300 hover:border-neutral-500'
            }`}
          >
            {f.texto} <span className={filtro === f.id ? 'text-neutral-500' : 'text-neutral-500'}>{conteo[f.id]}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          {busqueda ? `Ningún alumno coincide con "${busqueda}" en este filtro.` : 'No hay alumnos en este filtro.'}
          {filtro !== 'todos' && conteo.todos > 0 && (
            <button onClick={() => elegirFiltro('todos')} className="ml-2 underline hover:text-white">
              Ver en Todos ({conteo.todos})
            </button>
          )}
        </div>
      ) : (
      <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
        {visibles.map((a) => (
          <li key={a.alumno_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <div>{a.apellido}, {a.nombre}</div>
              <div className="text-xs text-neutral-500">{a.plan ?? 'Sin plan'} · {a.estado_membresia}</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                to={`/coach/alumnos/${a.alumno_id}/observaciones`}
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  a.observaciones > 0 ? 'bg-amber-950 text-amber-300 hover:bg-amber-900' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {a.observaciones > 0 ? `⚠ ${a.observaciones} observación(es)` : 'Observaciones'}
              </Link>
              {!a.tieneRutina && (
                <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-400">Sin rutina</span>
              )}
              <Link
                to={`/coach/alumnos/${a.alumno_id}/rutina`}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                {a.tieneRutina ? 'Ver rutina' : 'Armar rutina'}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
