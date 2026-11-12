import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { marcarRecarga, puedeRecargarSolo, vigilarActualizaciones, yaRecargue } from '../lib/actualizacion'

const recargar = (version) => {
  marcarRecarga(version)
  window.location.reload()
}

// Mantiene la app al día sin reinstalarla (ver lib/actualizacion.js).
// Recarga sola donde no se pierde nada; si hay un formulario a medias, avisa arriba.
export default function ActualizacionApp() {
  const { pathname } = useLocation()
  const [nueva, setNueva] = useState(null)
  const ruta = useRef(pathname)
  ruta.current = pathname

  useEffect(() => vigilarActualizaciones((v) => {
    if (puedeRecargarSolo(ruta.current) && !yaRecargue(v)) recargar(v)
    else setNueva(v)
  }), [])

  // Si quedó el aviso y la persona pasa a una pantalla sin formularios, se actualiza ahí
  useEffect(() => {
    if (nueva && puedeRecargarSolo(pathname) && !yaRecargue(nueva)) recargar(nueva)
  }, [nueva, pathname])

  if (!nueva) return null
  return (
    <div role="status" className="fixed inset-x-0 top-[64px] z-50 flex justify-center px-3">
      <div className="flex items-center gap-3 rounded-full border border-sky-800 bg-sky-950 py-1.5 pl-4 pr-1.5 text-sm text-sky-100 shadow-xl">
        <span>Hay una versión nueva de Licurgo</span>
        <button onClick={() => recargar(nueva)} className="rounded-full bg-sky-400 px-3 py-1 font-semibold text-sky-950">
          Actualizar
        </button>
      </div>
    </div>
  )
}
