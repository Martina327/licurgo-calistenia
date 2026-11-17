import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearPesos, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import Ayuda from '../../components/Ayuda'
import { IconoBasurero, IconoLapiz } from '../../components/Iconos'

// Planes de cuota (SOLO SuperAdmin): el dueño arma las cuotas que ofrece,
// por ejemplo "Turno mañana" con descuento. Mismo esquema que Productos:
//   · Alta y edición: nombre, precio, días por semana (opcional) y una descripción corta.
//   · Basurero: baja lógica (activo = false). No se borra porque hay alumnos y pagos con ese plan.
//   · El alumno elige entre los planes activos al pagar por transferencia;
//     recepción elige el plan al cobrar en el mostrador.
// La política planes_write de la base ya impide que otro rol escriba.

const aNumero = (txt) => Number(String(txt).replace(/\./g, '').replace(',', '.'))

const errorPlan = (error) =>
  error?.code === '23505' ? 'Ya existe un plan con ese nombre.' : mensajeError(error)

const FILTROS = [
  { id: 'activos', texto: 'A la venta' },
  { id: 'bajas', texto: 'Dados de baja' },
]

export default function Planes() {
  const [planes, setPlanes] = useState([])
  const [alumnosPorPlan, setAlumnosPorPlan] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState(null) // id
  const [filtro, setFiltro] = useState('activos')

  const cargar = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('planes').select('id, nombre, precio, dias_por_semana, descripcion, activo').order('precio', { ascending: false }),
      supabase.from('v_membresias').select('plan_id, estado_alumno'),
    ])
    setError(p.error ? mensajeError(p.error) : '')
    setPlanes(p.data ?? [])
    const cuenta = {}
    for (const a of m.data ?? []) if (a.plan_id && a.estado_alumno === 'Activo') cuenta[a.plan_id] = (cuenta[a.plan_id] ?? 0) + 1
    setAlumnosPorPlan(cuenta)
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const terminar = async (texto) => {
    setMostrarAlta(false)
    setEditando(null)
    setAviso(texto)
    await cargar()
  }

  const activos = planes.filter((p) => p.activo)

  const cambiarActivo = async (p) => {
    setError('')
    setAviso('')
    if (p.activo && activos.length === 1) return setError('Tiene que quedar al menos un plan a la venta.')
    const { error } = await supabase.from('planes').update({ activo: !p.activo }).eq('id', p.id)
    if (error) return setError(errorPlan(error))
    const n = alumnosPorPlan[p.id] ?? 0
    await terminar(p.activo
      ? `${p.nombre} se dio de baja: ya no se puede elegir.${n ? ` Los ${n} alumnos que lo tenían eligen otro plan en su próximo pago.` : ''}`
      : `${p.nombre} volvió a estar a la venta.`)
  }

  if (cargando) return <Cargando />

  const visibles = filtro === 'bajas' ? planes.filter((p) => !p.activo) : activos
  const cantidad = { activos: activos.length, bajas: planes.length - activos.length }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1 text-xl font-semibold">
          Planes de cuota
          <Ayuda texto="Las cuotas que ofrecés. El alumno elige una al pagar por transferencia y recepción la elige al cobrar en el mostrador. Cambiar un precio vale para los pagos siguientes." />
        </h1>
        {!mostrarAlta && (
          <button
            onClick={() => { setMostrarAlta(true); setEditando(null); setAviso('') }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950"
          >
            + Nuevo plan
          </button>
        )}
      </div>

      {mostrarAlta && <FormPlan alCancelar={() => setMostrarAlta(false)} alGuardar={terminar} />}

      <Aviso tipo="ok" texto={aviso} />
      <Aviso tipo="error" texto={error} />

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-3 py-1 text-sm ${filtro === f.id ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
          >
            {f.texto} <span className="opacity-60">({cantidad[f.id]})</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">{filtro === 'bajas' ? 'No hay planes dados de baja.' : 'No hay planes a la venta.'}</p>
      ) : (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
          {visibles.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${p.activo ? '' : 'text-neutral-400'}`}>{p.nombre}</p>
                  <p className="text-sm text-neutral-400">
                    {[p.dias_por_semana && `${p.dias_por_semana} días por semana`, p.descripcion].filter(Boolean).join(' · ') || 'Sin descripción'}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {alumnosPorPlan[p.id] ? `${alumnosPorPlan[p.id]} alumno${alumnosPorPlan[p.id] === 1 ? '' : 's'} activo${alumnosPorPlan[p.id] === 1 ? '' : 's'} en este plan` : 'Ningún alumno activo en este plan'}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-semibold tabular-nums">{formatearPesos(p.precio)}</p>
                <div className="flex shrink-0 gap-1">
                  {p.activo ? (
                    <>
                      <BotonIcono onClick={() => { setEditando(editando === p.id ? null : p.id); setMostrarAlta(false); setAviso('') }}
                        etiqueta={`Editar ${p.nombre}`} className="text-white hover:bg-neutral-800">
                        <IconoLapiz className="h-4 w-4" />
                      </BotonIcono>
                      <BotonIcono onClick={() => cambiarActivo(p)} etiqueta={`Dar de baja ${p.nombre}`} className="text-red-400 hover:bg-red-950">
                        <IconoBasurero className="h-4 w-4" />
                      </BotonIcono>
                    </>
                  ) : (
                    <button onClick={() => cambiarActivo(p)} className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950">
                      Reactivar
                    </button>
                  )}
                </div>
              </div>
              {editando === p.id && (
                <div className="mt-3">
                  <FormPlan plan={p} alCancelar={() => setEditando(null)} alGuardar={terminar} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BotonIcono({ onClick, etiqueta, className = '', children }) {
  return (
    <button onClick={onClick} aria-label={etiqueta} title={etiqueta}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 ${className}`}>
      {children}
    </button>
  )
}

