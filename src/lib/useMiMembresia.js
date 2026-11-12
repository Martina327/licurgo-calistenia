import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { mensajeError } from './utils'

// Datos del alumno para Inicio, Pagar y Mis comprobantes (B4).
// El RLS hace que el alumno reciba solo sus propias filas.
export function useMiMembresia() {
  const [estado, setEstado] = useState({ cargando: true, membresia: null, datosCobro: null, comprobantes: [], error: '' })

  const cargar = useCallback(async () => {
    const [m, d, c] = await Promise.all([
      supabase.from('v_membresias').select('*').maybeSingle(),
      supabase.from('datos_cobro').select('titular, banco, cbu, alias, cuit').maybeSingle(),
      supabase.from('v_comprobantes')
        .select('id, archivo_path, monto_declarado, monto_acreditado, estado, motivo_rechazo, created_at, revisado_at')
        .order('created_at', { ascending: false }),
    ])
    const error = m.error ?? d.error ?? c.error
    setEstado({
      cargando: false,
      membresia: m.data,
      datosCobro: d.data,
      comprobantes: c.data ?? [],
      error: error ? mensajeError(error) : '',
    })
  }, [])

  useEffect(() => { cargar() }, [cargar])
  return { ...estado, recargar: cargar }
}
