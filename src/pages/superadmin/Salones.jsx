import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearPesos, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Salones en alquiler (CU16 · A4). SOLO SuperAdmin.
//   · Alta con nombre, precio por hora y precio mensual (opcional).
//   · Edición de precios: aumentos y promos se manejan cambiando el precio.
//     Cada cobro guarda el monto al que se cobró, así que no cambia lo anterior.
//   · Baja lógica (activo = false): deja de aparecer al cobrar. Se puede reactivar.
// La política espacios_write de la base ya impide que otro rol escriba.

const aNumero = (txt) => Number(String(txt).replace(/\./g, '').replace(',', '.'))

const errorSalon = (error) =>
  error?.code === '23505' ? 'Ya existe un salón con ese nombre.' : mensajeError(error)

export default function Salones() {
  const [salones, setSalones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState(null)
  const [verBajas, setVerBajas] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('espacios_alquiler')
      .select('id, nombre, precio_hora, precio_mensual, activo')
      .order('nombre')
    setError(error ? mensajeError(error) : '')
    setSalones(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const terminar = async (texto) => {
    setMostrarAlta(false)
    setEditando(null)
    setAviso(texto)
    await cargar()
  }

  const cambiarActivo = async (s) => {
    setError('')
    const { error } = await supabase.from('espacios_alquiler').update({ activo: !s.activo }).eq('id', s.id)
    if (error) return setError(errorSalon(error))
    await terminar(s.activo ? `${s.nombre} se dio de baja: ya no aparece al cobrar.` : `${s.nombre} volvió a estar disponible.`)
  }

  if (cargando) return <Cargando />

  const visibles = salones.filter((s) => s.activo !== verBajas)
  const cantBajas = salones.filter((s) => !s.activo).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Salones</h1>
          <p className="text-sm text-neutral-400">Precios de alquiler por hora y por mes. Para una promo, cambiá el precio y volvelo a su valor cuando termine.</p>
        </div>
        {!mostrarAlta && (
          <button
            onClick={() => { setMostrarAlta(true); setEditando(null); setAviso('') }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950"
          >
            + Salón
          </button>
        )}
      </div>

      {mostrarAlta && <FormSalon alCancelar={() => setMostrarAlta(false)} alGuardar={terminar} />}

      <Aviso tipo="ok" texto={aviso} />
      <Aviso tipo="error" texto={error} />

      <div className="flex gap-2">
        <button
          onClick={() => setVerBajas(false)}
          className={`rounded-full border px-3 py-1 text-sm ${!verBajas ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
        >
          Disponibles <span className="opacity-60">({salones.length - cantBajas})</span>
        </button>
        <button
          onClick={() => setVerBajas(true)}
          className={`rounded-full border px-3 py-1 text-sm ${verBajas ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
        >
          Dados de baja <span className="opacity-60">({cantBajas})</span>
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">{verBajas ? 'No hay salones dados de baja.' : 'No hay salones cargados.'}</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {visibles.map((s) => (
            <li key={s.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={`font-medium ${s.activo ? '' : 'text-neutral-400'}`}>{s.nombre}</p>
                  <p className="text-sm text-neutral-400">
                    {formatearPesos(s.precio_hora)} por hora ·{' '}
                    {s.precio_mensual ? `${formatearPesos(s.precio_mensual)} por mes` : 'Sin alquiler mensual'}
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  {s.activo && (
                    <button onClick={() => { setEditando(s.id); setMostrarAlta(false); setAviso('') }} className="text-neutral-300 hover:underline">
                      Editar
                    </button>
                  )}
                  <button onClick={() => cambiarActivo(s)} className={s.activo ? 'text-red-400 hover:underline' : 'text-emerald-400 hover:underline'}>
                    {s.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </div>
              </div>
              {editando === s.id && <FormSalon salon={s} alCancelar={() => setEditando(null)} alGuardar={terminar} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormSalon({ salon, alCancelar, alGuardar }) {
  const esNuevo = !salon
  const [datos, setDatos] = useState({
    nombre: salon?.nombre ?? '',
    precio_hora: salon ? String(salon.precio_hora) : '15000',
    precio_mensual: salon?.precio_mensual ? String(salon.precio_mensual) : '',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiar = (c) => (e) => setDatos((d) => ({ ...d, [c]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const nombre = datos.nombre.trim()
    const precioHora = aNumero(datos.precio_hora)
    const precioMensual = datos.precio_mensual.trim() === '' ? null : aNumero(datos.precio_mensual)
    if (!nombre) return setError('Ingresá el nombre del salón.')
    if (!(precioHora > 0)) return setError('El precio por hora tiene que ser mayor a 0.')
    if (precioMensual !== null && !(precioMensual > 0)) return setError('El precio mensual tiene que ser mayor a 0, o dejalo vacío si no se alquila por mes.')

    setEnviando(true)
    const fila = { nombre, precio_hora: precioHora, precio_mensual: precioMensual }
    const { error } = esNuevo
      ? await supabase.from('espacios_alquiler').insert(fila)
      : await supabase.from('espacios_alquiler').update(fila).eq('id', salon.id)
    setEnviando(false)
    if (error) return setError(errorSalon(error))
    alGuardar(esNuevo ? `${nombre} quedó disponible para alquilar.` : `Cambios guardados en ${nombre}.`)
  }

  const precio = (campo) => (
    <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
      <span className="pl-3 text-neutral-500">$</span>
      <input value={datos[campo]} onChange={cambiar(campo)} inputMode="numeric" className="w-full bg-transparent px-2 py-2 outline-none" />
    </div>
  )

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="font-semibold">{esNuevo ? 'Nuevo salón' : 'Editar salón'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Nombre</span>
          <input
            value={datos.nombre}
            onChange={cambiar('nombre')}
            placeholder="Ej.: Salón funcional"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400"
            autoFocus
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Precio por hora</span>
          {precio('precio_hora')}
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Precio mensual <span className="text-neutral-500">(vacío si no se alquila por mes)</span></span>
          {precio('precio_mensual')}
        </label>
      </div>
      {!esNuevo && <p className="text-xs text-neutral-500">El precio nuevo vale para los cobros siguientes; los anteriores conservan su monto.</p>}
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
