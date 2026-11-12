// ---------------------------------------------------------------
// Actualización automática de la app (PWA)
//
// Problema: en el iPhone la app instalada no se recarga al volver a abrirla;
// queda suspendida en memoria con el código viejo y nunca se entera de un deploy.
//
// Solución: cada compilación lleva su versión adentro (__APP_VERSION__) y publica
// /version.json. La app compara las dos:
//   · al abrir, al volver a primer plano (visibilitychange), al recuperar conexión
//     y cada 5 minutos mientras está visible.
// Si hay versión nueva:
//   · en pantallas sin formularios (rutina del alumno, membresía, listados) recarga sola;
//   · en pantallas donde se está cargando algo (editor de rutina, plantillas, fichas…)
//     muestra "Hay una versión nueva · Actualizar" para no perder lo escrito.
// ---------------------------------------------------------------

/* global __APP_VERSION__ */
export const VERSION_APP = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

const CADA = 5 * 60 * 1000
const CLAVE_RECARGA = 'licurgo.recargado-para'

// Pantallas donde recargar no pierde nada (solo se mira o se tilda; el checklist vive en localStorage)
const RUTAS_SEGURAS = [/^\/$/, /^\/alumno$/, /^\/alumno\/rutina$/, /^\/coach$/, /^\/recepcion$/, /^\/admin$/]

export const hayVersionNueva = (publicada, actual = VERSION_APP) =>
  Boolean(publicada) && actual !== 'dev' && publicada !== actual

// ¿Se puede recargar sin preguntar? Además de la ruta, si el alumno ya eligió el archivo
// del comprobante (o hay algo escrito con foco) se espera a que toque "Actualizar".
export function puedeRecargarSolo(pathname, doc = globalThis.document) {
  if (!RUTAS_SEGURAS.some((re) => re.test(pathname))) return false
  if (!doc) return true
  const archivos = [...doc.querySelectorAll('input[type=file]')].some((i) => i.files?.length > 0)
  const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(doc.activeElement?.tagName) && doc.activeElement.value
  return !archivos && !escribiendo
}

// Evita un bucle de recargas si el CDN todavía devuelve el JS viejo: una recarga automática por versión
export function yaRecargue(version, storage = globalThis.sessionStorage) {
  try { return storage.getItem(CLAVE_RECARGA) === version } catch { return false }
}
export function marcarRecarga(version, storage = globalThis.sessionStorage) {
  try { storage.setItem(CLAVE_RECARGA, version) } catch { /* sin almacenamiento */ }
}

export async function versionPublicada(fetchFn = globalThis.fetch) {
  try {
    const r = await fetchFn(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const { version } = await r.json()
    return typeof version === 'string' ? version : null
  } catch {
    return null // sin conexión: se vuelve a probar más tarde
  }
}

// Revisa la versión en los momentos clave. Devuelve la función para dejar de vigilar.
export function vigilarActualizaciones(onNueva, { win = globalThis.window, cada = CADA, consultar = versionPublicada } = {}) {
  if (!win || VERSION_APP === 'dev') return () => {}
  let activo = true
  const revisar = async () => {
    if (!activo || win.document.visibilityState === 'hidden') return
    win.navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {})
    const v = await consultar()
    if (activo && hayVersionNueva(v)) onNueva(v)
  }
  const alVolver = () => { if (win.document.visibilityState === 'visible') revisar() }
  win.document.addEventListener('visibilitychange', alVolver)
  win.addEventListener('focus', revisar)
  win.addEventListener('online', revisar)
  win.addEventListener('pageshow', revisar) // iOS: volver a la app desde la caché de navegación
  const reloj = win.setInterval(revisar, cada)
  revisar()
  return () => {
    activo = false
    win.document.removeEventListener('visibilitychange', alVolver)
    win.removeEventListener('focus', revisar)
    win.removeEventListener('online', revisar)
    win.removeEventListener('pageshow', revisar)
    win.clearInterval(reloj)
  }
}
