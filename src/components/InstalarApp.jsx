import { useEffect, useState } from 'react'
import {
  descartadoReciente, descartar, esIOS, esStandalone, instalar, modoInstalacion, puedeInstalar, suscribirInstalacion,
} from '../lib/pwa'

// Aviso para instalar Licurgo como app (RNF03).
//   · Android / Chrome / Edge: botón "Instalar" que abre el diálogo del navegador.
//   · iPhone / iPad: cómo hacerlo desde Compartir → "Agregar a inicio".
// No aparece si ya se abrió desde el ícono, ni durante 14 días después de "Ahora no".
export default function InstalarApp({ sobrePestanias = false }) {
  const [disponible, setDisponible] = useState(puedeInstalar)
  const [descartado, setDescartado] = useState(() => descartadoReciente())

  useEffect(() => suscribirInstalacion(() => setDisponible(puedeInstalar())), [])

  const modo = modoInstalacion({ standalone: esStandalone(), ios: esIOS(), disponible, descartado })
  if (!modo) return null

  const cerrar = () => { descartar(); setDescartado(true) }

  return (
    <div role="dialog" aria-label="Instalar Licurgo"
      className={`fixed inset-x-0 z-30 px-3 ${sobrePestanias
        ? 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))] pb-2' // arriba de las pestañas del alumno
        : 'bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}>
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-100">Tené Licurgo en tu inicio</p>
          {modo === 'boton' ? (
            <p className="text-sm text-neutral-400">Abrí tu rutina y tu cuota de un toque, como cualquier app.</p>
          ) : (
            <p className="text-sm text-neutral-400">
              Tocá <IconoCompartir /> <span className="text-neutral-200">Compartir</span> y después{' '}
              <span className="text-neutral-200">Agregar a inicio</span>.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {modo === 'boton' && (
              <button onClick={instalar}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-950">
                Instalar
              </button>
            )}
            <button onClick={cerrar}
              className={`rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-white ${modo === 'ios' ? '-ml-3' : ''}`}>
              {modo === 'boton' ? 'Ahora no' : 'Entendido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// El ícono de Compartir de Safari (cuadrado con flecha hacia arriba)
function IconoCompartir() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="inline h-4 w-4 -translate-y-px align-middle text-sky-400" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}
