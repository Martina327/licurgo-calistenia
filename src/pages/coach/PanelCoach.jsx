import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Cargando from '../../components/Cargando'

// Panel del coach: por ahora lista los alumnos y cuántas observaciones vigentes tiene cada uno.
// Pendiente (fase 3): diseñar rutinas por días y bloques (CU09) y cargar observaciones (CU10).
export default function PanelCoach() {
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('v_membresias').select('alumno_id, nombre, apellido, plan, estado_membresia').order('apellido'),
      supabase.from('observaciones_alumno').select('alumno_id').eq('vigente', true),
    ]).then(([alumnosRes, obsRes]) => {
      const conteo = {}
      for (const o of obsRes.data ?? []) conteo[o.alumno_id] = (conteo[o.alumno_id] ?? 0) + 1
      setAlumnos((alumnosRes.data ?? []).map((a) => ({ ...a, observaciones: conteo[a.alumno_id] ?? 0 })))
      setCargando(false)
    })
  }, [])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Alumnos</h1>
      <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
        {alumnos.map((a) => (
          <li key={a.alumno_id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div>{a.apellido}, {a.nombre}</div>
              <div className="text-xs text-neutral-500">{a.plan ?? 'Sin plan'} · {a.estado_membresia}</div>
            </div>
            {a.observaciones > 0 && (
              <span className="rounded-full bg-amber-950 px-2.5 py-0.5 text-xs text-amber-300">
                {a.observaciones} observación(es)
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
