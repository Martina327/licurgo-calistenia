import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Cargando from '../../components/Cargando'
import { COLOR_ESTADO, etiquetaEstado } from '../../lib/secciones'
import { hoyAR } from '../../lib/utils'
import { lunesDe } from '../../lib/semana'
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
      supabase.from('rutinas').select('id, alumno_id').eq('activa', true),
      supabase.from('dias_completados').select('alumno_id, rutina_id, numero_dia').gte('fecha', lunesDe(hoyAR())),
    ]).then(([alumnosRes, obsRes, rutinasRes, semanaRes]) => {
      const conteo = {}
      for (const o of obsRes.data ?? []) conteo[o.alumno_id] = (conteo[o.alumno_id] ?? 0) + 1
      const conRutina = new Set((rutinasRes.data ?? []).map((r) => r.alumno_id))
      // Días distintos de la rutina activa completados esta semana
      const activa = new Set((rutinasRes.data ?? []).map((r) => r.id))
      const semana = {}
      for (const d of semanaRes.data ?? []) {
        if (!activa.has(d.rutina_id)) continue
        ;(semana[d.alumno_id] ??= new Set()).add(d.numero_dia)
      }
      setAlumnos((alumnosRes.data ?? []).map((a) => ({
        ...a,
        observaciones: conteo[a.alumno_id] ?? 0,
        tieneRutina: conRutina.has(a.alumno_id),
        diasSemana: semana[a.alumno_id]?.size ?? 0,
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
          <li key={a.alumno_id} className="flex items-start justify-between gap-3 px-4 py-3">
            {/* Izquierda: nombre y etiquetas (bajan de línea si no entran). Derecha: siempre el botón */}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-neutral-100">{a.apellido}, {a.nombre}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 ${COLOR_ESTADO[etiquetaEstado(a)] ?? 'bg-neutral-800 text-neutral-300'}`}>
                  {etiquetaEstado(a)}
                </span>
                {!a.tieneRutina && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">Sin rutina</span>
                )}
                {a.diasSemana > 0 && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300" title="Días de la rutina completados esta semana">
                    ✓ {a.diasSemana} día{a.diasSemana > 1 ? 's' : ''} esta semana
                  </span>
                )}
                <Link
                  to={`/coach/alumnos/${a.alumno_id}/observaciones`}
                  className={`rounded-full px-2 py-0.5 ${
                    a.observaciones > 0 ? 'bg-amber-950 text-amber-300 hover:bg-amber-900' : 'px-0.5 text-neutral-400 underline-offset-2 hover:text-white hover:underline'
                  }`}
                >
                  {a.observaciones > 0 ? `⚠ ${a.observaciones} observaci${a.observaciones > 1 ? 'ones' : 'ón'}` : 'Observaciones'}
                </Link>
              </div>
            </div>
            <Link
              to={`/coach/alumnos/${a.alumno_id}/rutina`}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${
                a.tieneRutina ? 'border border-neutral-700 text-neutral-200 hover:bg-neutral-800' : 'bg-white font-medium text-neutral-950 hover:bg-neutral-200'
              }`}
            >
              {a.tieneRutina ? 'Ver rutina' : 'Armar rutina'}
            </Link>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
