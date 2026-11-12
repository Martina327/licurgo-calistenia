import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, mensajeError } from '../../lib/utils'
import { esAliasValido, esCbuValido, esCuitValido, soloNumeros } from '../../lib/comprobantes'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import DatosTransferencia from '../../components/comprobantes/DatosTransferencia'

const VACIO = { titular: '', banco: '', cbu: '', alias: '', cuit: '' }

// Datos de la cuenta donde los alumnos transfieren la cuota (B4).
// Solo el SuperAdmin los cambia (RLS de datos_cobro); los alumnos los ven en "Mi membresía".
export default function DatosCobro() {
  const [datos, setDatos] = useState(VACIO)
  const [guardados, setGuardados] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    const { data, error } = await supabase.from('datos_cobro')
      .select('titular, banco, cbu, alias, cuit, updated_at').maybeSingle()
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setGuardados(data)
    setDatos(Object.fromEntries(Object.keys(VACIO).map((k) => [k, data?.[k] ?? ''])))
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const campo = (k, limpiar = (v) => v) => (ev) => setDatos({ ...datos, [k]: limpiar(ev.target.value) })

  const guardar = async (ev) => {
    ev.preventDefault()
    setAviso(null)
    const fila = {
      titular: datos.titular.trim() || null,
      banco: datos.banco.trim() || null,
      cbu: datos.cbu || null,
      alias: datos.alias.trim() || null,
      cuit: datos.cuit || null,
    }
    if (!fila.cbu && !fila.alias) return setAviso({ tipo: 'error', texto: 'Cargá al menos el CBU o el alias.' })
    if (fila.cbu && !esCbuValido(fila.cbu)) return setAviso({ tipo: 'error', texto: 'El CBU tiene que tener 22 números.' })
    if (fila.alias && !esAliasValido(fila.alias)) {
      return setAviso({ tipo: 'error', texto: 'El alias va de 6 a 20 caracteres: letras, números, puntos o guiones.' })
    }
    if (fila.cuit && !esCuitValido(fila.cuit)) return setAviso({ tipo: 'error', texto: 'El CUIT tiene que tener 11 números.' })

    setGuardando(true)
    const { error } = await supabase.from('datos_cobro').update(fila).eq('id', true)
    setGuardando(false)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })
    await cargar()
    setAviso({ tipo: 'ok', texto: 'Datos guardados. Los alumnos ya los ven en "Mi membresía".' })
  }

  if (cargando) return <Cargando />

  const input = 'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-400'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Datos de cobro</h1>
        <p className="text-sm text-neutral-400">La cuenta donde los alumnos transfieren la cuota.</p>
      </div>

      {aviso && <Aviso {...aviso} />}

      <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-neutral-300">Alias</span>
            <input value={datos.alias} onChange={campo('alias', (v) => v.replace(/\s/g, ''))} placeholder="licurgo.calistenia" className={input} />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-300">CBU / CVU <span className="text-neutral-500">(22 números)</span></span>
            <input value={datos.cbu} onChange={campo('cbu', soloNumeros)} inputMode="numeric" maxLength={22} className={`${input} font-mono`} />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-300">Titular de la cuenta</span>
            <input value={datos.titular} onChange={campo('titular')} className={input} />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-300">Banco o billetera</span>
            <input value={datos.banco} onChange={campo('banco')} placeholder="Ej: Banco Macro, Mercado Pago" className={input} />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-300">CUIT <span className="text-neutral-500">(opcional)</span></span>
            <input value={datos.cuit} onChange={campo('cuit', soloNumeros)} inputMode="numeric" maxLength={11} className={input} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">
            {guardados?.updated_at && (guardados.cbu || guardados.alias) ? `Última modificación: ${formatearFecha(guardados.updated_at)}` : 'Sin datos cargados'}
          </span>
          <button disabled={guardando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-300">Así lo ve el alumno</h2>
        <div className="max-w-md overflow-hidden rounded-2xl bg-neutral-900">
          <DatosTransferencia datos={guardados} />
        </div>
      </section>
    </div>
  )
}
