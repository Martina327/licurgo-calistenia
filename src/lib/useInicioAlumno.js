import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hoyAR, mensajeError } from './utils'
import { agruparPorDia } from './rutinas'
import { diaEmpezadoAntes, leerChecklist } from './checklist'
import { diaQueToca, lunesDe } from './semana'

const haceUnAnio = (hoy) => {
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 364)
  return d.toISOString().slice(0, 10)
}

// Datos del Inicio del alumno (el RLS le devuelve solo lo suyo):
//   · membresía (para avisar si la cuota vence)
//   · asistencias y días completados del último año (racha, mes, semanas)
//   · su rutina: cuántos días tiene (objetivo semanal) y qué día le toca hoy
//   · WhatsApp del gimnasio
export function useInicioAlumno() {
  const [estado, setEstado] = useState({ cargando: true })

  useEffect(() => {
    const hoy = hoyAR()
    const desde = haceUnAnio(hoy)
    Promise.all([
      supabase.from('v_membresias').select('nombre, apellido, estado_membresia, dias_restantes, estado_alumno').maybeSingle(),
      supabase.from('asistencias').select('fecha').gte('fecha', desde),
      supabase.from('dias_completados').select('numero_dia, fecha, creado, rutina_id').gte('fecha', desde).order('creado'),
      supabase.from('v_rutina_alumno').select('rutina_id, rutina, numero_dia, dia, item_id, bloque, orden, grupo'),
      supabase.rpc('whatsapp_contacto'),
    ]).then(([m, a, c, r, w]) => {
      const error = m.error ?? a.error ?? c.error ?? r.error
      const dias = agruparPorDia(r.data ?? [])
      const rutinaId = r.data?.[0]?.rutina_id
      const completados = (c.data ?? []).filter((x) => x.rutina_id === rutinaId && x.fecha >= lunesDe(hoy))
      const toca = dias.length
        ? diaQueToca({
          dias: dias.map((d) => d.numero),
          completados: [...completados, ...[rutinaId && diaEmpezadoAntes(rutinaId, hoy)].filter(Boolean)],
          hoy,
          elegidoHoy: rutinaId ? leerChecklist(rutinaId, hoy).dia : null,
        })
        : null
      setEstado({
        cargando: false,
        error: error ? mensajeError(error) : '',
        hoy,
        membresia: m.data,
        asistencias: a.data ?? [],
        completados: c.data ?? [],
        diasRutina: dias.length,
        rutina: r.data?.[0]?.rutina ?? null,
        diaHoy: dias.find((d) => d.numero === toca) ?? null,
        hechoHoy: completados.some((x) => x.fecha === hoy),
        whatsapp: w.data || null,
      })
    })
  }, [])

  return estado
}
