// ---------------------------------------------------------------
// Instalación como app (RNF03 · PWA)
//   · Registra el service worker (solo en producción: en `vite dev` no hace falta
//     y una caché vieja confunde mientras se programa).
//   · Guarda el evento `beforeinstallprompt` (Chrome/Edge en Android y escritorio):
//     llega apenas carga la página, antes de que React monte, por eso se escucha acá.
//   · iPhone/iPad no tienen ese evento: se instala desde Compartir → "Agregar a inicio",
//     así que ahí se muestran las instrucciones.
// ---------------------------------------------------------------

const CLAVE_DESCARTE = 'licurgo.instalar.descartado'
const DIAS_SIN_INSISTIR = 14

let eventoInstalar = null
const oyentes = new Set()
const avisar = () => oyentes.forEach((fn) => fn())

export function iniciarPWA({ win = globalThis.window, produccion = import.meta.env.PROD } = {}) {
  if (!win) return
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // sin el mini-banner del navegador: usamos el nuestro
    eventoInstalar = e
    avisar()
  })
  win.addEventListener('appinstalled', () => {
    eventoInstalar = null
    avisar()
  })
  if (produccion && 'serviceWorker' in win.navigator) {
    win.addEventListener('load', () => {
      win.navigator.serviceWorker.register('/sw.js').catch(() => {}) // sin SW la app funciona igual
    })
  }
}

export const suscribirInstalacion = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn) }
export const puedeInstalar = () => eventoInstalar !== null

// Abre el diálogo nativo de instalación. Devuelve true si el usuario aceptó.
export async function instalar() {
  if (!eventoInstalar) return false
  const e = eventoInstalar
  eventoInstalar = null // el evento se usa una sola vez
  avisar()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome === 'accepted'
}

// Ya abierta como app (desde el ícono): no hay nada que ofrecer
export function esStandalone(win = globalThis.window) {
  return Boolean(win?.matchMedia?.('(display-mode: standalone)').matches || win?.navigator?.standalone)
}

// iPhone / iPad (los iPad nuevos se presentan como Mac, pero con pantalla táctil)
export function esIOS(nav = globalThis.navigator) {
  if (!nav) return false
  return /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

export function descartadoReciente(ahora = Date.now(), storage = globalThis.localStorage) {
  try {
    const t = Number(storage.getItem(CLAVE_DESCARTE))
    return Boolean(t) && ahora - t < DIAS_SIN_INSISTIR * 86_400_000
  } catch {
    return false
  }
}

export function descartar(ahora = Date.now(), storage = globalThis.localStorage) {
  try { storage.setItem(CLAVE_DESCARTE, String(ahora)) } catch { /* sin almacenamiento: vuelve a aparecer */ }
}

// Qué ofrecer: 'boton' (diálogo nativo), 'ios' (instrucciones) o null (nada)
export function modoInstalacion({ standalone, ios, disponible, descartado }) {
  if (standalone || descartado) return null
  if (disponible) return 'boton'
  if (ios) return 'ios'
  return null
}
