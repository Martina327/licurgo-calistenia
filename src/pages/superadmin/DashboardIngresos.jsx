import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearPesos } from '../../lib/utils'
import Cargando from '../../components/Cargando'

const CONCEPTOS = ['Cuota', 'Kiosco', 'Subalquiler']

// Fecha de hace N días en formato 'YYYY-MM-DD' (hora local)
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

// CU12 – Dashboard de ingresos (solo SuperAdmin; el RLS no devuelve filas a otros roles).
// Pendiente (fase 4): selector de rango, gráficos y métricas de concurrencia (CU13).
export default function DashboardIngresos() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase
      .from('v_ingresos_diarios')
      .select('*')
      .gte('fecha', haceDias(30))
      .then(({ data }) => {
        setFilas(data ?? [])
        setCargando(false)
      })
  }, [])

  const resumen = useMemo(() => {
    const porConcepto = Object.fromEntries(CONCEPTOS.map((c) => [c, { Efectivo: 0, Transferencia: 0 }]))
    for (const f of filas) porConcepto[f.concepto][f.medio_pago] += Number(f.total)
    const total = filas.reduce((s, f) => s + Number(f.total), 0)
    return { porConcepto, total }
  }, [filas])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ingresos · últimos 30 días</h1>
        <p className="text-3xl font-bold">{formatearPesos(resumen.total)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {CONCEPTOS.map((c) => {
          const { Efectivo, Transferencia } = resumen.porConcepto[c]
          const sub = Efectivo + Transferencia
          const pct = resumen.total ? Math.round((sub / resumen.total) * 100) : 0
          return (
            <div key={c} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="text-sm text-neutral-400">{c === 'Cuota' ? 'Cuotas' : c === 'Subalquiler' ? 'Subalquileres' : c}</div>
              <div className="text-2xl font-semibold">{formatearPesos(sub)}</div>
              <div className="text-xs text-neutral-500">{pct}% del total</div>
              <div className="mt-2 space-y-0.5 text-xs text-neutral-400">
                <div>Efectivo: {formatearPesos(Efectivo)}</div>
                <div>Transferencia: {formatearPesos(Transferencia)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
