import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha, formatearPesos, hoyAR, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import Ayuda from '../../components/Ayuda'
import CampoFecha from '../../components/CampoFecha'
import { EtiquetaAlumno, EtiquetaCuota } from '../../components/EtiquetaEstado'
import { IconoBuscar } from '../../components/Iconos'
import { AYUDA_STOCK, ayudaVencimiento, buscarProductos, filtrarCategoria, FILTROS_CATEGORIA, COLOR_STOCK, estadoStock, estadoVencimiento } from '../../lib/kiosco'

// Caja (Pareja A). Recepción y SuperAdmin.
//   A2 · Abrir el turno de caja con el monto inicial (el cambio que hay en la caja).
//   A2 · Cobrar la cuota en efectivo (CU06): registrar_pago_efectivo suma +30 días al
//        vencimiento actual. En el primer pago el alumno pasa a Activo y la ficha tiene
//        que estar completa: si falta algo se completa acá mismo antes de cobrar.
//   Sin turno abierto no se puede cobrar en efectivo: la base lo rechaza (_turno_abierto).
//   El total esperado del turno NO se muestra: el cierre es un arqueo ciego (A5).
//   A3 · Kiosco (CU04): carrito con medio de pago; registrar_venta descuenta stock y
//        frena si no alcanza. En efectivo va al turno; por transferencia, solo al dashboard.
//   A4 · Subalquiler (CU16): salón, modalidad (por hora o mensual), quién alquila y medio
//        de pago. El monto lo calcula la base con el precio vigente del salón (no se edita).
//   A5 · Cierre del turno (CU05): arqueo ciego. La recepcionista cuenta el efectivo y lo
//        carga SIN ver cuánto debería haber. Al cerrar ve SOLO si cierra justo, sobra o falta
//        y cuánto (opción B, 12/11/2026): no ve lo cobrado ni el esperado. Si hay diferencia,
//        pide justificarla (justificar_cierre, una sola vez) y el dueño la ve como aviso en
//        Ingresos hasta marcarla revisada. El turno cerrado no se edita.
//   Caja solo de RECEPCIONISTAS (turno, kiosco, arqueo). El DUEÑO entra a "Cobros": sin turno,
//        anota cuotas (efectivo o transferencia) y subalquileres que le pagan directo a él.
//        Su efectivo queda registrado sin turno y no altera el cierre de nadie (migración 20261111_03).

const formatearHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

const PESTANAS = [
  { id: 'Cuota', texto: 'Cobrar cuota' },
  { id: 'Kiosco', texto: 'Kiosco' },
  { id: 'Subalquiler', texto: 'Subalquiler' },
]