const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

function FormPlan({ plan, alCancelar, alGuardar }) {
  const esNuevo = !plan
  const [datos, setDatos] = useState({
    nombre: plan?.nombre ?? '',
    precio: plan ? String(Number(plan.precio)) : '',
    dias: plan?.dias_por_semana ? String(plan.dias_por_semana) : '',
    descripcion: plan?.descripcion ?? '',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiar = (c) => (e) => setDatos((d) => ({ ...d, [c]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const nombre = datos.nombre.trim()
    const precio = aNumero(datos.precio)
    const dias = datos.dias === '' ? null : Number(datos.dias)
    if (!nombre) return setError('Ingresá el nombre del plan.')
    if (!(precio > 0)) return setError('El precio tiene que ser mayor a 0.')
    if (dias !== null && !(Number.isInteger(dias) && dias >= 1 && dias <= 7)) return setError('Los días por semana van de 1 a 7 (o dejalo vacío si es libre).')

    setEnviando(true)
    const fila = { nombre, precio, dias_por_semana: dias, descripcion: datos.descripcion.trim() || null }
    const { error } = esNuevo
      ? await supabase.from('planes').insert(fila)
      : await supabase.from('planes').update(fila).eq('id', plan.id)
    setEnviando(false)
    if (error) return setError(errorPlan(error))
    alGuardar(esNuevo ? `${nombre} quedó a la venta: los alumnos ya lo pueden elegir.` : `Cambios guardados en ${nombre}.`)
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="font-semibold">{esNuevo ? 'Nuevo plan' : 'Editar plan'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Nombre</span>
          <input value={datos.nombre} onChange={cambiar('nombre')} placeholder="Ej.: Turno mañana" className={campo} autoFocus />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Precio por mes</span>
          <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
            <span className="pl-3 text-neutral-500">$</span>
            <input value={datos.precio} onChange={cambiar('precio')} inputMode="numeric" placeholder="45000" className="w-full bg-transparent px-2 py-2 outline-none" />
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Días por semana <span className="text-neutral-600">(opcional)</span></span>
          <input value={datos.dias} onChange={(e) => setDatos((d) => ({ ...d, dias: e.target.value.replace(/\D/g, '').slice(0, 1) }))}
            inputMode="numeric" placeholder="Libre" className={campo} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Descripción <span className="text-neutral-600">(la ve el alumno al elegir)</span></span>
          <input value={datos.descripcion} onChange={cambiar('descripcion')} maxLength={80}
            placeholder="Ej.: Lunes a viernes antes de las 12" className={campo} />
        </label>
      </div>
      <Aviso tipo="error" texto={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {enviando ? 'Guardando…' : esNuevo ? 'Agregar' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
