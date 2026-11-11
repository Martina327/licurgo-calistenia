// ---------------------------------------------------------------
// "Portapapeles" de rutinas del coach: Copiar en un alumno (o plantilla)
// y Pegar en otro. Uno por nivel, así copiar un día no pisa una
// planificación copiada:
//   · seccion (uno por bloque: el calentamiento copiado solo se pega en un calentamiento)
//   · dia
//   · planificacion
// Se guarda en localStorage del navegador del coach (no en la base): sobrevive
// a cambiar de pantalla o recargar. Si el navegador bloquea el almacenamiento,
// copiar no se recuerda.
// ---------------------------------------------------------------

const PREFIJO = 'licurgo.portapapeles.'
const clave = (nivel, bloque) => PREFIJO + nivel + (nivel === 'seccion' ? `.${bloque}` : '')

// contenido = { origen, nombre, objetivo?, dias } (dias en formato payload)
export function copiar(nivel, bloque, contenido, storage = globalThis.localStorage) {
  try {
    storage.setItem(clave(nivel, bloque), JSON.stringify({ ...contenido, nivel, bloque: bloque ?? null, copiado: new Date().toISOString() }))
    return true
  } catch {
    return false
  }
}

export function leer(nivel, bloque, storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage.getItem(clave(nivel, bloque)) ?? 'null')
    return c && Array.isArray(c.dias) && c.dias.length && c.dias.some((d) => d.items?.length) ? c : null
  } catch {
    return null
  }
}

export function vaciar(nivel, bloque, storage = globalThis.localStorage) {
  try { storage.removeItem(clave(nivel, bloque)) } catch { /* nada */ }
}
