import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, formatearPesos, hoyAR, mensajeError } from '../../lib/utils'
import { AYUDA_STOCK, ayudaVencimiento, buscarProductos, COLOR_STOCK, COLOR_VENCIMIENTO, estadoStock, estadoVencimiento } from '../../lib/kiosco'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import CampoFecha from '../../components/CampoFecha'
import { IconoBasurero, IconoBuscar, IconoLapiz } from '../../components/Iconos'

// Productos del kiosco (CU14 · A3). SOLO SuperAdmin (decisión del dueño, 11/11/2026).
//   · Buscador por nombre y filtros: a la venta · stock bajo (≤ 10) · dados de baja.
//   · Stock con − / + y una casilla para escribir el número: se guarda solo con
//     ajustar_stock (suma o resta la diferencia, no pisa una venta simultánea).
//   · Lápiz: editar nombre, precio y vencimiento (opcional).
//   · Basurero: baja lógica (activo = false). No se borra porque tiene ventas; se reactiva.
// La política productos_write de la base ya impide que otro rol escriba.

const aNumero = (txt) => Number(String(txt).replace(/\./g, '').replace(',', '.'))
const esEntero = (n) => Number.isInteger(n)

// "Duplicate key" de Postgres (nombre repetido)
const errorProducto = (error) =>
  error?.code === '23505' ? 'Ya existe un producto con ese nombre.' : mensajeError(error)

const FILTROS = [
  { id: 'venta', texto: 'A la venta' },
  { id: 'bajo', texto: 'Stock bajo' },
  { id: 'bajas', texto: 'Dados de baja' },
]

