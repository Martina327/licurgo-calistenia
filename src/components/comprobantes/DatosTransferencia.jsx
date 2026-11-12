import { useState } from 'react'
import { formatearPesos } from '../../lib/utils'

// Datos de la cuenta del gimnasio para transferir (los carga el dueño en "Datos de cobro").
// Cada dato se copia con un toque para pegarlo en la app del banco.
// El CBU se muestra en sus dos bloques (banco/sucursal y cuenta) pero se copia sin espacios.
export default function DatosTransferencia({ datos, monto }) {
  const cargados = datos && (datos.cbu || datos.alias)
  if (!cargados) {
    return (
      <p className="px-4 py-3 text-sm text-neutral-300">
        Todavía no están cargados los datos de la cuenta. Pedíselos a recepción.
      </p>
    )
  }
  return (
    <dl className="divide-y divide-neutral-800">
      {datos.alias && <Fila etiqueta="Alias" valor={datos.alias} copiable />}
      {datos.cbu && <Fila etiqueta="CBU" valor={`${datos.cbu.slice(0, 8)} ${datos.cbu.slice(8)}`} copiarComo={datos.cbu} copiable mono apilado />}
      {datos.titular && <Fila etiqueta="Titular" valor={datos.titular} />}
      {datos.banco && <Fila etiqueta="Banco" valor={datos.banco} />}
      {datos.cuit && <Fila etiqueta="CUIT" valor={datos.cuit} />}
      {monto != null && <Fila etiqueta="Monto" valor={formatearPesos(monto)} copiable copiarComo={String(Math.round(monto))} />}
    </dl>
  )
}

function Fila({ etiqueta, valor, copiable, mono, copiarComo, apilado }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(copiarComo ?? valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // sin permiso de portapapeles: el dato igual se puede seleccionar a mano
    }
  }
  const boton = copiable && (
    <button type="button" onClick={copiar} aria-label={`Copiar ${etiqueta.toLowerCase()}`}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${copiado ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-800 text-neutral-200 active:bg-neutral-700'}`}>
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  )
  // Apilado: la etiqueta arriba y el valor a todo el ancho (el CBU no entra en una línea en el celular)
  if (apilado) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <dt className="text-sm text-neutral-400">{etiqueta}</dt>
          <dd className={`select-all text-[15px] text-neutral-100 ${mono ? 'tabular-nums' : ''}`}>{valor}</dd>
        </div>
        {boton}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <dt className="w-14 shrink-0 text-sm text-neutral-400">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 select-all break-all text-sm text-neutral-100">{valor}</dd>
      {boton}
    </div>
  )
}
