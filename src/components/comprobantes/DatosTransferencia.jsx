import { useState } from 'react'
import { formatearPesos } from '../../lib/utils'

// Datos de la cuenta del gimnasio para transferir (los carga el dueño en "Datos de cobro").
// Cada dato se copia con un toque para pegarlo en la app del banco.
// El CBU se muestra en sus dos bloques (banco/sucursal y cuenta) pero se copia sin espacios.
export default function DatosTransferencia({ datos, monto }) {
  const cargados = datos && (datos.cbu || datos.alias)
  if (!cargados) {
    return (
      <p className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300">
        Todavía no están cargados los datos de la cuenta. Pedíselos a recepción.
      </p>
    )
  }
  return (
    <dl className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
      {datos.alias && <Fila etiqueta="Alias" valor={datos.alias} copiable />}
      {datos.cbu && <Fila etiqueta="CBU" valor={`${datos.cbu.slice(0, 8)} ${datos.cbu.slice(8)}`} copiarComo={datos.cbu} copiable mono />}
      {datos.titular && <Fila etiqueta="Titular" valor={datos.titular} />}
      {datos.banco && <Fila etiqueta="Banco" valor={datos.banco} />}
      {datos.cuit && <Fila etiqueta="CUIT" valor={datos.cuit} />}
      {monto != null && <Fila etiqueta="Monto" valor={formatearPesos(monto)} copiable copiarComo={String(Math.round(monto))} />}
    </dl>
  )
}

function Fila({ etiqueta, valor, copiable, mono, copiarComo }) {
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
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <dt className="w-16 shrink-0 text-sm text-neutral-400">{etiqueta}</dt>
      <dd className={`min-w-0 flex-1 select-all break-all text-sm text-neutral-100 ${mono ? 'font-mono tracking-tight' : ''}`}>{valor}</dd>
      {copiable && (
        <button type="button" onClick={copiar} aria-label={`Copiar ${etiqueta.toLowerCase()}`}
          className={`shrink-0 rounded-md px-2 py-1 text-xs ${copiado ? 'bg-emerald-950 text-emerald-300' : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      )}
    </div>
  )
}
