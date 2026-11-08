import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha, formatearPesos, hoyAR, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { EtiquetaAlumno, EtiquetaCuota } from '../../components/EtiquetaEstado'

// Caja (Pareja A). Recepción y SuperAdmin.
//   A2 · Abrir el turno de caja con el monto inicial (el cambio que hay en la caja).
//   A2 · Cobrar la cuota en efectivo (CU06): registrar_pago_efectivo suma +30 días al
//        vencimiento actual. En el primer pago el alumno pasa a Activo y la ficha tiene
//        que estar completa: si falta algo se completa acá mismo antes de cobrar.
//   Sin turno abierto no se puede cobrar en efectivo: la base lo rechaza (_turno_abierto).
//   El total esperado del turno NO se muestra: el cierre es un arqueo ciego (A5).
//   Próximos pasos: kiosco (A3), subalquileres (A4), cierre (A5).

const formatearHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export default function Caja() {
  const { perfil } = useAuth()
  const [turno, setTurno] = useState(null) // turno abierto de este usuario, o null
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('turnos_caja')
      .select('id, abierto_at, monto_inicial')
      .eq('usuario_id', perfil.id)
      .is('cerrado_at', null)
      .maybeSingle()
    setError(error ? mensajeError(error) : '')
    setTurno(data)
    setCargando(false)
  }, [perfil.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Caja</h1>
        <p className="text-sm text-neutral-400">Cobros en efectivo del mostrador. Se registran en tu turno de caja.</p>
      </div>

      <Aviso tipo="error" texto={error} />

      {turno ? (
        <>
          <TurnoAbierto turno={turno} />
          <CobrarCuota />
        </>
      ) : (
        <AbrirTurno alAbrir={cargar} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Abrir turno
// ---------------------------------------------------------------
function AbrirTurno({ alAbrir }) {
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const abrir = async (e) => {
    e.preventDefault()
    setError('')
    const valor = Number(String(monto).replace(/\./g, '').replace(',', '.'))
    if (monto.trim() === '' || Number.isNaN(valor) || valor < 0) {
      return setError('Ingresá el efectivo que hay en la caja al empezar (0 si no hay).')
    }
    setEnviando(true)
    const { error } = await supabase.rpc('abrir_turno', { p_monto_inicial: valor })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alAbrir()
  }

  return (
    <form onSubmit={abrir} className="max-w-md space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">Abrir turno de caja</h2>
        <p className="text-sm text-neutral-400">
          Contá el efectivo que hay en la caja antes de empezar (el cambio) y anotalo.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-neutral-400">Efectivo inicial</span>
        <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
          <span className="pl-3 text-neutral-500">$</span>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-transparent px-2 py-2 outline-none"
            autoFocus
          />
        </div>
      </label>
      <Aviso tipo="error" texto={error} />
      <button type="submit" disabled={enviando} className="w-full rounded-lg bg-white px-4 py-2 font-semibold text-neutral-950 disabled:opacity-50">
        {enviando ? 'Abriendo…' : 'Abrir turno'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------
// Turno abierto
// ---------------------------------------------------------------
function TurnoAbierto({ turno }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div>
          <p className="font-medium text-emerald-200">Turno abierto</p>
          <p className="text-sm text-emerald-300/70">
            Desde el {formatearHora(turno.abierto_at)} · Efectivo inicial {formatearPesos(turno.monto_inicial)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Cobrar cuota en efectivo (CU06)
// ---------------------------------------------------------------
const CAMPOS_COBRO =
  'alumno_id, dni, nombre, apellido, telefono, email, precio_plan, fecha_vencimiento, estado_alumno, estado_membresia, datos_faltantes'

// Mismo cálculo que _extender_membresia: +30 días al vencimiento actual.
// Si nunca pagó o está inactivo (vencido hace más de 30 días), los 30 días cuentan desde hoy.
const sumarDias = (iso, dias) => {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

function CobrarCuota() {
  const [alumnos, setAlumnos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState(null)
  const [ultimoCobro, setUltimoCobro] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('v_membresias').select(CAMPOS_COBRO).order('apellido')
    if (error) setError(mensajeError(error))
    setAlumnos(data ?? [])
    return data ?? []
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    const qDni = q.replace(/[.\s]/g, '')
    return alumnos
      .filter((a) => (qDni && a.dni.includes(qDni)) || `${a.nombre} ${a.apellido}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [alumnos, busqueda])

  const elegir = (a) => {
    setUltimoCobro(null)
    setElegido(a)
    setBusqueda('')
  }

  // Después de completar la ficha se vuelve a leer al alumno (datos_faltantes actualizado)
  const refrescarElegido = async () => {
    const lista = await cargar()
    setElegido(lista.find((a) => a.alumno_id === elegido.alumno_id) ?? null)
  }

  const alCobrar = async (cobro) => {
    setElegido(null)
    setUltimoCobro(cobro)
    await cargar()
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Cobrar cuota</h2>
        <p className="text-sm text-neutral-400">Buscá al alumno por DNI o nombre. Cada cuota suma 30 días a su vencimiento.</p>
      </div>

      <Aviso tipo="error" texto={error} />

      {ultimoCobro && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          <p className="font-medium">
            Cobro registrado: {ultimoCobro.nombre} {ultimoCobro.apellido} · {formatearPesos(ultimoCobro.monto)} en efectivo
          </p>
          <p className="text-emerald-300/80">
            Nuevo vencimiento: {formatearFecha(ultimoCobro.vencimiento)}
            {ultimoCobro.primerPago && ' · Pasó de clase de prueba a alumno activo.'}
            {ultimoCobro.vuelveInactivo && ' · Volvió a estar activo.'}
          </p>
        </div>
      )}

      {!elegido && (
        <>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="DNI o nombre"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400"
          />
          {busqueda.trim() && resultados.length === 0 && (
            <p className="text-sm text-neutral-400">No hay alumnos que coincidan.</p>
          )}
          {resultados.length > 0 && (
            <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
              {resultados.map((a) => (
                <li key={a.alumno_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{a.nombre} {a.apellido}</p>
                    <p className="text-xs text-neutral-400">DNI {a.dni} · {a.estado_alumno}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <EtiquetaCuota estado={a.estado_membresia} />
                    <button onClick={() => elegir(a)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-950">
                      Cobrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {elegido && (
        <DetalleCobro
          alumno={elegido}
          alCancelar={() => setElegido(null)}
          alCompletarFicha={refrescarElegido}
          alCobrar={alCobrar}
        />
      )}
    </section>
  )
}

function DetalleCobro({ alumno, alCancelar, alCompletarFicha, alCobrar }) {
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const primerPago = alumno.estado_alumno === 'En clase de prueba'
  const faltaFicha = primerPago && alumno.datos_faltantes?.length > 0
  const vuelveInactivo = alumno.estado_alumno === 'Inactivo'
  const base = primerPago || vuelveInactivo ? hoyAR() : alumno.fecha_vencimiento
  const nuevoVencimiento = sumarDias(base, 30)

  const cobrar = async () => {
    setError('')
    setEnviando(true)
    const { data, error } = await supabase.rpc('registrar_pago_efectivo', { p_alumno_id: alumno.alumno_id })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alCobrar({
      nombre: alumno.nombre,
      apellido: alumno.apellido,
      monto: alumno.precio_plan,
      vencimiento: data,
      primerPago,
      vuelveInactivo,
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{alumno.nombre} {alumno.apellido}</p>
          <p className="text-sm text-neutral-400">DNI {alumno.dni}</p>
        </div>
        <div className="flex gap-2">
          <EtiquetaAlumno estado={alumno.estado_alumno} />
          <EtiquetaCuota estado={alumno.estado_membresia} />
        </div>
      </div>

      {faltaFicha ? (
        <CompletarFicha alumno={alumno} alGuardar={alCompletarFicha} alCancelar={alCancelar} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-400">Cuota</dt>
              <dd className="text-xl font-semibold">{formatearPesos(alumno.precio_plan)}</dd>
            </div>
            <div>
              <dt className="text-neutral-400">Vence hoy</dt>
              <dd>{primerPago ? 'Primer pago' : formatearFecha(alumno.fecha_vencimiento)}</dd>
            </div>
            <div>
              <dt className="text-neutral-400">Nuevo vencimiento</dt>
              <dd className="font-medium">{formatearFecha(nuevoVencimiento)}</dd>
            </div>
          </dl>

          {primerPago && (
            <p className="text-sm text-sky-300">Es su primer pago: pasa de clase de prueba a alumno activo.</p>
          )}
          {vuelveInactivo && (
            <p className="text-sm text-sky-300">Vuelve después de estar inactivo: los 30 días cuentan desde hoy.</p>
          )}

          <Aviso tipo="error" texto={error} />

          <div className="flex justify-end gap-2">
            <button onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
              Cancelar
            </button>
            <button onClick={cobrar} disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
              {enviando ? 'Registrando…' : `Recibí ${formatearPesos(alumno.precio_plan)} en efectivo`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Primer pago con la ficha incompleta: se completa acá (editar_alumno) y después se cobra
function CompletarFicha({ alumno, alGuardar, alCancelar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    supabase
      .from('alumnos')
      .select('fecha_nacimiento, domicilio, contacto_emergencia')
      .eq('usuario_id', alumno.alumno_id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        setDatos({
          email: alumno.email ?? '',
          fecha_nacimiento: data?.fecha_nacimiento ?? '',
          domicilio: data?.domicilio ?? '',
          contacto_emergencia: data?.contacto_emergencia ?? '',
        })
      })
  }, [alumno])

  if (!datos) return <Cargando />

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!datos.email.trim() || !datos.fecha_nacimiento || !datos.domicilio.trim() || !datos.contacto_emergencia.trim()) {
      return setError('Completá todos los datos para poder cobrar la primera cuota.')
    }
    setEnviando(true)
    const { error } = await supabase.rpc('editar_alumno', {
      p_alumno_id: alumno.alumno_id,
      p_dni: alumno.dni,
      p_nombre: alumno.nombre,
      p_apellido: alumno.apellido,
      p_telefono: alumno.telefono,
      p_email_contacto: datos.email.trim(),
      p_fecha_nacimiento: datos.fecha_nacimiento,
      p_domicilio: datos.domicilio,
      p_contacto_emergencia: datos.contacto_emergencia,
    })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alGuardar()
  }

  const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

  return (
    <form onSubmit={guardar} className="space-y-3">
      <div className="rounded-lg border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
        Es su primer pago y le falta completar la ficha: {alumno.datos_faltantes.join(', ')}.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Email</span>
          <input type="email" value={datos.email} onChange={cambiar('email')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Fecha de nacimiento</span>
          <input type="date" value={datos.fecha_nacimiento} onChange={cambiar('fecha_nacimiento')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Domicilio</span>
          <input value={datos.domicilio} onChange={cambiar('domicilio')} placeholder="Calle, número, barrio" className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Contacto de emergencia</span>
          <input value={datos.contacto_emergencia} onChange={cambiar('contacto_emergencia')} placeholder="Nombre y teléfono" className={campo} />
        </label>
      </div>
      <Aviso tipo="error" texto={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Guardar ficha y seguir al cobro'}
        </button>
      </div>
    </form>
  )
}
