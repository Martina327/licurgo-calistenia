import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { EtiquetaAlumno, EtiquetaCuota } from '../../components/EtiquetaEstado'

// Gestión de alumnos (CU01 · A1). Recepción y SuperAdmin.
//   Paso 2: listado con el estado del alumno y de la cuota, buscador y filtro.
//   Próximos pasos: alta rápida de clase de prueba, edición y baja lógica.
const FILTROS = ['Todos', 'En clase de prueba', 'Activo', 'Inactivo']

export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('Todos')

  useEffect(() => {
    supabase
      .from('v_membresias')
      .select('alumno_id, dni, nombre, apellido, telefono, estado_alumno, estado_membresia, fecha_vencimiento, dias_restantes, fecha_clase_prueba')
      .order('apellido')
      .then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        setAlumnos(data ?? [])
        setCargando(false)
      })
  }, [])

  // Cantidad por estado, para mostrar en cada filtro
  const conteo = useMemo(() => {
    const c = { Todos: alumnos.length }
    for (const a of alumnos) c[a.estado_alumno] = (c[a.estado_alumno] ?? 0) + 1
    return c
  }, [alumnos])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return alumnos.filter((a) => {
      if (filtro !== 'Todos' && a.estado_alumno !== filtro) return false
      if (!q) return true
      return a.dni.includes(q) || `${a.nombre} ${a.apellido}`.toLowerCase().includes(q)
    })
  }, [alumnos, busqueda, filtro])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Alumnos</h1>
        <p className="text-sm text-neutral-400">Estado de cada alumno y de su cuota.</p>
      </div>

      <Aviso tipo="error" texto={error} />

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por DNI o nombre"
        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400"
      />

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filtro === f ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
            }`}
          >
            {f} <span className="opacity-60">({conteo[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay alumnos que coincidan.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="px-3 py-2">Alumno</th>
                <th className="px-3 py-2">DNI</th>
                <th className="px-3 py-2">Celular</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Cuota</th>
                <th className="px-3 py-2">Vence</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => (
                <tr key={a.alumno_id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 font-medium">{a.apellido}, {a.nombre}</td>
                  <td className="px-3 py-2">{a.dni}</td>
                  <td className="px-3 py-2">{a.telefono ?? '—'}</td>
                  <td className="px-3 py-2"><EtiquetaAlumno estado={a.estado_alumno} /></td>
                  <td className="px-3 py-2"><EtiquetaCuota estado={a.estado_membresia} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {a.estado_alumno === 'En clase de prueba'
                      ? <span className="text-neutral-500">Prueba el {formatearFecha(a.fecha_clase_prueba)}</span>
                      : formatearFecha(a.fecha_vencimiento)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
