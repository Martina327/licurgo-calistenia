import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearPesos, mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Productos del kiosco (CU14 · A3). SOLO SuperAdmin (decisión del dueño, 11/11/2026).
//   · Alta con nombre, precio y stock inicial.
//   · Ingreso de mercadería: suma stock en una sola operación (cargar_stock).
//   · Edición de nombre, precio y corrección de stock (recuento de inventario).
//   · Baja lógica (activo = false): deja de aparecer en el kiosco; no se borra
//     porque tiene ventas asociadas. Se puede reactivar.
// La política productos_write de la base ya impide que otro rol escriba.

const STOCK_BAJO = 5

const aNumero = (txt) => Number(String(txt).replace(/\./g, '').replace(',', '.'))
const esEntero = (n) => Number.isInteger(n)

// "Duplicate key" de Postgres (nombre repetido)
const errorProducto = (error) =>
  error?.code === '23505' ? 'Ya existe un producto con ese nombre.' : mensajeError(error)

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState(null)   // id
  const [cargandoStock, setCargandoStock] = useState(null) // id
  const [verBajas, setVerBajas] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('productos').select('id, nombre, precio, stock, activo').order('nombre')
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
    setCargandoStock(null)
    setAviso(texto)
    await cargar()
  }

  const cambiarActivo = async (p) => {
    setError('')
    const { error } = await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id)
    if (error) return setError(errorProducto(error))
    await terminar(p.activo ? `${p.nombre} se dio de baja: ya no aparece en el kiosco.` : `${p.nombre} volvió a estar a la venta.`)
  }

  if (cargando) return <Cargando />

  const visibles = productos.filter((p) => p.activo !== verBajas)
  const cantBajas = productos.filter((p) => !p.activo).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Productos del kiosco</h1>
          <p className="text-sm text-neutral-400">Precios y stock. Recepción solo los ve y los vende.</p>
        </div>
        {!mostrarAlta && (
          <button
            onClick={() => { setMostrarAlta(true); setEditando(null); setCargandoStock(null); setAviso('') }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950"
          >
            + Producto
          </button>
        )}
      </div>

      {mostrarAlta && <FormProducto alCancelar={() => setMostrarAlta(false)} alGuardar={terminar} />}

      <Aviso tipo="ok" texto={aviso} />
      <Aviso tipo="error" texto={error} />

      <div className="flex gap-2">
        <button
          onClick={() => setVerBajas(false)}
          className={`rounded-full border px-3 py-1 text-sm ${!verBajas ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
        >
          A la venta <span className="opacity-60">({productos.length - cantBajas})</span>
        </button>
        <button
          onClick={() => setVerBajas(true)}
          className={`rounded-full border px-3 py-1 text-sm ${verBajas ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
        >
          Dados de baja <span className="opacity-60">({cantBajas})</span>
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">{verBajas ? 'No hay productos dados de baja.' : 'No hay productos cargados.'}</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {visibles.map((p) => (
            <li key={p.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={`font-medium ${p.activo ? '' : 'text-neutral-400'}`}>{p.nombre}</p>
                  <p className="text-sm text-neutral-400">
                    {formatearPesos(p.precio)} ·{' '}
                    {p.stock === 0 ? (
                      <span className="text-red-400">Sin stock</span>
                    ) : p.stock <= STOCK_BAJO ? (
                      <span className="text-amber-400">Stock bajo: {p.stock}</span>
                    ) : (
                      `Stock: ${p.stock}`
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {p.activo && (
                    <>
                      <button onClick={() => { setCargandoStock(p.id); setEditando(null); setAviso('') }} className="text-emerald-400 hover:underline">
                        + Ingreso de mercadería
                      </button>
                      <button onClick={() => { setEditando(p.id); setCargandoStock(null); setAviso('') }} className="text-neutral-300 hover:underline">
                        Editar
                      </button>
                    </>
                  )}
                  <button onClick={() => cambiarActivo(p)} className={p.activo ? 'text-red-400 hover:underline' : 'text-emerald-400 hover:underline'}>
                    {p.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </div>
              </div>

              {cargandoStock === p.id && <IngresoMercaderia producto={p} alCancelar={() => setCargandoStock(null)} alGuardar={terminar} />}
              {editando === p.id && <FormProducto producto={p} alCancelar={() => setEditando(null)} alGuardar={terminar} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

// ---------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------
function FormProducto({ producto, alCancelar, alGuardar }) {
  const esNuevo = !producto
  const [datos, setDatos] = useState({
    nombre: producto?.nombre ?? '',
    precio: producto ? String(producto.precio) : '',
    stock: producto ? String(producto.stock) : '',
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
    if (!esEntero(stock) || stock < 0) return setError('El stock tiene que ser un número entero, 0 o más.')

    setEnviando(true)
    const fila = { nombre, precio, stock }
    const { error } = esNuevo
      ? await supabase.from('productos').insert(fila)
      : await supabase.from('productos').update(fila).eq('id', producto.id)
    setEnviando(false)
    if (error) return setError(errorProducto(error))
    alGuardar(esNuevo ? `${nombre} quedó a la venta en el kiosco.` : `${nombre} actualizado.`)
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="font-semibold">{esNuevo ? 'Nuevo producto' : 'Editar producto'}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm sm:col-span-3">
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
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">{esNuevo ? 'Stock inicial' : 'Stock (corrección)'}</span>
          <input value={datos.stock} onChange={cambiar('stock')} inputMode="numeric" placeholder="0" className={campo} />
        </label>
      </div>
      {!esNuevo && (
        <p className="text-xs text-neutral-500">
          Cambiá el stock solo para corregir un recuento. Para sumar mercadería que llegó usá "+ Ingreso de mercadería".
          Un cambio de precio vale para las ventas siguientes; las anteriores conservan su precio.
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

// ---------------------------------------------------------------
// Ingreso de mercadería (suma stock)
// ---------------------------------------------------------------
function IngresoMercaderia({ producto, alCancelar, alGuardar }) {
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const n = aNumero(cantidad)
    if (!esEntero(n) || n <= 0) return setError('Ingresá cuántas unidades llegaron (número entero mayor a 0).')
    setEnviando(true)
    const { data, error } = await supabase.rpc('cargar_stock', { p_producto_id: producto.id, p_cantidad: n })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    alGuardar(`Se sumaron ${n} unidades de ${producto.nombre}. Stock actual: ${data}.`)
  }

  return (
    <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 rounded-xl border border-emerald-900 bg-emerald-950/30 p-3">
      <label className="space-y-1 text-sm">
        <span className="text-neutral-300">Unidades que llegaron</span>
        <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" className={`${campo} w-40`} autoFocus />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {enviando ? 'Sumando…' : 'Sumar al stock'}
        </button>
      </div>
      <div className="basis-full"><Aviso tipo="error" texto={error} /></div>
    </form>
  )
}
