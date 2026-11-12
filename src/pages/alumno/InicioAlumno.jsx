import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha, formatearPesos, mensajeError } from '../../lib/utils'
import { BUCKET, situacionComprobantes } from '../../lib/comprobantes'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import DatosTransferencia from '../../components/comprobantes/DatosTransferencia'
import SubirComprobante from '../../components/comprobantes/SubirComprobante'
import EstadoComprobante from '../../components/comprobantes/EstadoComprobante'

const COLOR_ESTADO = {
  'Al día': 'bg-emerald-950 text-emerald-300',
  'Por vencer': 'bg-amber-950 text-amber-300',
  Vencida: 'bg-red-950 text-red-300',
  'Sin membresía': 'bg-neutral-800 text-neutral-300',
}

// Mi membresía (B4 · CU07, RF02, RNF02)
//   · Estado de la cuota, vencimiento y aviso 3 días antes (v_membresias: "Por vencer")
//   · Datos para transferir (CBU, alias) y subida del comprobante al bucket privado
//   · Historial de comprobantes: en revisión, aprobado o rechazado con el motivo
// La asistencia (CU03) NO la marca el alumno: la registra recepción al llegar.
export default function InicioAlumno() {
  const { perfil } = useAuth()
  const [membresia, setMembresia] = useState(null)
  const [datosCobro, setDatosCobro] = useState(null)
  const [comprobantes, setComprobantes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState(null)
  const [verTodos, setVerTodos] = useState(false)

  const cargar = useCallback(async () => {
    // El RLS hace que el alumno solo reciba sus propias filas
    const [m, d, c] = await Promise.all([
      supabase.from('v_membresias').select('*').maybeSingle(),
      supabase.from('datos_cobro').select('titular, banco, cbu, alias, cuit').maybeSingle(),
      supabase.from('v_comprobantes')
        .select('id, archivo_path, monto_declarado, monto_acreditado, estado, motivo_rechazo, created_at, revisado_at')
        .order('created_at', { ascending: false }),
    ])
    const error = m.error ?? d.error ?? c.error
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) })
    setMembresia(m.data)
    setDatosCobro(d.data)
    setComprobantes(c.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const verArchivo = async (c) => {
    // Bucket privado: link firmado que dura 1 minuto
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(c.archivo_path, 60)
    if (error) return setAviso({ tipo: 'error', texto: 'No se pudo abrir el archivo.' })
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (cargando) return <Cargando />
  if (!membresia) return <p className="text-neutral-400">No encontramos tu ficha de alumno.</p>

  const { estado_membresia: estado, dias_restantes: dias } = membresia
  const mostrarAlerta = estado === 'Por vencer' || estado === 'Vencida'
  const { modo, ultimo } = situacionComprobantes(comprobantes)
  const historial = verTodos ? comprobantes : comprobantes.slice(0, 3)

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Hola, {membresia.nombre}</h1>

      {aviso && <Aviso {...aviso} />}

      {mostrarAlerta && (
        <div className={`rounded-xl px-4 py-3 text-sm ${COLOR_ESTADO[estado]}`}>
          {estado === 'Vencida'
            ? `Tu membresía venció hace ${Math.abs(dias)} día(s). Renovala para seguir entrenando.`
            : dias === 0
              ? 'Tu membresía vence hoy.'
              : `Tu membresía vence en ${dias} día(s).`}
          {modo !== 'pendiente' && (
            <a href="#pagar" className="mt-1 block font-semibold underline underline-offset-2">Pagá por transferencia ↓</a>
          )}
        </div>
      )}

      {membresia.estado_alumno === 'En clase de prueba' && (
        <div className="rounded-xl bg-neutral-800 px-4 py-3 text-sm text-neutral-200">
          Estás en tu clase de prueba. Cuando abones la primera cuota (en recepción o por transferencia), tu cuenta pasa a activa.
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Mi membresía</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${COLOR_ESTADO[estado]}`}>{estado}</span>
        </div>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-neutral-400">Plan</dt>
          <dd>{membresia.plan ?? '—'}</dd>
          <dt className="text-neutral-400">Cuota</dt>
          <dd>{formatearPesos(membresia.precio_plan)}</dd>
          <dt className="text-neutral-400">Vence</dt>
          <dd>{formatearFecha(membresia.fecha_vencimiento)}</dd>
          <dt className="text-neutral-400">Días restantes</dt>
          <dd>{dias ?? '—'}</dd>
          <dt className="text-neutral-400">Apto médico</dt>
          <dd>{membresia.estado_certificado}</dd>
        </dl>
      </section>

      <section id="pagar" className="scroll-mt-20 space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-medium">Pagar por transferencia</h2>

        {modo === 'pendiente' ? (
          <div className="rounded-lg bg-amber-950/60 px-3 py-3 text-sm text-amber-200">
            <p className="font-semibold">Tu comprobante está en revisión</p>
            <p className="mt-0.5 text-amber-200/80">
              Lo enviaste el {formatearFecha(ultimo.created_at)}. Cuando recepción lo apruebe, tu vencimiento se corre 30 días.
            </p>
          </div>
        ) : (
          <>
            {ultimo?.estado === 'Aprobado' && (
              <p className="rounded-lg bg-emerald-950/60 px-3 py-2 text-sm text-emerald-200">
                Tu último comprobante fue aprobado el {formatearFecha(ultimo.revisado_at)}. ¡Gracias!
              </p>
            )}
            {modo === 'rechazado' && (
              <div className="rounded-lg bg-red-950/70 px-3 py-3 text-sm text-red-200">
                <p className="font-semibold">Rechazamos tu último comprobante</p>
                <p className="mt-0.5">Motivo: {ultimo.motivo_rechazo}</p>
                <p className="mt-1 text-red-200/80">Revisalo y enviá uno nuevo.</p>
              </div>
            )}
            <ol className="space-y-3 text-sm">
              <li>
                <p className="mb-2 text-neutral-300"><Paso n={1} /> Transferí la cuota a esta cuenta:</p>
                <DatosTransferencia datos={datosCobro} monto={membresia.precio_plan} />
              </li>
              <li>
                <p className="mb-2 text-neutral-300"><Paso n={2} /> Subí el comprobante:</p>
                <SubirComprobante key={comprobantes.length} alumnoId={perfil.id} montoSugerido={membresia.precio_plan}
                  onSubido={() => { setAviso({ tipo: 'ok', texto: 'Comprobante enviado. Recepción lo va a revisar.' }); cargar() }} />
              </li>
            </ol>
          </>
        )}

        {comprobantes.length > 0 && (
          <div className="space-y-2 border-t border-neutral-800 pt-3">
            <h3 className="text-sm font-medium text-neutral-300">Mis comprobantes</h3>
            <ul className="space-y-1.5">
              {historial.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 text-neutral-400">{formatearFecha(c.created_at)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {formatearPesos(c.monto_acreditado ?? c.monto_declarado)}
                    {c.estado === 'Rechazado' && <span className="text-neutral-500"> · {c.motivo_rechazo}</span>}
                  </span>
                  <EstadoComprobante estado={c.estado} />
                  <button onClick={() => verArchivo(c)} className="shrink-0 text-xs text-neutral-400 underline hover:text-white">Ver</button>
                </li>
              ))}
            </ul>
            {comprobantes.length > 3 && (
              <button onClick={() => setVerTodos((v) => !v)} className="text-xs text-neutral-400 hover:text-white">
                {verTodos ? 'Ver menos' : `Ver todos (${comprobantes.length})`}
              </button>
            )}
          </div>
        )}
      </section>

      <Link
        to="/alumno/rutina"
        className="block w-full rounded-xl border border-neutral-700 py-3 text-center font-semibold text-neutral-100 hover:bg-neutral-900"
      >
        Ver mi rutina
      </Link>

      <p className="text-center text-xs text-neutral-500">Tu asistencia la registra recepción cuando llegás al gimnasio.</p>
    </div>
  )
}

function Paso({ n }) {
  return (
    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold text-neutral-100">
      {n}
    </span>
  )
}
