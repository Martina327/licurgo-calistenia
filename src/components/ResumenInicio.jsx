import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatearPesos, hoyAR } from '../lib/utils'
import { IconoAlumno, IconoCaja, IconoCalendario, IconoMostrador } from './Iconos'

// Inicio del dueño: cuatro tarjetas con lo más importante del día.
//   · Ingresos de hoy (rojo Licurgo) · Alumnos activos · Presentes hoy · Cuotas a cobrar
// Cada tarjeta lleva a la pantalla donde se ve el detalle.
export default function ResumenInicio() {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    const hoy = hoyAR()
    let cancelado = false
    Promise.all([
      supabase.from('v_movimientos').select('monto').eq('fecha', hoy),
      supabase.from('v_membresias').select('estado_alumno, estado_membresia, pase_libre'),
      supabase.from('asistencias').select('id', { count: 'exact', head: true }).eq('fecha', hoy),
    ]).then(([mov, alu, asis]) => {
      if (cancelado) return
      const alumnos = alu.data ?? []
      const activos = alumnos.filter((a) => a.estado_alumno === 'Activo')
      const aCobrar = activos.filter((a) => !a.pase_libre && ['Por vencer', 'Vencida'].includes(a.estado_membresia))
      setDatos({
        ingresos: (mov.data ?? []).reduce((t, m) => t + Number(m.monto), 0),
        cobros: (mov.data ?? []).length,
        activos: activos.length,
        prueba: alumnos.filter((a) => a.estado_alumno === 'En clase de prueba').length,
        presentes: asis.count ?? 0,
        aCobrar: aCobrar.length,
        vencidas: aCobrar.filter((a) => a.estado_membresia === 'Vencida').length,
      })
    })
    return () => { cancelado = true }
  }, [])

  const d = datos
  const tarjetas = [
    {
      titulo: 'Ingresos de hoy',
      valor: d ? formatearPesos(d.ingresos) : '…',
      detalle: d ? `${d.cobros} cobro${d.cobros === 1 ? '' : 's'}` : '',
      color: 'from-red-700 to-red-900',
      icono: IconoCaja,
    },
    {
      titulo: 'Alumnos activos',
      valor: d ? d.activos : '…',
      detalle: d && d.prueba > 0 ? `+${d.prueba} en clase de prueba` : 'Ver alumnos',
      color: 'from-emerald-600 to-emerald-800',
      icono: IconoAlumno,
      a: '/recepcion/alumnos?filtro=Activo',
    },
    {
      titulo: 'Presentes hoy',
      valor: d ? d.presentes : '…',
      detalle: 'Ver mostrador',
      color: 'from-sky-600 to-sky-800',
      icono: IconoMostrador,
      a: '/recepcion',
    },
    {
      titulo: 'Cuotas a cobrar',
      valor: d ? d.aCobrar : '…',
      detalle: d ? (d.vencidas > 0 ? `${d.vencidas} vencida${d.vencidas === 1 ? '' : 's'}` : 'Vencen en 3 días o menos') : '',
      color: 'from-amber-500 to-amber-700',
      icono: IconoCalendario,
      a: '/recepcion',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tarjetas.map((t) => {
        const contenido = (
          <>
            <t.icono className="pointer-events-none absolute -bottom-3 -right-3 h-20 w-20 opacity-15" />
            <p className="text-sm font-medium text-white/85">{t.titulo}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{t.valor}</p>
            <p className="mt-1 text-xs text-white/75">{t.detalle}</p>
          </>
        )
        const clases = `relative block overflow-hidden rounded-xl bg-gradient-to-br ${t.color} p-4 text-white`
        return t.a ? (
          <Link key={t.titulo} to={t.a} className={`${clases} transition hover:brightness-110`}>{contenido}</Link>
        ) : (
          <div key={t.titulo} className={clases}>{contenido}</div>
        )
      })}
    </div>
  )
}
