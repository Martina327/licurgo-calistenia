import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, linkWhatsApp } from '../../lib/utils'
import Cargando from '../../components/Cargando'

// Mostrador: por ahora muestra el panel de alertas (CU17).
// Pendiente (fase 2): comprobantes (CU08), cobro en efectivo (CU06), kiosco (CU04),
// subalquileres (CU16), check-in por mostrador (CU03) y caja (CU05).
export default function Mostrador() {
  const [alertas, setAlertas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase
      .from('v_alertas')
      .select('*')
      .order('dias_restantes', { ascending: true, nullsFirst: true })
      .then(({ data }) => {
        setAlertas(data ?? [])
        setCargando(false)
      })
  }, [])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Alertas de vencimiento</h1>
        <p className="text-sm text-neutral-400">
          Membresías que vencen en 3 días o menos y certificados de aptitud por vencer, vencidos o faltantes.
        </p>
      </div>

      {alertas.length === 0 ? (
        <p className="text-neutral-400">No hay alertas. 🎉</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="px-3 py-2">Alumno</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => {
                const wa = linkWhatsApp(a.telefono, `Hola ${a.nombre}, te escribimos de Licurgo Calistenia.`)
                return (
                  <tr key={`${a.alumno_id}-${a.tipo}`} className="border-t border-neutral-800">
                    <td className="px-3 py-2">{a.nombre} {a.apellido}</td>
                    <td className="px-3 py-2">{a.tipo}</td>
                    <td className="px-3 py-2">{a.estado}</td>
                    <td className="px-3 py-2">{formatearFecha(a.vence)}</td>
                    <td className="px-3 py-2 text-right">
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                          WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
