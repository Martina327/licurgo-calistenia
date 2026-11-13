import { useEffect, useRef, useState } from 'react'

// Circulito "i" que muestra una explicación corta.
// En la compu aparece al pasar el mouse; en el celular, al tocarlo (y se cierra tocando afuera).
export default function Ayuda({ texto }) {
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e) => !caja.current?.contains(e.target) && setAbierta(false)
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierta])

  return (
    <span ref={caja} className="group relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setAbierta((a) => !a) }}
        aria-label="Más información"
        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full border border-neutral-600 text-[10px] font-semibold leading-none text-neutral-400 hover:border-neutral-300 hover:text-white"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`absolute bottom-full -left-16 z-30 mb-2 w-60 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-normal leading-snug text-neutral-200 shadow-lg ${
          abierta ? 'block' : 'hidden group-hover:block'
        }`}
      >
        {texto}
      </span>
    </span>
  )
}
