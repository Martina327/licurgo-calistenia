import { useEffect, useRef, useState } from 'react'

// Circulito "i" que muestra una explicación corta.
// En la compu aparece al pasar el mouse; en el celular, al tocarlo (y se cierra tocando afuera).
// `children` reemplaza al circulito por otro disparador (ej. la etiqueta "Falta info").
// Se abre arriba; si no hay lugar (títulos pegados a la barra superior) se abre abajo,
// y se corre a los costados lo justo para no salirse de la pantalla (celular).
const ALTO_LUGAR = 190 // barra superior (~64px) + un mensaje de 4–5 renglones
const ANCHO = 240
export default function Ayuda({ texto, children, className }) {
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)
  const [lado, setLado] = useState({ abajo: false, x: -8 })

  const medir = () => {
    const r = caja.current?.getBoundingClientRect()
    if (!r) return
    const ancho = Math.min(ANCHO, window.innerWidth - 16)
    const izq = Math.min(Math.max(r.left - 8, 8), window.innerWidth - 8 - ancho) // borde izquierdo en pantalla
    setLado({ abajo: r.top < ALTO_LUGAR, x: izq - r.left })
  }

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e) => !caja.current?.contains(e.target) && setAbierta(false)
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierta])

  return (
    <span ref={caja} onMouseEnter={medir} className="group relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); medir(); setAbierta((a) => !a) }}
        aria-label={children ? undefined : 'Más información'}
        className={className ?? 'ml-1 flex h-4 w-4 items-center justify-center rounded-full border border-neutral-600 text-[10px] font-semibold leading-none text-neutral-400 hover:border-neutral-300 hover:text-white'}
      >
        {children ?? 'i'}
      </button>
      <span
        role="tooltip"
        style={{ left: lado.x }}
        className={`absolute z-30 w-60 max-w-[calc(100vw-16px)] rounded-lg ${lado.abajo ? 'top-full mt-2' : 'bottom-full mb-2'} border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-neutral-200 shadow-lg ${
          abierta ? 'block' : 'hidden group-hover:block'
        }`}
      >
        {texto}
      </span>
    </span>
  )
}
