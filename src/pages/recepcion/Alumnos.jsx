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
//   · Edición de datos y baja lógica (editar_alumno, dar_baja_alumno).
//   · Dados de baja: listado aparte con opción de reactivar (reactivar_alumno).
const FILTROS = ['Todos', 'En clase de prueba', 'Activo', 'Inactivo', 'Dados de baja']

export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [bajas, setBajas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState(null) // fila del alumno que se está editando
  const [avisoOk, setAvisoOk] = useState('')

  const cargar = useCallback(async () => {
    const [m, b] = await Promise.all([
      supabase
        .from('v_membresias')
        .select('alumno_id, dni, nombre, apellido, telefono, estado_alumno, estado_membresia, fecha_vencimiento, dias_restantes, fecha_clase_prueba')
        .order('apellido'),
      supabase.from('v_alumnos_baja').select('*').order('apellido'),
    ])
    const err = m.error ?? b.error
    setError(err ? mensajeError(err) : '')
    setAlumnos(m.data ?? [])
    setBajas(b.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const terminar = async (texto) => {
    setMostrarAlta(false)
    setEditando(null)
    setAvisoOk(texto)
    await cargar()
  }

  const abrirAlta = () => {
    setEditando(null)
    setAvisoOk('')
    setMostrarAlta(true)
  }

  const abrirEdicion = (alumno) => {
    setMostrarAlta(false)
    setAvisoOk('')
    setEditando(alumno)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const reactivar = async (alumno) => {
    setError('')
    const { error } = await supabase.rpc('reactivar_alumno', { p_alumno_id: alumno.alumno_id })
    if (error) return setError(mensajeError(error))
    await terminar(`${alumno.nombre} ${alumno.apellido} volvió a estar activo en el sistema.`)
  }

  // Cantidad por estado, para mostrar en cada filtro
  const conteo = useMemo(() => {
    const c = { Todos: alumnos.length, 'Dados de baja': bajas.length }
    for (const a of alumnos) c[a.estado_alumno] = (c[a.estado_alumno] ?? 0) + 1
    return c
  }, [alumnos, bajas])

  const coincide = useCallback((a) => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    const qDni = q.replace(/[.\s]/g, '') // acepta el DNI con puntos: 45.666.777
    return (qDni && a.dni.includes(qDni)) || `${a.nombre} ${a.apellido}`.toLowerCase().includes(q)
  }, [busqueda])

  const visibles = useMemo(
    () => alumnos.filter((a) => (filtro === 'Todos' || a.estado_alumno === filtro) && coincide(a)),
    [alumnos, filtro, coincide],
  )
  const bajasVisibles = useMemo(() => bajas.filter(coincide), [bajas, coincide])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alumnos</h1>
          <p className="text-sm text-neutral-400">Estado de cada alumno y de su cuota.</p>
        </div>
        {!mostrarAlta && !editando && (
          <button onClick={abrirAlta} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            + Clase de prueba
          </button>
        )}
      </div>

      {mostrarAlta && (
        <AltaClasePrueba
          alCancelar={() => setMostrarAlta(false)}
          alGuardar={(d) => terminar(`${d.nombre} ${d.apellido} quedó registrado en clase de prueba. Entra a la app con su DNI como usuario y como clave.`)}
        />
      )}

      {editando && (
        <EditarAlumno
          key={editando.alumno_id}
          alumno={editando}
          alCancelar={() => setEditando(null)}
          alTerminar={terminar}
        />
      )}

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

      {filtro === 'Dados de baja' ? (
        <TablaBajas bajas={bajasVisibles} alReactivar={reactivar} />
      ) : visibles.length === 0 ? (
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
                <th className="px-3 py-2"></th>
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
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => abrirEdicion(a)} className="text-neutral-300 hover:text-white hover:underline">
                      Editar
                    </button>
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

// ---------------------------------------------------------------
// Edición y baja lógica (CU01)
// ---------------------------------------------------------------
function EditarAlumno({ alumno, alCancelar, alTerminar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmarBaja, setConfirmarBaja] = useState(false)

  // v_membresias no trae email, nacimiento ni contacto de emergencia: se piden aparte
  useEffect(() => {
    Promise.all([
      supabase.from('usuarios').select('email_contacto').eq('id', alumno.alumno_id).single(),
      supabase.from('alumnos').select('fecha_nacimiento, contacto_emergencia').eq('usuario_id', alumno.alumno_id).single(),
    ]).then(([u, a]) => {
      if (u.error || a.error) setError(mensajeError(u.error ?? a.error))
      setDatos({
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        dni: alumno.dni,
        telefono: alumno.telefono ?? '',
        email_contacto: u.data?.email_contacto ?? '',
        fecha_nacimiento: a.data?.fecha_nacimiento ?? '',
        contacto_emergencia: a.data?.contacto_emergencia ?? '',
      })
    })
  }, [alumno])

  if (!datos) return <Cargando />

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const dni = datos.dni.replace(/[.\s]/g, '')
    const telefono = datos.telefono.replace(/\D/g, '')
    if (!datos.nombre.trim() || !datos.apellido.trim()) return setError('Completá nombre y apellido.')
    if (!esDniValido(dni)) return setError('El DNI tiene que tener 7 u 8 números.')
    if (telefono.length < 10) return setError('El celular tiene que tener código de área y número, sin el 0 ni el 15 (ej.: 3815551234).')

    setEnviando(true)
    const { error } = await supabase.rpc('editar_alumno', {
      p_alumno_id: alumno.alumno_id,
      p_dni: dni,
      p_nombre: datos.nombre,
      p_apellido: datos.apellido,
      p_telefono: telefono,
      p_email_contacto: datos.email_contacto || null,
      p_fecha_nacimiento: datos.fecha_nacimiento || null,
      p_contacto_emergencia: datos.contacto_emergencia || null,
    })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    const aviso = dni !== alumno.dni
      ? `Datos de ${datos.nombre} guardados. Ojo: ahora entra a la app con el DNI ${dni} (la clave no cambia).`
      : `Datos de ${datos.nombre} ${datos.apellido} guardados.`
    alTerminar(aviso)
  }

  const darDeBaja = async () => {
    setError('')
    setEnviando(true)
    const { error } = await supabase.rpc('dar_baja_alumno', { p_alumno_id: alumno.alumno_id })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alTerminar(`${alumno.nombre} ${alumno.apellido} fue dado de baja. Lo podés reactivar desde "Dados de baja".`)
  }

  const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Editar alumno</h2>
          <p className="text-sm text-neutral-400">
            {alumno.nombre} {alumno.apellido} · <EtiquetaAlumno estado={alumno.estado_alumno} />
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Nombre</span>
          <input value={datos.nombre} onChange={cambiar('nombre')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Apellido</span>
          <input value={datos.apellido} onChange={cambiar('apellido')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">DNI <span className="text-neutral-500">(es su usuario para entrar)</span></span>
          <input value={datos.dni} onChange={cambiar('dni')} inputMode="numeric" className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Celular</span>
          <input value={datos.telefono} onChange={cambiar('telefono')} inputMode="tel" className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Email <span className="text-neutral-500">(opcional)</span></span>
          <input type="email" value={datos.email_contacto} onChange={cambiar('email_contacto')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Fecha de nacimiento <span className="text-neutral-500">(opcional)</span></span>
          <input type="date" value={datos.fecha_nacimiento} onChange={cambiar('fecha_nacimiento')} className={campo} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Contacto de emergencia <span className="text-neutral-500">(opcional: nombre y teléfono)</span></span>
          <input value={datos.contacto_emergencia} onChange={cambiar('contacto_emergencia')} className={campo} />
        </label>
      </div>

      <Aviso tipo="error" texto={error} />

      {confirmarBaja ? (
        <div className="space-y-2 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm">
          <p className="text-red-200">
            ¿Dar de baja a {alumno.nombre} {alumno.apellido}? No se borra nada: sus pagos y asistencias quedan guardados,
            pero no va a poder entrar a la app ni aparecer en el listado. Se puede reactivar después.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmarBaja(false)} className="rounded-lg border border-neutral-700 px-4 py-2 hover:bg-neutral-800">
              No, volver
            </button>
            <button type="button" onClick={darDeBaja} disabled={enviando} className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
              Sí, dar de baja
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" onClick={() => setConfirmarBaja(true)} className="rounded-lg px-2 py-2 text-sm text-red-400 hover:underline">
            Dar de baja
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
              {enviando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------
// Dados de baja (con opción de reactivar)
// ---------------------------------------------------------------
function TablaBajas({ bajas, alReactivar }) {
  if (bajas.length === 0) return <p className="text-sm text-neutral-400">No hay alumnos dados de baja.</p>
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900 text-left text-neutral-400">
          <tr>
            <th className="px-3 py-2">Alumno</th>
            <th className="px-3 py-2">DNI</th>
            <th className="px-3 py-2">Celular</th>
            <th className="px-3 py-2">Último vencimiento</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {bajas.map((a) => (
            <tr key={a.alumno_id} className="border-t border-neutral-800 text-neutral-400">
              <td className="px-3 py-2 font-medium text-neutral-200">{a.apellido}, {a.nombre}</td>
              <td className="px-3 py-2">{a.dni}</td>
              <td className="px-3 py-2">{a.telefono ?? '—'}</td>
              <td className="px-3 py-2">{formatearFecha(a.fecha_vencimiento)}</td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => alReactivar(a)} className="text-emerald-400 hover:underline">
                  Reactivar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
