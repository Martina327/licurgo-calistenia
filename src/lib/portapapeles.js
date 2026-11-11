// ---------------------------------------------------------------
// "Portapapeles" de rutinas del coach: Copiar en un alumno y Pegar en otro.
// Se guarda en localStorage del navegador del coach (no en la base), así
// sobrevive a cambiar de pantalla o recargar. Una sola rutina a la vez.
// Si el navegador bloquea el almacenamiento, copiar no se recuerda.
// ---------------------------------------------------------------

const CLAVE = 'licurgo.portapapeles.rutina'

// rutina = { origen, alumnoId, nombre, objetivo, dias } (dias en formato payload)
export function copiarRutina(rutina, storage = globalThis.localStorage) {
  try {
    storage.setItem(CLAVE, JSON.stringify({ ...rutina, copiada: new Date().toISOString() }))
    return true
  } catch {
    return false
  }
}

export function leerPortapapeles(storage = globalThis.localStorage) {
  try {
    const r = JSON.parse(storage.getItem(CLAVE) ?? 'null')
    return r && Array.isArray(r.dias) && r.dias.length ? r : null
  } catch {
    return null
  }
}

export function vaciarPortapapeles(storage = globalThis.localStorage) {
  try { storage.removeItem(CLAVE) } catch { /* nada */ }
}
