import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { hoyAR, mensajeError } from '../../lib/utils'
import { horaAR, situacionCheckin, TONOS } from '../../lib/checkin'
import { normalizar } from '../../lib/filtroAlumnos'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import CampoFecha from '../../components/CampoFecha'
import { Atras, IconoBuscar } from '../../components/Iconos'

// Presentes del día (CU03): se llega desde el Mostrador con "Presentes de hoy".
//   · Lista ordenada por hora (el último que entró arriba), con DNI y estado de la cuota.
//   · Buscador por nombre o DNI y otra fecha para mirar días anteriores.
export default function Presentes() {
  const hoy = hoyAR()
  const [fecha, setFecha] = useState(hoy)
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (!fecha) return
    let cancelado = false
    setFilas(null)
    Promise.all([
      supabase.from('asistencias').select('alumno_id, fecha_hora').eq('fecha', fecha).order('fecha_hora', { ascending: false }),
      supabase.from('v_membresias').select('*'),
    ]).then(([asis, mem]) => {
      if (cancelado) return
      setError(asis.error ? mensajeError(asis.error) : '')
      const porId = Object.fromEntries((mem.data ?? []).map((a) => [a.alumno_id, a]))
      setFilas((asis.data ?? []).map((p) => ({ ...p, alumno: porId[p.alumno_id] ?? null })))
    })
    return () => { cancelado = true }
  }, [fecha])

  const visibles = useMemo(() => {
    const q = normalizar(busqueda)
    if (!filas || !q) return filas ?? []
    return filas.filter((f) => f.alumno && normalizar(`${f.alumno.nombre} ${f.alumno.apellido} ${f.alumno.dni}`).includes(q))
  }, [filas, busqueda])

  const esHoy = fecha === hoy

  return (
    <div className="space-y-4">
      <Link to="/recepcion" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
        <Atras className="h-4 w-4" /> Mostrador
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {esHoy ? 'Presentes de hoy' : 'Presentes'}
          {filas && <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-sm font-semibold text-emerald-300">{filas.length}</span>}
        </h1>
        <div className="w-44">
          <CampoFecha
            value={fecha}
            max={hoy}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-neutral-400">
        <IconoBuscar className="h-4 w-4 shrink-0 text-neutral-500" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          inputMode="search"
          autoComplete="off"
          className="w-full bg-transparent py-2 outline-none"
        />
      </div>

      <Aviso tipo="error" texto={error} />

      {!filas ? (
        <Cargando />
      ) : visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {busqueda.trim() ? `Nadie con "${busqueda.trim()}" entre los presentes.` : esHoy ? 'Todavía no hay presentes hoy.' : 'No hubo presentes ese día.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
          {visibles.map((f) => {
            const sit = f.alumno ? situacionCheckin(f.alumno) : null
            return (
              <li key={f.alumno_id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-12 shrink-0 font-semibold tabular-nums text-emerald-300">{horaAR(f.fecha_hora)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.alumno ? `${f.alumno.apellido}, ${f.alumno.nombre}` : 'Alumno dado de baja'}</p>
                  {f.alumno && <p className="text-sm text-neutral-400">DNI {f.alumno.dni}</p>}
                </div>
                {sit && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${TONOS[sit.tono].chip}`}>{sit.etiqueta}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
