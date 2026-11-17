import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { esDniValido, hoyAR, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import CampoFecha from '../../components/CampoFecha'
import { EtiquetaAlumno, EtiquetaUnica } from '../../components/EtiquetaEstado'
import { Chevron, IconoBuscar } from '../../components/Iconos'
import { horaAR, situacionCheckin, TONOS } from '../../lib/checkin'

// Gestión de alumnos (CU01 · A1). Recepción y SuperAdmin.
//   · Buscador y filtros; la ficha de cada alumno está en FichaAlumno.jsx.
//   · Alta rápida de clase de prueba: nombre, apellido, DNI, celular y email.
//     El alumno entra con su DNI como usuario y clave (cambio obligatorio al primer ingreso).
//   · Edición de datos y baja lógica (editar_alumno, dar_baja_alumno).
//     Ficha completa (nacimiento, domicilio, contacto de emergencia): obligatoria
//     para pagar la primera cuota; la base lo controla en _extender_membresia.
//   · Dados de baja: filtro aparte; se reactivan desde la ficha (reactivar_alumno).
const FILTROS = ['En clase de prueba', 'Activo', 'Inactivo', 'Pase libre', 'Dados de baja']

// Pantalla de Alumnos: solo el buscador (y los filtros). La lista aparece al buscar o al elegir
// un filtro; tocar un alumno abre su ficha completa (/recepcion/alumnos/:id).
export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [bajas, setBajas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  // ?filtro=Activo: llega desde las tarjetas del Inicio del dueño
  const [filtro, setFiltro] = useState(() => {
    const f = new URLSearchParams(window.location.search).get('filtro')
    return FILTROS.includes(f) ? f : null
  })
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [avisoOk, setAvisoOk] = useState('')
  const [presentes, setPresentes] = useState({}) // { alumno_id: fecha_hora } de hoy
  const [marcando, setMarcando] = useState(null)
  const [resultado, setResultado] = useState(null) // { alumno, situacion, hora }
  const ir = useNavigate()

  // Presente desde la lista (igual que en el Mostrador): la cuota vencida avisa, no bloquea
  const marcarPresente = async (alumno) => {
    if (marcando) return
    setError('')
    setMarcando(alumno.alumno_id)
    const { data, error } = await supabase.rpc('registrar_checkin', { p_alumno_id: alumno.alumno_id })
    setMarcando(null)
    if (error) return setError(mensajeError(error))
    const hora = data?.fecha_hora ?? new Date().toISOString()
    setPresentes((p) => ({ ...p, [alumno.alumno_id]: hora }))
    setResultado({ alumno, situacion: situacionCheckin(alumno), hora })
  }

  const cargar = useCallback(async () => {
    const [m, b, p] = await Promise.all([
      supabase
        .from('v_membresias')
        .select('alumno_id, dni, nombre, apellido, telefono, estado_alumno, estado_membresia, fecha_vencimiento, dias_restantes, fecha_clase_prueba, datos_faltantes, pase_libre, pase_libre_motivo')
        .order('apellido'),
      supabase.from('v_alumnos_baja').select('*').order('apellido'),
      supabase.from('asistencias').select('alumno_id, fecha_hora').eq('fecha', hoyAR()),
    ])
    const err = m.error ?? b.error
    setError(err ? mensajeError(err) : '')
    setAlumnos(m.data ?? [])
    setBajas((b.data ?? []).map((a) => ({ ...a, deBaja: true })))
    setPresentes(Object.fromEntries((p.data ?? []).map((x) => [x.alumno_id, x.fecha_hora])))
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // ?editar=<alumno_id>: llega desde Comprobantes (B5) para completar la ficha antes del primer pago
  const [params] = useSearchParams()
  const editarId = params.get('editar')
  useEffect(() => {
    if (editarId) ir(`/recepcion/alumnos/${editarId}?editar=1`, { replace: true })
  }, [editarId, ir])

  // Cantidad por estado, para mostrar en cada filtro
  const conteo = useMemo(() => {
    const c = { 'Dados de baja': bajas.length }
    for (const a of alumnos) c[a.estado_alumno] = (c[a.estado_alumno] ?? 0) + 1
    c['Pase libre'] = alumnos.filter((a) => a.pase_libre).length
    return c
  }, [alumnos, bajas])

  const q = busqueda.trim().toLowerCase()
  const qDni = q.replace(/[.\s]/g, '') // acepta el DNI con puntos: 45.666.777
  const esDni = /^\d+$/.test(qDni)
  const corta = esDni ? qDni.length < 3 : q.length < 2
  const coincide = (a) =>
    !q || (esDni ? a.dni.includes(qDni) : `${a.nombre} ${a.apellido}`.toLowerCase().includes(q) || `${a.apellido} ${a.nombre}`.toLowerCase().includes(q))

  const mostrar = Boolean(filtro) || (q && !corta)
  const visibles = !mostrar ? [] : (
    filtro === 'Dados de baja' ? bajas
    : filtro === 'Pase libre' ? alumnos.filter((a) => a.pase_libre)
    : filtro ? alumnos.filter((a) => a.estado_alumno === filtro)
    : [...alumnos, ...bajas]
  ).filter(coincide)

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Alumnos</h1>
        {!mostrarAlta && (
          <button onClick={() => { setAvisoOk(''); setMostrarAlta(true) }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            + Clase de prueba
          </button>
        )}
      </div>

      {mostrarAlta && (
        <AltaClasePrueba
          alCancelar={() => setMostrarAlta(false)}
          alGuardar={async (d) => {
            setMostrarAlta(false)
            setAvisoOk(`${d.nombre} ${d.apellido} quedó registrado en clase de prueba. Entra a la app con su DNI como usuario y como clave.`)
            await cargar()
          }}
        />
      )}

      <Aviso tipo="ok" texto={avisoOk} />
      <Aviso tipo="error" texto={error} />
      {resultado && (
        <div role="status" className={`rounded-xl border px-4 py-3 ${TONOS[resultado.situacion.tono].caja}`}>
          <p className="font-semibold">
            Presente registrado · {resultado.alumno.nombre} {resultado.alumno.apellido}
            <span className="font-normal opacity-70"> · {horaAR(resultado.hora)}</span>
          </p>
          <p className="text-sm opacity-90">{resultado.situacion.texto}</p>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 focus-within:border-neutral-400">
        <IconoBuscar className="h-5 w-5 shrink-0 text-neutral-500" />
        <input
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setResultado(null) }}
          placeholder="Buscar por DNI o nombre"
          inputMode="search"
          autoComplete="off"
          autoFocus
          className="w-full bg-transparent py-3 text-lg outline-none"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="text-neutral-500 hover:text-white" aria-label="Borrar búsqueda">✕</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(filtro === f ? null : f)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filtro === f ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
            }`}
          >
            {f} <span className="opacity-60">({conteo[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {q && corta && !filtro ? (
        <p className="px-1 text-sm text-neutral-500">{esDni ? 'Escribí al menos 3 números del DNI.' : 'Escribí al menos 2 letras del nombre.'}</p>
      ) : mostrar && visibles.length === 0 ? (
        <p className="px-1 text-sm text-neutral-500">No hay alumnos que coincidan.</p>
      ) : visibles.length > 0 && (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
          {visibles.map((a) => (
            <li key={a.alumno_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${a.deBaja ? 'text-neutral-400' : ''}`}>{a.apellido}, {a.nombre}</span>
                    {a.datos_faltantes?.length > 0 && (
                      <span className="rounded-full border border-amber-800 px-2 py-0.5 text-[11px] font-medium text-amber-400">Falta info</span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">DNI {a.dni}</p>
                </div>
                {a.deBaja ? (
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-400">Dado de baja</span>
                ) : (
                  <EtiquetaUnica alumno={a} />
                )}
                {!a.deBaja && (presentes[a.alumno_id] ? (
                  <span className="w-24 shrink-0 text-right text-sm text-emerald-300">✓ {horaAR(presentes[a.alumno_id])}</span>
                ) : (
                  <button
                    onClick={() => marcarPresente(a)}
                    disabled={Boolean(marcando)}
                    className="w-24 shrink-0 rounded-lg bg-white py-1.5 text-sm font-semibold text-neutral-950 disabled:opacity-50"
                  >
                    {marcando === a.alumno_id ? '…' : 'Presente'}
                  </button>
                ))}
                <button
                  onClick={() => ir(`/recepcion/alumnos/${a.alumno_id}`)}
                  aria-label={`Ver ficha de ${a.nombre} ${a.apellido}`}
                  title="Ver ficha"
                  className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  <Chevron className="h-5 w-5" />
                </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Alta rápida de clase de prueba (CU01)
// ---------------------------------------------------------------
const VACIO = { nombre: '', apellido: '', dni: '', telefono: '', email: '' }
const esEmailValido = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

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
      email: datos.email.trim().toLowerCase(),
    }
    if (!d.nombre || !d.apellido) return setError('Completá nombre y apellido.')
    if (!esDniValido(d.dni)) return setError('El DNI tiene que tener 7 u 8 números.')
    if (d.telefono.length < 10) return setError('El celular tiene que tener código de área y número, sin el 0 ni el 15 (ej.: 3815551234).')
    if (!esEmailValido(d.email)) return setError('Ingresá un email válido.')

    setEnviando(true)
    const { error } = await supabase.rpc('alta_clase_prueba', {
      p_dni: d.dni,
      p_nombre: d.nombre,
      p_apellido: d.apellido,
      p_telefono: d.telefono,
      p_email: d.email,
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
        <p className="text-sm text-neutral-400">Todos los datos son obligatorios: sirven para volver a contactarla si no regresa. El resto de la ficha se completa al pagar la primera cuota.</p>
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
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Email</span>
          <input type="email" value={datos.email} onChange={cambiar('email')} placeholder="nombre@ejemplo.com" className={campo} />
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
export function EditarAlumno({ alumno, alCancelar, alTerminar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmarBaja, setConfirmarBaja] = useState(false)

  // Si ya pagó alguna vez, la ficha completa es obligatoria; si no, se puede ir completando
  // (mismo criterio que editar_alumno en la base: tiene fecha de vencimiento)
  const fichaObligatoria = Boolean(alumno.fecha_vencimiento)

  // v_membresias no trae nacimiento ni contacto de emergencia: se piden aparte
  useEffect(() => {
    Promise.all([
      supabase.from('usuarios').select('email_contacto').eq('id', alumno.alumno_id).single(),
      supabase.from('alumnos').select('fecha_nacimiento, domicilio, contacto_emergencia').eq('usuario_id', alumno.alumno_id).single(),
    ]).then(([u, a]) => {
      if (u.error || a.error) setError(mensajeError(u.error ?? a.error))
      setDatos({
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        dni: alumno.dni,
        telefono: alumno.telefono ?? '',
        email_contacto: u.data?.email_contacto ?? '',
        fecha_nacimiento: a.data?.fecha_nacimiento ?? '',
        domicilio: a.data?.domicilio ?? '',
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
    if (!esEmailValido(datos.email_contacto.trim())) return setError('Ingresá un email válido.')
    if (datos.fecha_nacimiento === null) return setError('Revisá la fecha de nacimiento (día/mes/año).')
    if (fichaObligatoria && (!datos.fecha_nacimiento || !datos.domicilio.trim() || !datos.contacto_emergencia.trim())) {
      return setError('Completá fecha de nacimiento, domicilio y contacto de emergencia.')
    }

    setEnviando(true)
    const { error } = await supabase.rpc('editar_alumno', {
      p_alumno_id: alumno.alumno_id,
      p_dni: dni,
      p_nombre: datos.nombre,
      p_apellido: datos.apellido,
      p_telefono: telefono,
      p_email_contacto: datos.email_contacto.trim(),
      p_fecha_nacimiento: datos.fecha_nacimiento || null,
      p_domicilio: datos.domicilio || null,
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
          <span className="text-neutral-400">Email</span>
          <input type="email" value={datos.email_contacto} onChange={cambiar('email_contacto')} className={campo} />
        </label>
      </div>

      <div className="space-y-3 border-t border-neutral-800 pt-3">
        <p className="text-sm text-neutral-400">
          {fichaObligatoria
            ? 'Ficha del alumno: todos los datos son obligatorios.'
            : 'Ficha del alumno: obligatoria para pagar la primera cuota. Se puede ir completando.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-neutral-400">Fecha de nacimiento</span>
            <CampoFecha value={datos.fecha_nacimiento} onChange={cambiar('fecha_nacimiento')} max={hoyAR()} className={campo} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-neutral-400">Domicilio</span>
            <input value={datos.domicilio} onChange={cambiar('domicilio')} placeholder="Calle, número, barrio" className={campo} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-neutral-400">Contacto de emergencia <span className="text-neutral-500">(nombre y teléfono)</span></span>
            <input value={datos.contacto_emergencia} onChange={cambiar('contacto_emergencia')} placeholder="Ej.: Ana Pérez (madre) 3815551234" className={campo} />
          </label>
        </div>
      </div>

      <PaseLibre alumno={alumno} alTerminar={alTerminar} />

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
// Pase Libre (RF12 · A6): lo dan recepción y el dueño; lo quita solo el dueño
// ---------------------------------------------------------------
function PaseLibre({ alumno, alTerminar }) {
  const { perfil } = useAuth()
  const esDueno = perfil?.rol === 'SuperAdmin'
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const nombre = `${alumno.nombre} ${alumno.apellido}`

  const asignar = async () => {
    setError('')
    if (!motivo.trim()) return setError('Escribí el motivo (ej.: profe, pareja del profe).')
    setEnviando(true)
    const { error } = await supabase.rpc('asignar_pase_libre', { p_alumno_id: alumno.alumno_id, p_motivo: motivo.trim() })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alTerminar(`${nombre} tiene pase libre: cuenta como al día y no le llegan avisos de cuota.`)
  }

  const quitar = async () => {
    setError('')
    setEnviando(true)
    const { error } = await supabase.rpc('quitar_pase_libre', { p_alumno_id: alumno.alumno_id })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alTerminar(`${nombre} ya no tiene pase libre: vuelve a pagar la cuota normalmente.`)
  }

  return (
    <div className="space-y-2 rounded-lg border border-sky-900/60 bg-sky-950/20 p-3 text-sm">
      {alumno.pase_libre ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sky-200">
            <span className="font-medium">Pase libre</span>
            {alumno.pase_libre_motivo ? ` · ${alumno.pase_libre_motivo}` : ''} · no vence
          </p>
          {esDueno ? (
            <button type="button" onClick={quitar} disabled={enviando} className="text-red-400 hover:underline disabled:opacity-50">
              Quitar pase libre
            </button>
          ) : (
            <span className="text-xs text-neutral-400">Solo el dueño lo puede quitar.</span>
          )}
        </div>
      ) : abierto ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-neutral-300">Motivo del pase libre</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: profe, pareja del profe"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400"
              autoFocus
            />
          </label>
          <p className="text-xs text-neutral-400">No paga cuota ni vence. Queda registrado quién lo dio. Solo el dueño lo puede quitar.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAbierto(false); setError('') }} className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800">
              Cancelar
            </button>
            <button type="button" onClick={asignar} disabled={enviando} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-neutral-950 disabled:opacity-50">
              Dar pase libre
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-neutral-400">Sin pase libre.</p>
          <button type="button" onClick={() => setAbierto(true)} className="text-sky-300 hover:underline">
            Dar pase libre
          </button>
        </div>
      )}
      <Aviso tipo="error" texto={error} />
    </div>
  )
}
