import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { esDniValido, formatearFecha, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { EtiquetaAlumno, EtiquetaCuota } from '../../components/EtiquetaEstado'

// Gestión de alumnos (CU01 · A1). Recepción y SuperAdmin.
//   · Listado con el estado del alumno y de la cuota, buscador y filtro.
//   · Alta rápida de clase de prueba: nombre, apellido, DNI y celular.
//     El alumno entra con su DNI como usuario y clave (cambio obligatorio al primer ingreso).
//   Próximos pasos: edición y baja lógica.
const FILTROS = ['Todos', 'En clase de prueba', 'Activo', 'Inactivo']

export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [avisoOk, setAvisoOk] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_membresias')
      .select('alumno_id, dni, nombre, apellido, telefono, estado_alumno, estado_membresia, fecha_vencimiento, dias_restantes, fecha_clase_prueba')
      .order('apellido')
    if (error) setError(mensajeError(error))
    setAlumnos(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alDarDeAlta = async (alumno) => {
    setMostrarAlta(false)
    setAvisoOk(`${alumno.nombre} ${alumno.apellido} quedó registrado en clase de prueba. Entra a la app con su DNI como usuario y como clave.`)
    await cargar()
  }

  // Cantidad por estado, para mostrar en cada filtro
  const conteo = useMemo(() => {
    const c = { Todos: alumnos.length }
    for (const a of alumnos) c[a.estado_alumno] = (c[a.estado_alumno] ?? 0) + 1
    return c
  }, [alumnos])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const qDni = q.replace(/[.\s]/g, '') // acepta el DNI con puntos: 45.666.777
    return alumnos.filter((a) => {
      if (filtro !== 'Todos' && a.estado_alumno !== filtro) return false
      if (!q) return true
      return (qDni && a.dni.includes(qDni)) || `${a.nombre} ${a.apellido}`.toLowerCase().includes(q)
    })
  }, [alumnos, busqueda, filtro])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alumnos</h1>
          <p className="text-sm text-neutral-400">Estado de cada alumno y de su cuota.</p>
        </div>
        {!mostrarAlta && (
          <button
            onClick={() => { setMostrarAlta(true); setAvisoOk('') }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950"
          >
            + Clase de prueba
          </button>
        )}
      </div>

      {mostrarAlta && <AltaClasePrueba alCancelar={() => setMostrarAlta(false)} alGuardar={alDarDeAlta} />}

      <Aviso tipo="ok" texto={avisoOk} />
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

// ---------------------------------------------------------------
// Alta rápida de clase de prueba (CU01)
// ---------------------------------------------------------------
const VACIO = { nombre: '', apellido: '', dni: '', telefono: '' }

function AltaClasePrueba({ alCancelar, alGuardar }) {
  const [datos, setDatos] = useState(VACIO)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const d = {
      nombre: datos.nombre.trim(),
      apellido: datos.apellido.trim(),
      dni: datos.dni.replace(/[.\s]/g, ''), // se aceptan puntos y espacios: se sacan
      telefono: datos.telefono.replace(/\D/g, ''),
    }
    if (!d.nombre || !d.apellido) return setError('Completá nombre y apellido.')
    if (!esDniValido(d.dni)) return setError('El DNI tiene que tener 7 u 8 números.')
    if (d.telefono.length < 10) return setError('El celular tiene que tener código de área y número, sin el 0 ni el 15 (ej.: 3815551234).')

    setEnviando(true)
    const { error } = await supabase.rpc('alta_clase_prueba', {
      p_dni: d.dni,
      p_nombre: d.nombre,
      p_apellido: d.apellido,
      p_telefono: d.telefono,
    })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alGuardar(d)
  }

  const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">Nueva clase de prueba</h2>
        <p className="text-sm text-neutral-400">El resto de los datos se completa cuando paga la primera cuota.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Nombre</span>
          <input value={datos.nombre} onChange={cambiar('nombre')} className={campo} autoFocus />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Apellido</span>
          <input value={datos.apellido} onChange={cambiar('apellido')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">DNI</span>
          <input value={datos.dni} onChange={cambiar('dni')} inputMode="numeric" placeholder="Con o sin puntos" className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Celular</span>
          <input value={datos.telefono} onChange={cambiar('telefono')} inputMode="tel" placeholder="3815551234" className={campo} />
        </label>
      </div>
      <Aviso tipo="error" texto={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Registrar'}
        </button>
      </div>
    </form>
  )
}