// Columnas en compu: producto · precio · stock · vence · acciones
const COLUMNAS = 'md:grid-cols-[minmax(0,1fr)_100px_150px_110px_84px]'

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState(null) // id
  const [filtro, setFiltro] = useState('venta')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('productos').select('id, nombre, precio, stock, vencimiento, activo').order('nombre')
    setError(error ? mensajeError(error) : '')
    setProductos(data ?? [])
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

  const cambiarActivo = async (p) => {
    setError('')
    const { error } = await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id)
    if (error) return setError(errorProducto(error))
    await terminar(p.activo ? `${p.nombre} se dio de baja: ya no aparece en el kiosco. Lo encontrás en "Dados de baja".` : `${p.nombre} volvió a estar a la venta.`)
  }

  // El − / + actualiza solo esa fila, sin recargar toda la lista
  const actualizarStock = (id, stock) => setProductos((ps) => ps.map((p) => (p.id === id ? { ...p, stock } : p)))

  if (cargando) return <Cargando />

  const hoy = hoyAR()
  const activos = productos.filter((p) => p.activo)
  const cantidad = {
    venta: activos.length,
    bajo: activos.filter((p) => estadoStock(p.stock) !== 'ok').length,
    bajas: productos.length - activos.length,
  }
  const delFiltro =
    filtro === 'bajas' ? productos.filter((p) => !p.activo)
    : filtro === 'bajo' ? activos.filter((p) => estadoStock(p.stock) !== 'ok')
    : activos
  const visibles = buscarProductos(delFiltro, busqueda)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Productos del kiosco</h1>
        {!mostrarAlta && (
          <button
            onClick={() => { setMostrarAlta(true); setEditando(null); setAviso('') }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950"
          >
            + Nuevo producto
          </button>
        )}
      </div>

      {mostrarAlta && <FormProducto alCancelar={() => setMostrarAlta(false)} alGuardar={terminar} />}

      <Aviso tipo="ok" texto={aviso} />
      <Aviso tipo="error" texto={error} />

      <div className="space-y-3">
        <Buscador valor={busqueda} alCambiar={setBusqueda} />
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
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {busqueda.trim() ? `No hay productos con "${busqueda.trim()}".`
            : filtro === 'bajas' ? 'No hay productos dados de baja.'
            : filtro === 'bajo' ? 'Ningún producto tiene stock bajo.'
            : 'No hay productos cargados.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <div className={`hidden gap-3 bg-neutral-900 px-4 py-2 text-xs uppercase tracking-wide text-neutral-500 md:grid ${COLUMNAS}`}>
            <span>Producto</span>
            <span className="text-right">Precio</span>
            <span className="text-center">Stock</span>
            <span>Vence</span>
            <span />
          </div>
          <ul className="divide-y divide-neutral-800">
            {visibles.map((p) => (
              <FilaProducto
                key={p.id}
                producto={p}
                hoy={hoy}
                editando={editando === p.id}
                alEditar={() => { setEditando(editando === p.id ? null : p.id); setMostrarAlta(false); setAviso('') }}
                alCancelarEdicion={() => setEditando(null)}
                alGuardar={terminar}
                alCambiarActivo={() => cambiarActivo(p)}
                alCambiarStock={(stock) => actualizarStock(p.id, stock)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Buscador({ valor, alCambiar }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-neutral-400">
      <IconoBuscar className="h-4 w-4 shrink-0 text-neutral-500" />
      <input
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder="Buscar producto por nombre…"
        inputMode="search"
        autoComplete="off"
        className="w-full bg-transparent py-2 outline-none"
      />
      {valor && (
        <button onClick={() => alCambiar('')} className="text-sm text-neutral-500 hover:text-white" aria-label="Borrar búsqueda">✕</button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Una fila: en el celu es una tarjeta (nombre + íconos arriba, stock y vence abajo);
// en la compu son columnas.
// ---------------------------------------------------------------
function FilaProducto({ producto: p, hoy, editando, alEditar, alCancelarEdicion, alGuardar, alCambiarActivo, alCambiarStock }) {
  const venc = estadoVencimiento(p.vencimiento, hoy)
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 ${COLUMNAS}`}>
      <div className="order-1 min-w-0">
        <p className={`font-medium md:truncate ${p.activo ? '' : 'text-neutral-400'}`}>{p.nombre}</p>
        <p className="text-sm text-neutral-400 md:hidden">{formatearPesos(p.precio)}</p>
      </div>

      <p className="hidden text-right tabular-nums md:order-2 md:block">{formatearPesos(p.precio)}</p>

      <div className="order-3 md:order-3 md:justify-self-center">
        {p.activo ? (
          <ControlStock producto={p} alCambiar={alCambiarStock} />
        ) : (
          <span className="text-sm text-neutral-500">Stock: {p.stock}</span>
        )}
      </div>

      <p
        title={ayudaVencimiento(p.vencimiento, hoy)}
        className={`order-4 justify-self-end text-sm md:order-4 md:justify-self-start ${p.vencimiento ? '' : 'hidden md:block'} ${venc ? COLOR_VENCIMIENTO[venc] : 'text-neutral-600'} ${venc === 'vencido' || venc === 'por_vencer' ? 'cursor-help' : ''}`}
      >
        {p.vencimiento && <span className="text-neutral-500 md:hidden">Vence </span>}
        {p.vencimiento ? formatearFecha(p.vencimiento) : '—'}
      </p>

      <div className="order-2 flex justify-end gap-1 md:order-5">
        {p.activo ? (
          <>
            <BotonIcono onClick={alEditar} etiqueta={`Editar ${p.nombre}`} className="text-white hover:bg-neutral-800">
              <IconoLapiz className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono onClick={alCambiarActivo} etiqueta={`Dar de baja ${p.nombre}`} className="text-red-400 hover:bg-red-950">
              <IconoBasurero className="h-4 w-4" />
            </BotonIcono>
          </>
        ) : (
          <button onClick={alCambiarActivo} className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950">
            Reactivar
          </button>
        )}
      </div>

      {editando && (
        <div className="order-last col-span-full">
          <FormProducto producto={p} alCancelar={alCancelarEdicion} alGuardar={alGuardar} />
        </div>
      )}
    </li>
  )
}

function BotonIcono({ onClick, etiqueta, className = '', children }) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 ${className}`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------
// Stock: − [casilla] +
// Se guarda solo un momento después del último toque (o al salir de la casilla).
// Se manda la diferencia (ajustar_stock), así no pisa una venta que entre a la vez.
// ---------------------------------------------------------------
const ESPERA_GUARDADO = 700

function ControlStock({ producto, alCambiar }) {
  const [valor, setValor] = useState(String(producto.stock))
  const [estado, setEstado] = useState('') // '' · 'guardando' · 'ok' · mensaje de error
  const base = useRef(producto.stock) // último stock confirmado por la base
  const reloj = useRef(null)

  // Si la lista se recarga con otro stock (y no estoy escribiendo), lo tomo
  useEffect(() => {
    if (!reloj.current && producto.stock !== base.current) {
      base.current = producto.stock
      setValor(String(producto.stock))
    }
  }, [producto.stock])

  useEffect(() => () => clearTimeout(reloj.current), [])

  const guardar = async (texto) => {
    clearTimeout(reloj.current)
    reloj.current = null
    if (texto === '') return setValor(String(base.current)) // casilla vacía: vuelve al anterior
    const nuevo = Number(texto)
    const delta = nuevo - base.current
    if (delta === 0) return
    setEstado('guardando')
    const { data, error } = await supabase.rpc('ajustar_stock', { p_producto_id: producto.id, p_delta: delta })
    if (error) {
      setEstado(mensajeError(error))
      setValor(String(base.current))
      return
    }
    base.current = data
    setValor(String(data))
    alCambiar(data)
    setEstado('ok')
    setTimeout(() => setEstado((e) => (e === 'ok' ? '' : e)), 1500)
  }

  const programar = (texto) => {
    setValor(texto)
    setEstado('')
    clearTimeout(reloj.current)
    reloj.current = setTimeout(() => guardar(texto), ESPERA_GUARDADO)
  }

  const sumar = (n) => programar(String(Math.max(0, (Number(valor) || 0) + n)))
  const numero = Number(valor) || 0
  const nivel = estadoStock(numero)
  const color = nivel === 'ok' ? 'text-white' : COLOR_STOCK[nivel]

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => sumar(-1)}
          disabled={numero <= 0}
          aria-label={`Restar 1 a ${producto.nombre}`}
          className="h-9 w-9 rounded-lg border border-neutral-700 text-lg leading-none hover:bg-neutral-800 disabled:opacity-30"
        >
          −
        </button>
        <input
          value={valor}
          onChange={(e) => programar(e.target.value.replace(/\D/g, '').slice(0, 5))}
          onBlur={() => reloj.current && guardar(valor)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          aria-label={`Stock de ${producto.nombre}`}
          title={AYUDA_STOCK[nivel]}
          className={`h-9 w-14 rounded-lg border border-neutral-700 bg-neutral-950 text-center font-semibold tabular-nums outline-none focus:border-neutral-400 ${color}`}
        />
        <button
          onClick={() => sumar(1)}
          aria-label={`Sumar 1 a ${producto.nombre}`}
          className="h-9 w-9 rounded-lg border border-neutral-700 text-lg leading-none hover:bg-neutral-800"
        >
          +
        </button>
        <span className="w-4 text-center text-xs">
          {estado === 'guardando' ? <span className="text-neutral-500">…</span> : estado === 'ok' ? <span className="text-emerald-400">✓</span> : ''}
        </span>
      </div>
      {estado && estado !== 'guardando' && estado !== 'ok' && <p className="text-xs text-red-400">{estado}</p>}
    </div>
  )
}

const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

// ---------------------------------------------------------------
// Alta y edición (el stock se cambia con − / +; acá solo el inicial)
// ---------------------------------------------------------------
function FormProducto({ producto, alCancelar, alGuardar }) {
  const esNuevo = !producto
  const [datos, setDatos] = useState({
    nombre: producto?.nombre ?? '',
    precio: producto ? String(producto.precio) : '',
    stock: '',
    vencimiento: producto?.vencimiento ?? '',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiar = (c) => (e) => setDatos((d) => ({ ...d, [c]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const nombre = datos.nombre.trim()
    const precio = aNumero(datos.precio)
    const stock = aNumero(datos.stock === '' ? '0' : datos.stock)
    if (!nombre) return setError('Ingresá el nombre del producto.')
    if (!(precio > 0)) return setError('El precio tiene que ser mayor a 0.')
    if (esNuevo && (!esEntero(stock) || stock < 0)) return setError('El stock tiene que ser un número entero, 0 o más.')
    if (datos.vencimiento === null) return setError('Revisá la fecha de vencimiento (día/mes/año) o dejala vacía.')

    setEnviando(true)
    const fila = { nombre, precio, vencimiento: datos.vencimiento || null, ...(esNuevo ? { stock } : {}) }
    const { error } = esNuevo
      ? await supabase.from('productos').insert(fila)
      : await supabase.from('productos').update(fila).eq('id', producto.id)
    setEnviando(false)
    if (error) return setError(errorProducto(error))
    alGuardar(esNuevo ? `${nombre} quedó a la venta en el kiosco.` : `Cambios guardados en ${nombre}.`)
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="font-semibold">{esNuevo ? 'Nuevo producto' : 'Editar producto'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Nombre</span>
          <input value={datos.nombre} onChange={cambiar('nombre')} placeholder="Ej.: Agua 500 ml" className={campo} autoFocus />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Precio</span>
          <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400">
            <span className="pl-3 text-neutral-500">$</span>
            <input value={datos.precio} onChange={cambiar('precio')} inputMode="numeric" className="w-full bg-transparent px-2 py-2 outline-none" />
          </div>
        </label>
        {esNuevo && (
          <label className="space-y-1 text-sm">
            <span className="text-neutral-400">Stock inicial</span>
            <input value={datos.stock} onChange={cambiar('stock')} inputMode="numeric" placeholder="0" className={campo} />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Vencimiento <span className="text-neutral-600">(opcional)</span></span>
          <CampoFecha value={datos.vencimiento} onChange={cambiar('vencimiento')} className={campo} />
        </label>
      </div>
      {!esNuevo && (
        <p className="text-xs text-neutral-500">
          Un cambio de precio vale para las ventas siguientes; las anteriores conservan su precio. El stock se cambia con − / + en la lista.
        </p>
      )}
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
