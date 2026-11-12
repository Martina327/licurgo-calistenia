import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha, formatearPesos } from '../../lib/utils'
import { situacionComprobantes } from '../../lib/comprobantes'
import { useMiMembresia } from '../../lib/useMiMembresia'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import DatosTransferencia from '../../components/comprobantes/DatosTransferencia'
import SubirComprobante from '../../components/comprobantes/SubirComprobante'
import { IconoCheck } from '../../components/Iconos'

// Pagar por transferencia (B4 · CU07): pantalla aparte, se abre desde Inicio.
//   1. Datos de la cuenta (copiar alias / CBU)   2. Subir el comprobante
export default function PagarCuota() {
  const { perfil } = useAuth()
  const { cargando, membresia, datosCobro, comprobantes, error, recargar } = useMiMembresia()
  const [enviado, setEnviado] = useState(false)

  if (cargando) return <Cargando />
  if (!membresia) return <p className="text-neutral-400">No encontramos tu ficha de alumno.</p>

  if (enviado) {
    return (
      <Estado icono={<IconoCheck className="h-8 w-8" />} tono="bg-emerald-500/15 text-emerald-300"
        titulo="¡Comprobante enviado!"
        texto="Recepción lo va a revisar. Cuando lo apruebe, tu vencimiento se corre 30 días.">
        <Link to="/alumno" className="block w-full rounded-2xl bg-white py-3.5 text-center font-semibold text-neutral-950">Volver al inicio</Link>
      </Estado>
    )
  }

  const { modo, ultimo } = situacionComprobantes(comprobantes)
  if (modo === 'pendiente') {
    return (
      <Estado icono={<span className="h-3 w-3 animate-pulse rounded-full bg-amber-400" />} tono="bg-amber-500/15"
        titulo="Tu comprobante está en revisión"
        texto={`Lo enviaste el ${formatearFecha(ultimo.created_at)}. Cuando recepción lo revise vas a poder enviar otro.`}>
        <Link to="/alumno/comprobantes" className="block w-full rounded-2xl bg-neutral-800 py-3.5 text-center font-semibold">Ver mis comprobantes</Link>
      </Estado>
    )
  }

  return (
    <div className="space-y-6">
      {error && <Aviso tipo="error" texto={error} />}

      {modo === 'rechazado' && (
        <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="font-semibold">Rechazamos tu último comprobante</p>
          <p>Motivo: {ultimo.motivo_rechazo}</p>
        </div>
      )}

      <div className="text-center">
        <p className="text-sm text-neutral-400">Cuota a transferir</p>
        <p className="text-4xl font-bold tabular-nums">{formatearPesos(membresia.precio_plan)}</p>
      </div>

      <Paso n={1} titulo="Transferí a esta cuenta" sinRelleno>
        <DatosTransferencia datos={datosCobro} />
      </Paso>

      <Paso n={2} titulo="Subí el comprobante">
        <SubirComprobante alumnoId={perfil.id} montoSugerido={membresia.precio_plan}
          onSubido={() => { setEnviado(true); recargar() }} />
      </Paso>
    </div>
  )
}

function Paso({ n, titulo, sinRelleno, children }) {
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-neutral-300">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold text-white">{n}</span>
        {titulo}
      </h2>
      <div className={`overflow-hidden rounded-2xl bg-neutral-900 ${sinRelleno ? '' : 'p-3'}`}>{children}</div>
    </section>
  )
}

function Estado({ icono, tono, titulo, texto, children }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full ${tono}`}>{icono}</span>
      <div className="space-y-1">
        <h2 className="text-xl font-bold">{titulo}</h2>
        <p className="mx-auto max-w-xs text-sm text-neutral-400">{texto}</p>
      </div>
      <div className="w-full pt-4">{children}</div>
    </div>
  )
}
