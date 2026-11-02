import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, formatearPesos } from '../../lib/utils'
import Cargando from '../../components/Cargando'

const COLOR_ESTADO = {
  'Al día': 'bg-emerald-950 text-emerald-300',
  'Por vencer': 'bg-amber-950 text-amber-300',
  Vencida: 'bg-red-950 text-red-300',
  'Sin membresía': 'bg-neutral-800 text-neutral-300',
}

// Pantalla principal del alumno: estado de membresía y alertas (CU07, CU17).
// La asistencia (CU03) NO la marca el alumno: la registra recepción al llegar.
// Pendiente (fase 3): subir comprobante, certificado y rutina con checklist (CU11).
export default function InicioAlumno() {
  const [membresia, setMembresia] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // El RLS hace que el alumno solo reciba su propia fila
    supabase
      .from('v_membresias')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        setMembresia(data)
        setCargando(false)
      })
  }, [])

  if (cargando) return <Cargando />
  if (!membresia) return <p className="text-neutral-400">No encontramos tu ficha de alumno.</p>

  const { estado_membresia: estado, dias_restantes: dias } = membresia
  const mostrarAlerta = estado === 'Por vencer' || estado === 'Vencida'

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Hola, {membresia.nombre}</h1>

      {mostrarAlerta && (
        <div className={`rounded-xl px-4 py-3 text-sm ${COLOR_ESTADO[estado]}`}>
          {estado === 'Vencida'
            ? `Tu membresía venció hace ${Math.abs(dias)} día(s). Renovala para seguir entrenando.`
            : dias === 0
              ? 'Tu membresía vence hoy.'
              : `Tu membresía vence en ${dias} día(s).`}
        </div>
      )}

      {membresia.estado_alumno === 'En clase de prueba' && (
        <div className="rounded-xl bg-neutral-800 px-4 py-3 text-sm text-neutral-200">
          Estás en tu clase de prueba. Cuando abones la primera cuota en recepción, tu cuenta pasa a activa.
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

      <p className="text-center text-xs text-neutral-500">Tu asistencia la registra recepción cuando llegás al gimnasio.</p>
    </div>
  )
}