export default function Caja() {
  const { perfil } = useAuth()
  const esDueno = perfil.rol === 'SuperAdmin'
  const [pestana, setPestana] = useState('Cuota')
  const [turno, setTurno] = useState(null) // turno abierto de este usuario, o null
  const [cerrando, setCerrando] = useState(false)
  const [resultado, setResultado] = useState(null) // resultado del cierre recién hecho
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
    if (!esDueno) cargar()
  }, [cargar, esDueno])

  if (esDueno) return <CobrosDueno />
  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-1 text-xl font-semibold">
        Caja
        <Ayuda texto="Cobros del mostrador. Lo cobrado en efectivo se registra en tu turno de caja." />
      </h1>

      <Aviso tipo="error" texto={error} />

      {resultado ? (
        <ResultadoCierre
          resultado={resultado}
          alTerminar={() => { setResultado(null); cargar() }}
        />
      ) : turno && cerrando ? (
        <>
          <TurnoAbierto turno={turno} />
          <CerrarTurno
            alCancelar={() => setCerrando(false)}
            alCerrar={(r) => { setCerrando(false); setTurno(null); setResultado(r) }}
          />
        </>
      ) : turno ? (
        <>
          <TurnoAbierto turno={turno} alCerrar={() => setCerrando(true)} />
          <div className="flex gap-1 overflow-x-auto border-b border-neutral-800">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPestana(p.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  pestana === p.id ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                {p.texto}
              </button>
            ))}
          </div>
          {pestana === 'Cuota' && <CobrarCuota />}
          {pestana === 'Kiosco' && <Kiosco />}
          {pestana === 'Subalquiler' && <Subalquiler />}
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
function TurnoAbierto({ turno, alCerrar }) {
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
      {alCerrar && (
        <button onClick={alCerrar} className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/50">
          Cerrar turno
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Cobrar cuota en efectivo (CU06)
// ---------------------------------------------------------------
const CAMPOS_COBRO =
  'alumno_id, dni, nombre, apellido, telefono, email, precio_plan, fecha_vencimiento, estado_alumno, estado_membresia, datos_faltantes, pase_libre'

// Mismo cálculo que _extender_membresia: +30 días al vencimiento actual.
// Si nunca pagó o está inactivo (vencido hace más de 30 días), los 30 días cuentan desde hoy.
const sumarDias = (iso, dias) => {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

function CobrarCuota({ esDueno = false }) {
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
      <h2 className="flex items-center gap-1 text-lg font-semibold">
        Cobrar cuota
        <Ayuda texto="Buscá al alumno por DNI o nombre. Cada cuota suma 30 días a su vencimiento." />
      </h2>

      <Aviso tipo="error" texto={error} />

      {ultimoCobro && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          <p className="font-medium">
            Cobro registrado: {ultimoCobro.nombre} {ultimoCobro.apellido} · {formatearPesos(ultimoCobro.monto)} · {ultimoCobro.medio}
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
                    <EtiquetaCuota estado={a.pase_libre ? 'Pase libre' : a.estado_membresia} />
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
          esDueno={esDueno}
          alumno={elegido}
          alCancelar={() => setElegido(null)}
          alCompletarFicha={refrescarElegido}
          alCobrar={alCobrar}
        />
      )}
    </section>
  )
}

function DetalleCobro({ alumno, alCancelar, alCompletarFicha, alCobrar, esDueno }) {
  const [medio, setMedio] = useState('Efectivo')
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
    const { data, error } = await supabase.rpc('registrar_pago_cuota', { p_alumno_id: alumno.alumno_id, p_medio: medio })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alCobrar({
      medio,
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

      {alumno.pase_libre ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-sky-900 bg-sky-950/40 px-3 py-2 text-sm text-sky-200">
            Tiene pase libre: no paga cuota. Si tiene que volver a pagar, el dueño le saca el pase libre desde Alumnos.
          </p>
          <div className="flex justify-end">
            <button onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
              Volver
            </button>
          </div>
        </div>
      ) : faltaFicha ? (
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

          {esDueno && (
            <div className="flex gap-2">
              {MEDIOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMedio(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    medio === m ? 'border-white bg-white font-semibold text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <Aviso tipo="error" texto={error} />

          <div className="flex justify-end gap-2">
            <button onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
              Cancelar
            </button>
            <button onClick={cobrar} disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
              {enviando ? 'Registrando…' : `Recibí ${formatearPesos(alumno.precio_plan)} ${medio === 'Efectivo' ? 'en efectivo' : 'por transferencia'}`}
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
    if (datos.fecha_nacimiento === null) return setError('Revisá la fecha de nacimiento (día/mes/año).')
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
          <CampoFecha value={datos.fecha_nacimiento} onChange={cambiar('fecha_nacimiento')} max={hoyAR()} className={campo} />
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

// ---------------------------------------------------------------
// Kiosco · venta (CU04)
// ---------------------------------------------------------------
const MEDIOS = ['Efectivo', 'Transferencia']

function Kiosco() {
  const [productos, setProductos] = useState([])
  const [carrito, setCarrito] = useState({}) // { producto_id: cantidad }
  const [medio, setMedio] = useState('Efectivo')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ultimaVenta, setUltimaVenta] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todo')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, precio, stock, vencimiento, categoria')
      .eq('activo', true)
      .order('nombre')
    if (error) setError(mensajeError(error))
    setProductos(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Celular: la barra con el total se esconde cuando el panel de la venta ya está a la vista
  const panel = useRef(null)
  const [panelVisible, setPanelVisible] = useState(false)
  useEffect(() => {
    if (!panel.current || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setPanelVisible(e.isIntersecting), { threshold: 0.2 })
    obs.observe(panel.current)
    return () => obs.disconnect()
  }, [cargando])

  const cambiarCantidad = (prod, delta) => {
    setUltimaVenta(null)
    setError('')
    setCarrito((c) => {
      const nueva = Math.min(Math.max((c[prod.id] ?? 0) + delta, 0), prod.stock)
      const resto = { ...c }
      if (nueva === 0) delete resto[prod.id]
      else resto[prod.id] = nueva
      return resto
    })
  }

  const items = productos
    .filter((p) => carrito[p.id])
    .map((p) => ({ ...p, cantidad: carrito[p.id], subtotal: p.precio * carrito[p.id] }))
  const total = items.reduce((t, i) => t + i.subtotal, 0)

  const vender = async () => {
    setError('')
    // Control previo con el stock en pantalla (la base vuelve a controlar al guardar)
    const sinStock = items.find((i) => i.cantidad > i.stock)
    if (sinStock) return setError(`No hay stock suficiente de ${sinStock.nombre}: quedan ${sinStock.stock}.`)

    setEnviando(true)
    const { error } = await supabase.rpc('registrar_venta', {
      p_items: items.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
      p_medio: medio,
    })
    setEnviando(false)
    if (error) {
      // STOCK_INSUFICIENTE trae el id: lo traducimos al nombre del producto
      const id = error.message?.match(/STOCK_INSUFICIENTE: producto ([0-9a-f-]{36})/)?.[1]
      const prod = productos.find((p) => p.id === id)
      await cargar()
      return setError(prod ? `No hay stock suficiente de ${prod.nombre}. Se actualizó el stock en pantalla.` : mensajeError(error))
    }
    setUltimaVenta({ items, total, medio })
    setCarrito({})
    await cargar()
  }

  if (cargando) return <Cargando />

  const hoy = hoyAR()
  const visibles = buscarProductos(filtrarCategoria(productos, categoria), busqueda)
  const unidades = items.reduce((t, i) => t + i.cantidad, 0)

  return (
    <section className="space-y-3 pb-20 lg:pb-0">
      <h2 className="flex items-center gap-1 text-lg font-semibold">
        Kiosco
        <Ayuda texto="Tocá un producto para sumarlo a la venta." />
      </h2>

      {ultimaVenta && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          <p className="font-medium">
            Venta registrada · {formatearPesos(ultimaVenta.total)} · {ultimaVenta.medio}
          </p>
          <p className="text-emerald-300/80">{ultimaVenta.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(' · ')}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* Productos */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-neutral-400">
            <IconoBuscar className="h-4 w-4 shrink-0 text-neutral-500" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              inputMode="search"
              autoComplete="off"
              className="w-full bg-transparent py-2.5 outline-none"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="text-sm text-neutral-500 hover:text-white" aria-label="Borrar búsqueda">✕</button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTROS_CATEGORIA.map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoria(f.id)}
                className={`rounded-full border px-3 py-1 text-sm ${categoria === f.id ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}
              >
                {f.texto}
              </button>
            ))}
          </div>

          {productos.length === 0 ? (
            <p className="text-sm text-neutral-400">No hay productos cargados.</p>
          ) : visibles.length === 0 ? (
            <p className="text-sm text-neutral-400">No hay productos con "{busqueda.trim()}".</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibles.map((p) => {
                const cant = carrito[p.id] ?? 0
                const stock = estadoStock(p.stock)
                const venc = estadoVencimiento(p.vencimiento, hoy)
                const lleno = cant >= p.stock
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => cambiarCantidad(p, 1)}
                      disabled={lleno}
                      className={`relative flex h-full w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                        cant > 0 ? 'border-white bg-neutral-900' : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
                      } ${stock === 'sin' ? 'opacity-40' : ''} disabled:cursor-not-allowed`}
                    >
                      {cant > 0 && (
                        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-neutral-950">
                          {cant}
                        </span>
                      )}
                      <span className="pr-7 text-sm font-medium leading-tight">{p.nombre}</span>
                      <span className="text-base font-semibold tabular-nums">{formatearPesos(p.precio)}</span>
                      <span className={`text-xs ${COLOR_STOCK[stock]}`} title={AYUDA_STOCK[stock]}>
                        {stock === 'sin' ? 'Sin stock' : `Stock: ${p.stock}`}
                        {venc === 'vencido' && <span className="text-red-400" title={ayudaVencimiento(p.vencimiento, hoy)}> · Vencido</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Venta actual */}
        <div ref={panel} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 lg:sticky lg:top-4">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500">Venta actual</h3>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">Todavía no agregaste productos.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{i.nombre}</p>
                    <p className="text-xs text-neutral-500 tabular-nums">{formatearPesos(i.subtotal)}</p>
                  </div>
                  <button
                    onClick={() => cambiarCantidad(i, -1)}
                    className="h-7 w-7 rounded-lg border border-neutral-700 leading-none hover:bg-neutral-800"
                    aria-label={`Quitar ${i.nombre}`}
                  >
                    −
                  </button>
                  <span className="w-5 text-center tabular-nums">{i.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(i, 1)}
                    disabled={i.cantidad >= i.stock}
                    className="h-7 w-7 rounded-lg border border-neutral-700 leading-none hover:bg-neutral-800 disabled:opacity-30"
                    aria-label={`Agregar ${i.nombre}`}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-baseline justify-between border-t border-neutral-800 pt-3">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums">{formatearPesos(total)}</span>
          </div>

          <p className="flex items-center text-xs uppercase tracking-wide text-neutral-500">Medio de pago<Ayuda texto="Si es transferencia, confirmá que llegó antes de registrar. No entra en el efectivo de tu caja." /></p>
          <div className="flex gap-2">
            {MEDIOS.map((m) => (
              <button
                key={m}
                onClick={() => setMedio(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  medio === m ? 'border-white bg-white font-semibold text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <Aviso tipo="error" texto={error} />

          <button
            onClick={vender}
            disabled={enviando || items.length === 0}
            className="w-full rounded-lg bg-white py-3 font-semibold text-neutral-950 disabled:opacity-40"
          >
            {enviando ? 'Registrando…' : items.length ? `Cobrar ${formatearPesos(total)}` : 'Cobrar'}
          </button>
          {items.length > 0 && (
            <button onClick={() => { setCarrito({}); setError('') }} className="w-full rounded-lg border border-neutral-700 py-2 text-sm hover:bg-neutral-800">
              Vaciar
            </button>
          )}
        </div>
      </div>

      {/* Celular: barra fija abajo con el total mientras se eligen productos */}
      {items.length > 0 && !panelVisible && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div>
              <p className="text-xs text-neutral-400">{unidades} producto{unidades === 1 ? '' : 's'}</p>
              <p className="text-lg font-bold tabular-nums">{formatearPesos(total)}</p>
            </div>
            <button
              onClick={() => panel.current?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-lg bg-white px-5 py-2.5 font-semibold text-neutral-950"
            >
              Ver venta
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------
// Subalquiler de salones (CU16)
// ---------------------------------------------------------------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Mes actual y los dos siguientes, en formato YYYY-MM-01
const opcionesMes = () => {
  const [a, m] = hoyAR().split('-').map(Number)
  return [-1, 0, 1, 2].map((d) => {
    const f = new Date(Date.UTC(a, m - 1 + d, 1))
    const iso = f.toISOString().slice(0, 10)
    return { iso, texto: `${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}` }
  })
}

const VACIO_ALQ = { salonId: '', modalidad: 'Por hora', horas: '1', periodo: '', locatario: '', contacto: '' }

function Subalquiler() {
  const [salones, setSalones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(VACIO_ALQ)
  const [medio, setMedio] = useState('Efectivo')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ultimo, setUltimo] = useState(null)
  const meses = useMemo(opcionesMes, [])

  useEffect(() => {
    supabase
      .from('espacios_alquiler')
      .select('id, nombre, precio_hora, precio_mensual')
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        setSalones(data ?? [])
        setCargando(false)
      })
  }, [])

  if (cargando) return <Cargando />

  const salon = salones.find((s) => s.id === datos.salonId)
  const horas = Number(String(datos.horas).replace(',', '.'))
  const horasValidas = horas > 0 && horas <= 24 && Number.isInteger(horas * 2)
  const total = !salon ? 0 : datos.modalidad === 'Por hora' ? (horasValidas ? horas * salon.precio_hora : 0) : salon.precio_mensual ?? 0

  const cambiar = (c) => (e) => {
    setUltimo(null)
    setError('')
    setDatos((d) => ({ ...d, [c]: e.target.value }))
  }

  const elegirSalon = (id) => {
    setUltimo(null)
    setError('')
    const s = salones.find((x) => x.id === id)
    // Si el salón nuevo no se alquila por mes, vuelve a "Por hora"
    setDatos((d) => ({ ...d, salonId: id, modalidad: s && !s.precio_mensual ? 'Por hora' : d.modalidad, periodo: d.periodo || meses[1].iso }))
  }

  const cobrar = async () => {
    setError('')
    if (!salon) return setError('Elegí el salón.')
    if (datos.modalidad === 'Por hora' && !horasValidas) return setError('Las horas tienen que ser entre 0,5 y 24, en medias horas (ej.: 1, 1,5, 2).')
    if (datos.modalidad === 'Mensual' && !datos.periodo) return setError('Elegí el mes que paga.')
    if (!datos.locatario.trim()) return setError('Escribí quién alquila.')

    setEnviando(true)
    // El dueño pudo cambiar el precio con la pantalla abierta: se relee antes de cobrar
    const { data: vigente } = await supabase
      .from('espacios_alquiler')
      .select('id, nombre, precio_hora, precio_mensual, activo')
      .eq('id', salon.id)
      .maybeSingle()
    if (!vigente?.activo) {
      setEnviando(false)
      return setError('Ese salón ya no está disponible. Recargá la pantalla.')
    }
    if (Number(vigente.precio_hora) !== Number(salon.precio_hora) || Number(vigente.precio_mensual ?? 0) !== Number(salon.precio_mensual ?? 0)) {
      setEnviando(false)
      setSalones((lista) => lista.map((x) => (x.id === vigente.id ? vigente : x)))
      return setError('El dueño cambió el precio de este salón. Revisá el total nuevo antes de cobrar.')
    }

    const { data, error } = await supabase.rpc('registrar_cobro_alquiler', {
      p_espacio_id: salon.id,
      p_modalidad: datos.modalidad,
      p_horas: datos.modalidad === 'Por hora' ? horas : null,
      p_periodo: datos.modalidad === 'Mensual' ? datos.periodo : null,
      p_locatario: datos.locatario.trim(),
      p_contacto: datos.contacto,
      p_medio: medio,
    })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    const mes = meses.find((m) => m.iso === datos.periodo)?.texto
    setUltimo({
      monto: data,
      medio,
      texto: `${salon.nombre} · ${datos.modalidad === 'Por hora' ? `${String(horas).replace('.', ',')} h` : `mensual ${mes}`} · ${datos.locatario.trim()}`,
    })
    setDatos({ ...VACIO_ALQ, salonId: datos.salonId, periodo: datos.periodo })
  }

  const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'
  const opcion = (activa) =>
    `flex-1 rounded-lg border px-3 py-2 text-sm ${activa ? 'border-white bg-white font-semibold text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1 text-lg font-semibold">
        Subalquiler
        <Ayuda texto="Cobro del alquiler de un salón, por hora o por mes. El precio lo define el dueño." />
      </h2>

      {ultimo && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          <p className="font-medium">Cobro registrado · {formatearPesos(ultimo.monto)} · {ultimo.medio}</p>
          <p className="text-emerald-300/80">{ultimo.texto}</p>
        </div>
      )}

      {salones.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay salones cargados. Los carga el dueño desde "Salones".</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-400">Salón</span>
            <select value={datos.salonId} onChange={(e) => elegirSalon(e.target.value)} className={campo}>
              <option value="">Elegí un salón</option>
              {salones.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>

          {salon && (
            <>
              <div className="space-y-1 text-sm">
                <span className="text-neutral-400">Modalidad</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDatos((d) => ({ ...d, modalidad: 'Por hora' }))} className={opcion(datos.modalidad === 'Por hora')}>
                    Por hora · {formatearPesos(salon.precio_hora)}
                  </button>
                  <button
                    type="button"
                    disabled={!salon.precio_mensual}
                    onClick={() => setDatos((d) => ({ ...d, modalidad: 'Mensual' }))}
                    className={`${opcion(datos.modalidad === 'Mensual')} disabled:opacity-40`}
                  >
                    {salon.precio_mensual ? `Mensual · ${formatearPesos(salon.precio_mensual)}` : 'Sin alquiler mensual'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {datos.modalidad === 'Por hora' ? (
                  <label className="space-y-1 text-sm">
                    <span className="text-neutral-400">Horas</span>
                    <input value={datos.horas} onChange={cambiar('horas')} inputMode="decimal" placeholder="1" className={campo} />
                  </label>
                ) : (
                  <label className="space-y-1 text-sm">
                    <span className="text-neutral-400">Mes que paga</span>
                    <select value={datos.periodo} onChange={cambiar('periodo')} className={campo}>
                      {meses.map((m) => (
                        <option key={m.iso} value={m.iso}>{m.texto}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="space-y-1 text-sm">
                  <span className="text-neutral-400">Quién alquila</span>
                  <input value={datos.locatario} onChange={cambiar('locatario')} placeholder="Nombre o actividad" className={campo} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-neutral-400">Celular <span className="text-neutral-500">(opcional)</span></span>
                  <input value={datos.contacto} onChange={cambiar('contacto')} inputMode="tel" placeholder="3815551234" className={campo} />
                </label>
              </div>

              <div className="flex items-baseline justify-between border-t border-neutral-800 pt-3">
                <span className="text-neutral-400">
                  Total{datos.modalidad === 'Por hora' && horasValidas ? ` (${String(horas).replace('.', ',')} h × ${formatearPesos(salon.precio_hora)})` : ''}
                </span>
                <span className="text-xl font-semibold tabular-nums">{formatearPesos(total)}</span>
              </div>

              <p className="flex items-center text-xs uppercase tracking-wide text-neutral-500">Medio de pago<Ayuda texto="Si es transferencia, confirmá que llegó antes de registrar. No entra en el efectivo de tu caja." /></p>
              <div className="flex gap-2">
                {MEDIOS.map((m) => (
                  <button key={m} type="button" onClick={() => setMedio(m)} className={opcion(medio === m)}>
                    {m}
                  </button>
                ))}
              </div>

              <Aviso tipo="error" texto={error} />

              <div className="flex justify-end">
                <button onClick={cobrar} disabled={enviando || total <= 0} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
                  {enviando ? 'Registrando…' : `Cobrar ${formatearPesos(total)}`}
                </button>
              </div>
            </>
          )}
          {!salon && <Aviso tipo="error" texto={error} />}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------
// Cierre del turno · arqueo ciego (CU05)
// ---------------------------------------------------------------
function CerrarTurno({ alCancelar, alCerrar }) {
  const [monto, setMonto] = useState('')
  const [comentario, setComentario] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const valor = Number(String(monto).replace(/\./g, '').replace(',', '.'))
  const valido = monto.trim() !== '' && !Number.isNaN(valor) && valor >= 0

  const pedirConfirmacion = (e) => {
    e.preventDefault()
    setError('')
    if (!valido) return setError('Ingresá el efectivo que contaste en la caja (0 si no hay).')
    setConfirmar(true)
  }

  const cerrar = async () => {
    setError('')
    setEnviando(true)
    const { data, error } = await supabase.rpc('cerrar_turno', { p_monto_contado: valor, p_comentario: comentario || null })
    setEnviando(false)
    if (error) {
      setConfirmar(false)
      return setError(mensajeError(error))
    }
    const r = Array.isArray(data) ? data[0] : data
    alCerrar({ ...r, comentario: comentario.trim() })
  }

  return (
    <form onSubmit={pedirConfirmacion} className="max-w-md space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">Cerrar turno de caja</h2>
        <p className="text-sm text-neutral-400">
          Contá todo el efectivo que hay en la caja, incluido el cambio con el que abriste, y anotalo.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-neutral-400">Efectivo contado</span>
        <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
          <span className="pl-3 text-neutral-500">$</span>
          <input
            value={monto}
            onChange={(e) => { setMonto(e.target.value); setConfirmar(false) }}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-transparent px-2 py-2 outline-none"
            autoFocus
          />
        </div>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-neutral-400">Comentario <span className="text-neutral-500">(opcional)</span></span>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          placeholder="Ej.: se pagó un delivery con plata de la caja"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400"
        />
      </label>

      <Aviso tipo="error" texto={error} />

      {confirmar ? (
        <div className="space-y-2 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm">
          <p className="text-amber-200">
            ¿Cerrar el turno con {formatearPesos(valor)} contados? Una vez cerrado no se puede modificar.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg border border-neutral-700 px-4 py-2 hover:bg-neutral-800">
              Volver
            </button>
            <button type="button" onClick={cerrar} disabled={enviando} className="rounded-lg bg-white px-4 py-2 font-semibold text-neutral-950 disabled:opacity-50">
              {enviando ? 'Cerrando…' : 'Sí, cerrar turno'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
            Cancelar
          </button>
          <button type="submit" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            Cerrar turno
          </button>
        </div>
      )}
    </form>
  )
}

function ResultadoCierre({ resultado, alTerminar }) {
  const diferencia = Number(resultado.diferencia)
  const [justificado, setJustificado] = useState(Boolean(resultado.comentario))
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const justificar = async (e) => {
    e.preventDefault()
    setError('')
    if (!texto.trim()) return setError('Explicá brevemente la diferencia.')
    setEnviando(true)
    const { error } = await supabase.rpc('justificar_cierre', { p_turno_id: resultado.turno_id, p_comentario: texto.trim() })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    setJustificado(true)
  }

  const estado =
    diferencia === 0
      ? { titulo: 'La caja cierra justo', clase: 'border-emerald-900 bg-emerald-950/40 text-emerald-200' }
      : diferencia > 0
        ? { titulo: `Sobran ${formatearPesos(diferencia)}`, clase: 'border-amber-900 bg-amber-950/40 text-amber-200' }
        : { titulo: `Faltan ${formatearPesos(-diferencia)}`, clase: 'border-red-900 bg-red-950/40 text-red-200' }

  return (
    <div className="max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">Turno cerrado</h2>
        <p className="text-sm text-neutral-400">El cierre quedó registrado y no se puede modificar.</p>
      </div>

      <div className={`rounded-lg border px-3 py-2 font-medium ${estado.clase}`}>{estado.titulo}</div>

      {diferencia !== 0 && !justificado && (
        <form onSubmit={justificar} className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-300">¿Por qué puede haber diferencia? El dueño recibe un aviso con tu explicación.</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400"
              autoFocus
            />
          </label>
          <Aviso tipo="error" texto={error} />
          <div className="flex justify-end">
            <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
              {enviando ? 'Guardando…' : 'Guardar justificación'}
            </button>
          </div>
        </form>
      )}

      {diferencia !== 0 && justificado && (
        <p className="text-sm text-neutral-400">Justificación registrada{resultado.comentario ? `: ${resultado.comentario}` : ''}.</p>
      )}

      {(diferencia === 0 || justificado) && (
        <div className="flex justify-end">
          <button onClick={alTerminar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
            Listo
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Cobros del dueño: sin turno ni kiosco
// ---------------------------------------------------------------
const PESTANAS_DUENO = [
  { id: 'Cuota', texto: 'Cobrar cuota' },
  { id: 'Subalquiler', texto: 'Subalquiler' },
]

function CobrosDueno() {
  const [pestana, setPestana] = useState('Cuota')
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-1 text-xl font-semibold">
        Cobros
        <Ayuda texto="Para anotar lo que te pagan directo a vos." />
      </h1>
      <div className="rounded-xl border border-sky-900 bg-sky-950/40 px-4 py-3 text-sm text-sky-200">
        Lo que cobres acá queda registrado a tu nombre, fuera de la caja de los recepcionistas: no cambia el cierre de ningún turno.
        La caja y el kiosco los manejan los recepcionistas.
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-800">
        {PESTANAS_DUENO.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              pestana === p.id ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {pestana === 'Cuota' && <CobrarCuota esDueno />}
      {pestana === 'Subalquiler' && <Subalquiler />}
    </div>
  )
}
