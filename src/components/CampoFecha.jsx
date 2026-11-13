import { useEffect, useRef, useState } from 'react'
import { aIso, desdeIso, formatearTipeo } from '../lib/fechas'
import { IconoCalendario } from './Iconos'

// Fecha en formato dd/mm/aaaa, se escriba como se escriba en el navegador (el <input type="date">
// en una compu en inglés pide mes/día/año y no deja poner un día 20 en adelante).
//   · Se escriben solo números; las barras se agregan solas.
//   · El calendario de la derecha abre el selector del navegador.
//   · onChange recibe { target: { value } } como un input común. value es:
//       'aaaa-mm-dd' si la fecha está completa y existe · '' si está vacía · null si está incompleta.
export default function CampoFecha({ value, onChange, className = '', min, max, autoFocus }) {
  const [texto, setTexto] = useState(desdeIso(value))
  const [salio, setSalio] = useState(false)
  const selector = useRef(null)

  // Si la fecha cambia desde afuera (ej. se cargan los datos), la muestro
  useEffect(() => {
    if (value && value !== aIso(texto)) setTexto(desdeIso(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const avisar = (t) => onChange?.({ target: { value: aIso(t) } })

  const escribir = (e) => {
    const t = formatearTipeo(e.target.value)
    setTexto(t)
    setSalio(false)
    avisar(t)
  }

  const elegir = (e) => {
    const t = desdeIso(e.target.value)
    setTexto(t)
    avisar(t)
  }

  const abrirCalendario = () => {
    const el = selector.current
    if (!el) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.click()
  }

  const incompleta = salio && texto !== '' && aIso(texto) === null

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          value={texto}
          onChange={escribir}
          onBlur={() => setSalio(true)}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          autoComplete="off"
          autoFocus={autoFocus}
          className={`${className} pr-11 ${incompleta ? 'border-red-700' : ''}`}
        />
        <button
          type="button"
          onClick={abrirCalendario}
          aria-label="Abrir calendario"
          title="Abrir calendario"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400 hover:text-white"
        >
          <IconoCalendario className="h-5 w-5" />
        </button>
        <input
          ref={selector}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={aIso(texto) || ''}
          min={min}
          max={max}
          onChange={elegir}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </div>
      {incompleta && <p className="text-xs text-red-400">Revisá la fecha: tiene que ser día/mes/año, por ejemplo 20/11/2026.</p>}
    </div>
  )
}
