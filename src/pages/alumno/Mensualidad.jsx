import { Link } from 'react-router-dom'
import { formatearFecha, formatearPesos } from '../../lib/utils'
import { aprobadoReciente, situacionComprobantes } from '../../lib/comprobantes'
import { useMiMembresia } from '../../lib/useMiMembresia'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { Lista, Fila } from '../../components/alumno/Lista'
import { IconoBanco, IconoCorazon, IconoRecibo } from '../../components/Iconos'

// Colores de la tarjeta según el estado de la cuota (v_membresias)
const TONO = {
  'Al día': { borde: 'border-emerald-900/70', fondo: 'from-emerald-950/80', chip: 'bg-emerald-500/15 text-emerald-300', barra: 'bg-emerald-400' },
  'Por vencer': { borde: 'border-amber-900/70', fondo: 'from-amber-950/80', chip: 'bg-amber-500/15 text-amber-300', barra: 'bg-amber-400' },
  Vencida: { borde: 'border-red-900/70', fondo: 'from-red-950/80', chip: 'bg-red-500/15 text-red-300', barra: 'bg-red-500' },
  'Sin membresía': { borde: 'border-neutral-800', fondo: 'from-neutral-900', chip: 'bg-neutral-700/40 text-neutral-300', barra: 'bg-neutral-500' },
}

// Mensualidad del alumno (B4): de un vistazo, cómo está su cuota.
// Pagar y el historial de comprobantes son pantallas aparte (/alumno/pagar, /alumno/comprobantes).
export default function Mensualidad() {
  const { cargando, membresia, comprobantes, error } = useMiMembresia()

  if (cargando) return <Cargando />
  if (!membresia) return <p className="text-neutral-400">No encontramos tu ficha de alumno.</p>

  const { modo, ultimo } = situacionComprobantes(comprobantes)
  const pendiente = modo === 'pendiente'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mensualidad</h1>
      {error && <Aviso tipo="error" texto={error} />}

      <TarjetaCuota m={membresia} />

      {/* Estado del último comprobante, solo si hay algo que contar */}
      {pendiente && (
        <Link to="/alumno/comprobantes" className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <span className="flex-1">Tu comprobante está en revisión</span>
          <span className="text-amber-200/60">{formatearFecha(ultimo.created_at)}</span>
        </Link>
      )}
      {modo === 'rechazado' && (
        <Link to="/alumno/pagar" className="block rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span className="font-semibold">Rechazamos tu comprobante.</span> {ultimo.motivo_rechazo}.
          <span className="mt-0.5 block font-semibold underline underline-offset-2">Enviar uno nuevo</span>
        </Link>
      )}
      {modo === 'subir' && aprobadoReciente(ultimo) && (
        <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Recibimos tu pago del {formatearFecha(ultimo.revisado_at)}. ¡Gracias!
        </p>
      )}

      <Lista titulo="Pagos">
        <Fila to="/alumno/pagar" Icono={IconoBanco} colorIcono="bg-sky-500/15 text-sky-300"
          titulo="Pagar por transferencia"
          detalle={pendiente ? 'Ya enviaste uno, está en revisión' : 'Alias, CBU y subir el comprobante'} />
        <Fila to="/alumno/comprobantes" Icono={IconoRecibo} colorIcono="bg-violet-500/15 text-violet-300"
          titulo="Mis comprobantes"
          detalle={comprobantes.length ? `${comprobantes.length} enviado${comprobantes.length === 1 ? '' : 's'}` : 'Todavía no enviaste ninguno'} />
      </Lista>

      <Lista titulo="Mi ficha">
        <Fila to="/alumno/apto" Icono={IconoCorazon} colorIcono="bg-rose-500/15 text-rose-300" titulo="Apto médico"
          detalle={membresia.estado_certificado === 'Sin certificado' ? 'Subí tu apto médico' : 'Ver o subir uno nuevo'} valor={membresia.estado_certificado} />
      </Lista>

      <p className="px-1 text-center text-xs text-neutral-500">Tu asistencia la registra recepción cuando llegás al gimnasio.</p>
    </div>
  )
}

function TarjetaCuota({ m }) {
  const estado = m.estado_membresia
  const t = TONO[estado] ?? TONO['Sin membresía']
  const dias = m.dias_restantes
  const prueba = m.estado_alumno === 'En clase de prueba'
  const llenado = estado === 'Vencida' ? 100 : Math.max(4, Math.min(100, ((dias ?? 0) / 30) * 100))

  return (
    <section className={`rounded-3xl border ${t.borde} bg-gradient-to-b ${t.fondo} to-neutral-900 p-5`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-300">Mi cuota</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.chip}`}>{prueba ? 'Clase de prueba' : estado}</span>
      </div>

      {prueba ? (
        <div className="mt-4 space-y-1">
          <p className="text-2xl font-bold">¡Te damos la bienvenida!</p>
          <p className="text-sm text-neutral-300">Cuando abones la primera cuota, en recepción o por transferencia, tu cuenta pasa a activa.</p>
        </div>
      ) : estado === 'Vencida' ? (
        <div className="mt-3">
          <p className="text-5xl font-bold tracking-tight">Vencida</p>
          <p className="mt-1 text-sm text-red-200">Hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? '' : 's'} · renovala para seguir entrenando</p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="flex items-baseline gap-2">
            <span className="text-6xl font-bold tabular-nums tracking-tight">{dias}</span>
            <span className="text-lg text-neutral-300">{dias === 1 ? 'día' : 'días'}</span>
          </p>
          <p className="text-sm text-neutral-300">{dias === 0 ? 'Vence hoy' : `Vence el ${formatearFecha(m.fecha_vencimiento)}`}</p>
        </div>
      )}

      {!prueba && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
          <div className={`h-full rounded-full ${t.barra}`} style={{ width: `${llenado}%` }} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-neutral-400">{m.plan ?? 'Sin plan'}</span>
        <span className="font-semibold">{formatearPesos(m.precio_plan)}<span className="font-normal text-neutral-400"> /mes</span></span>
      </div>
    </section>
  )
}

