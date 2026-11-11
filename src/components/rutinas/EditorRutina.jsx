import { useMemo, useState } from 'react'
import { BLOQUES_EJERCICIO, CATEGORIAS_EJERCICIO } from '../../lib/utils'
import { MAX_DIAS, TEXTO_VAMOS, UNIDADES_DESCANSO, diaVacio, itemVacio } from '../../lib/rutinas'

export const claseInput =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400'

// Editor de una rutina por días y bloques. Controlado: recibe `value` y avisa con `onChange(nuevoValor)`.
//   value = { nombre, objetivo, dias: [...] }  (dias en el formato de lib/rutinas.js)
// Lo usan la rutina de cada alumno y las plantillas. Para reiniciar la pestaña de día
// (ej. al cargar otra rutina), el padre le cambia la `key`.
export default function EditorRutina({ value, onChange, ejercicios, conObjetivo = true }) {
  const [diaSel, setDiaSel] = useState(0)
  const rutina = value
  const dia = rutina.dias[Math.min(diaSel, rutina.dias.length - 1)]
  const iDia = rutina.dias.indexOf(dia)

  const editar = (cambio) => onChange(cambio(structuredClone(rutina)))

  const agregarDia = () => {
    editar((r) => { r.dias.push(diaVacio()); return r })
    setDiaSel(rutina.dias.length)
  }
  const quitarDia = () => {
    if (!window.confirm(`¿Quitar el Día ${iDia + 1} y sus ejercicios?`)) return
    editar((r) => { r.dias.splice(iDia, 1); return r })
    setDiaSel(Math.max(0, iDia - 1))
  }
  const cambiarItem = (key, campo, valor) =>
    editar((r) => { const it = r.dias[iDia].items.find((i) => i.key === key); it[campo] = valor; return r })
  const agregarItem = (bloque) => editar((r) => { r.dias[iDia].items.push(itemVacio(bloque)); return r })
  const quitarItem = (key) => editar((r) => { r.dias[iDia].items = r.dias[iDia].items.filter((i) => i.key !== key); return r })
  // Sube o baja un ítem dentro de su mismo bloque
  const moverItem = (key, delta) =>
    editar((r) => {
      const items = r.dias[iDia].items
      const desde = items.findIndex((i) => i.key === key)
      const delBloque = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.bloque === items[desde].bloque)
      const pos = delBloque.findIndex(({ idx }) => idx === desde)
      const destino = delBloque[pos + delta]
      if (destino) [items[desde], items[destino.idx]] = [items[destino.idx], items[desde]]
      return r
    })

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-300">Nombre de la rutina</span>
          <input value={rutina.nombre} onChange={(e) => editar((r) => { r.nombre = e.target.value; return r })}
            placeholder="Ej: Fuerza básica – tren superior" className={`mt-1 ${claseInput}`} />
        </label>
        {conObjetivo && (
          <label className="block text-sm">
            <span className="text-neutral-300">Objetivo (lo ve el alumno)</span>
            <input value={rutina.objetivo} onChange={(e) => editar((r) => { r.objetivo = e.target.value; return r })}
              placeholder="Ej: primera dominada estricta en 8 semanas" className={`mt-1 ${claseInput}`} />
          </label>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {rutina.dias.map((d, i) => (
          <button key={d.key} onClick={() => setDiaSel(i)}
            className={`rounded-lg px-3 py-1.5 text-sm ${i === iDia ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'}`}>
            Día {i + 1}{d.nombre && ` · ${d.nombre}`}
          </button>
        ))}
        {rutina.dias.length < MAX_DIAS && (
          <button onClick={agregarDia} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-white">+ Día</button>
        )}
      </div>

      {dia && (
        <section className="space-y-4 rounded-xl border border-neutral-800 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-48 flex-1 text-sm">
              <span className="text-neutral-300">Nombre del Día {iDia + 1}</span>
              <input value={dia.nombre} onChange={(e) => editar((r) => { r.dias[iDia].nombre = e.target.value; return r })}
                placeholder="Ej: Tracción + Core" className={`mt-1 ${claseInput}`} />
            </label>
            {rutina.dias.length > 1 && (
              <button onClick={quitarDia} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">Quitar día</button>
            )}
          </div>

          {BLOQUES_EJERCICIO.map((bloque) => (
            <BloqueEditor
              key={bloque}
              bloque={bloque}
              items={dia.items.filter((i) => i.bloque === bloque)}
              ejercicios={ejercicios}
              onCambiar={cambiarItem}
              onMover={moverItem}
              onQuitar={quitarItem}
              onAgregar={() => agregarItem(bloque)}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function BloqueEditor({ bloque, items, ejercicios, onCambiar, onMover, onQuitar, onAgregar }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">{bloque}</h3>
      {items.length === 0 && <p className="text-sm text-neutral-600">Sin ejercicios en este bloque.</p>}
      {items.map((it, n) => (
        <ItemEditor
          key={it.key}
          item={it}
          ejercicios={ejercicios}
          onCambiar={(campo, valor) => onCambiar(it.key, campo, valor)}
          onSubir={n > 0 ? () => onMover(it.key, -1) : null}
          onBajar={n < items.length - 1 ? () => onMover(it.key, 1) : null}
          onQuitar={() => onQuitar(it.key)}
        />
      ))}
      <button onClick={onAgregar} className="text-sm text-neutral-400 hover:text-white">+ Agregar a {bloque}</button>
    </div>
  )
}

function ItemEditor({ item: it, ejercicios, onCambiar, onSubir, onBajar, onQuitar }) {
  return (
    <div className="grid grid-cols-6 gap-2 rounded-lg bg-neutral-900 p-2 sm:grid-cols-12">
      <SelectorEjercicio value={it.ejercicio_id} ejercicios={ejercicios} className={`${claseInput} col-span-6 sm:col-span-4`}
        onChange={(v) => onCambiar('ejercicio_id', v)} />
      <input type="number" min="1" value={it.series} onChange={(e) => onCambiar('series', e.target.value)}
        title="Series" placeholder="Series" className={`${claseInput} col-span-2 sm:col-span-1`} />
      <input value={it.repeticiones} onChange={(e) => onCambiar('repeticiones', e.target.value)}
        title="Repeticiones" placeholder="Reps (8, 30s…)" className={`${claseInput} col-span-2 sm:col-span-2`} />
      <div className="col-span-2 flex sm:col-span-2" title={`Descanso. Vacío = "${TEXTO_VAMOS}"`}>
        <input inputMode="decimal" value={it.descanso} onChange={(e) => onCambiar('descanso', e.target.value)}
          placeholder="¡VAMOS!" aria-label="Descanso"
          className={`${claseInput} min-w-0 rounded-r-none`} />
        <select value={it.unidad} onChange={(e) => onCambiar('unidad', e.target.value)} aria-label="Unidad del descanso"
          className="rounded-r-lg border border-l-0 border-neutral-700 bg-neutral-900 px-1.5 text-sm text-neutral-300 outline-none">
          {UNIDADES_DESCANSO.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
      <input value={it.nota} onChange={(e) => onCambiar('nota', e.target.value)}
        title="Observación para el alumno: la ve al tocar ⓘ" placeholder="Observación (la ve en ⓘ)"
        className={`${claseInput} col-span-4 sm:col-span-2`} />
      <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
        <BotonIcono titulo="Subir" disabled={!onSubir} onClick={onSubir}>↑</BotonIcono>
        <BotonIcono titulo="Bajar" disabled={!onBajar} onClick={onBajar}>↓</BotonIcono>
        <BotonIcono titulo="Quitar" onClick={onQuitar}>✕</BotonIcono>
      </div>
    </div>
  )
}

// Solo ofrece ejercicios activos, salvo el que ya estaba elegido (para no perderlo si se desactivó)
function SelectorEjercicio({ value, ejercicios, onChange, className }) {
  const opciones = useMemo(() => ejercicios.filter((e) => e.activo || e.id === value), [ejercicios, value])
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Elegir ejercicio…</option>
      {CATEGORIAS_EJERCICIO.map((c) => {
        const grupo = opciones.filter((e) => e.categoria === c)
        return grupo.length ? (
          <optgroup key={c} label={c}>
            {grupo.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.activo ? '' : ' (inactivo)'}</option>)}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

export function BotonIcono({ titulo, onClick, disabled, children }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick ?? undefined} disabled={disabled}
      className="h-8 w-8 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30">
      {children}
    </button>
  )
}
