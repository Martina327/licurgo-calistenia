import { useMemo, useState } from 'react'
import { BLOQUES_EJERCICIO, CATEGORIAS_EJERCICIO } from '../../lib/utils'
import {
  BLOQUE_CALENTAMIENTO, MAX_DIAS, llevaDescanso, TEXTO_VAMOS, UNIDADES_DESCANSO, cadenas, conBloque, desdePayload, diaNuevo, itemVacio, nombreCadena,
} from '../../lib/rutinas'

export const claseInput =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400'

// Editor de una rutina por días y bloques. Controlado: recibe `value` y avisa con `onChange(nuevoValor)`.
//   value = { nombre, objetivo, dias: [...] }  (dias en el formato de lib/rutinas.js)
// Lo usan la rutina de cada alumno y las plantillas. Para reiniciar la pestaña de día
// (ej. al cargar otra rutina), el padre le cambia la `key`.
//   calentamiento: ítems del calentamiento estándar (payload). Los días nuevos lo traen cargado
//                  y la Entrada en calor tiene un botón para volver a cargarlo.
//   soloCalentamiento: edita el calentamiento estándar (un día, solo Entrada en calor).
export default function EditorRutina({ value, onChange, ejercicios, calentamiento = [], soloCalentamiento = false }) {
  const [diaSel, setDiaSel] = useState(0)
  const rutina = value
  const dia = rutina.dias[Math.min(diaSel, rutina.dias.length - 1)]
  const iDia = rutina.dias.indexOf(dia)

  const editar = (cambio) => onChange(cambio(structuredClone(rutina)))

  const agregarDia = () => {
    editar((r) => { r.dias.push(diaNuevo(calentamiento)); return r })
    setDiaSel(rutina.dias.length)
  }
  const quitarDia = () => {
    if (!window.confirm(`¿Quitar el Día ${iDia + 1} y sus ejercicios?`)) return
    editar((r) => { r.dias.splice(iDia, 1); return r })
    setDiaSel(Math.max(0, iDia - 1))
  }
  // Operaciones sobre los ítems de UN bloque del día seleccionado: reciben las cadenas del bloque
  // (ver lib/rutinas.js → cadenas) y devuelven la lista nueva de ítems del bloque.
  const editarBloque = (bloque, fn) =>
    editar((r) => {
      const d = r.dias[iDia]
      const delBloque = d.items.filter((i) => i.bloque === bloque)
      d.items = conBloque(d.items, bloque, fn(cadenas(delBloque), delBloque))
      return r
    })

  const cambiarItem = (bloque, key, campo, valor) =>
    editarBloque(bloque, (cs) => {
      for (const c of cs) {
        const it = c.find((i) => i.key === key)
        if (!it) continue
        // En una bi-serie las series van juntas
        if (campo === 'series') c.forEach((i) => { i.series = valor })
        else it[campo] = valor
      }
      return cs.flat()
    })
  const agregarItem = (bloque) => editarBloque(bloque, (cs, items) => [...items, itemVacio(bloque)])
  const quitarItem = (bloque, key) =>
    editarBloque(bloque, (cs, items) => {
      const n = items.findIndex((i) => i.key === key)
      // Si era el último de una bi-serie, el anterior deja de estar unido
      if (n > 0 && !items[n].enlazado) items[n - 1].enlazado = false
      return items.filter((i) => i.key !== key)
    })
  // Sube o baja un ejercicio suelto o una bi-serie entera, saltando al bloque vecino
  const moverCadena = (bloque, nCadena, delta) =>
    editarBloque(bloque, (cs) => {
      const destino = nCadena + delta
      if (destino >= 0 && destino < cs.length) [cs[nCadena], cs[destino]] = [cs[destino], cs[nCadena]]
      cs.forEach((c) => { c[c.length - 1].enlazado = false })
      cs.forEach((c) => c.slice(0, -1).forEach((i) => { i.enlazado = true }))
      return cs.flat()
    })
  // Une la cadena nCadena con la de abajo (bi-serie) o separa todos sus ejercicios
  const unirConSiguiente = (bloque, nCadena) =>
    editarBloque(bloque, (cs) => {
      const c = cs[nCadena]
      c[c.length - 1].enlazado = true
      const series = c[0].series
      cs[nCadena + 1]?.forEach((i) => { i.series = series })
      return cs.flat()
    })
  const cargarCalentamiento = () => {
    const actuales = dia.items.filter((i) => i.bloque === BLOQUE_CALENTAMIENTO)
    if (actuales.length && !window.confirm('¿Reemplazar la entrada en calor de este día por el calentamiento estándar?')) return
    editarBloque(BLOQUE_CALENTAMIENTO, () => desdePayload([{ items: calentamiento }])[0].items)
  }
  const separar = (bloque, nCadena) =>
    editarBloque(bloque, (cs) => { cs[nCadena].forEach((i) => { i.enlazado = false }); return cs.flat() })

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-300">{soloCalentamiento ? 'Nombre' : 'Nombre de la rutina'}</span>
          <input value={rutina.nombre} onChange={(e) => editar((r) => { r.nombre = e.target.value; return r })}
            placeholder="Ej: Fuerza básica – tren superior" className={`mt-1 ${claseInput}`} />
        </label>
        {!soloCalentamiento && (
          <label className="block text-sm">
            <span className="text-neutral-300">Objetivo (lo ve el alumno)</span>
            <input value={rutina.objetivo} onChange={(e) => editar((r) => { r.objetivo = e.target.value; return r })}
              placeholder="Ej: primera dominada estricta en 8 semanas" className={`mt-1 ${claseInput}`} />
          </label>
        )}
      </section>

      {!soloCalentamiento && <div className="flex flex-wrap items-center gap-2">
        {rutina.dias.map((d, i) => (
          <button key={d.key} onClick={() => setDiaSel(i)}
            className={`rounded-lg px-3 py-1.5 text-sm ${i === iDia ? 'bg-white text-neutral-950' : 'border border-neutral-700 text-neutral-300'}`}>
            Día {i + 1}{d.nombre && ` · ${d.nombre}`}
          </button>
        ))}
        {rutina.dias.length < MAX_DIAS && (
          <button onClick={agregarDia} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-white">+ Día</button>
        )}
      </div>}

      {dia && (
        <section className="space-y-4 rounded-xl border border-neutral-800 p-4">
          {!soloCalentamiento && <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-48 flex-1 text-sm">
              <span className="text-neutral-300">Nombre del Día {iDia + 1}</span>
              <input value={dia.nombre} onChange={(e) => editar((r) => { r.dias[iDia].nombre = e.target.value; return r })}
                placeholder="Ej: Tracción + Core" className={`mt-1 ${claseInput}`} />
            </label>
            {rutina.dias.length > 1 && (
              <button onClick={quitarDia} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">Quitar día</button>
            )}
          </div>}

          {BLOQUES_EJERCICIO.filter((b) => !soloCalentamiento || b === BLOQUE_CALENTAMIENTO).map((bloque) => (
            <BloqueEditor
              key={bloque}
              bloque={bloque}
              accion={bloque === BLOQUE_CALENTAMIENTO && calentamiento.length > 0 && !soloCalentamiento && (
                <button type="button" onClick={cargarCalentamiento} className="text-xs text-neutral-400 underline hover:text-white">
                  Cargar calentamiento estándar
                </button>
              )}
              items={dia.items.filter((i) => i.bloque === bloque)}
              ejercicios={ejercicios}
              onCambiar={(key, campo, valor) => cambiarItem(bloque, key, campo, valor)}
              onMover={(n, delta) => moverCadena(bloque, n, delta)}
              onUnir={(n) => unirConSiguiente(bloque, n)}
              onSeparar={(n) => separar(bloque, n)}
              onQuitar={(key) => quitarItem(bloque, key)}
              onAgregar={() => agregarItem(bloque)}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function BloqueEditor({ bloque, items, ejercicios, accion, onCambiar, onMover, onUnir, onSeparar, onQuitar, onAgregar }) {
  // Entrada en calor y Estiramientos: sin descanso ni bi-series
  const conDescanso = llevaDescanso(bloque)
  const cs = conDescanso ? cadenas(items) : items.map((i) => [i])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">{bloque}</h3>
        {accion}
      </div>
      {items.length === 0 && <p className="text-sm text-neutral-600">Sin ejercicios en este bloque.</p>}
      {cs.map((c, n) => {
        const mover = {
          onSubir: n > 0 ? () => onMover(n, -1) : null,
          onBajar: n < cs.length - 1 ? () => onMover(n, 1) : null,
        }
        return (
          <div key={c[0].key} className="space-y-1">
            {c.length === 1 ? (
              <ItemEditor item={c[0]} ejercicios={ejercicios} {...mover} conDescanso={conDescanso}
                onCambiar={(campo, valor) => onCambiar(c[0].key, campo, valor)} onQuitar={() => onQuitar(c[0].key)} />
            ) : (
              <div className="space-y-2 rounded-xl border border-violet-800 bg-violet-950/30 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                    {nombreCadena(c.length)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 hidden text-xs text-violet-300 sm:inline">Sin descanso entre ejercicios · descansa al final</span>
                    <BotonIcono titulo="Subir" disabled={!mover.onSubir} onClick={mover.onSubir}>↑</BotonIcono>
                    <BotonIcono titulo="Bajar" disabled={!mover.onBajar} onClick={mover.onBajar}>↓</BotonIcono>
                    <button type="button" onClick={() => onSeparar(n)} className="rounded-md px-2 py-1 text-xs text-violet-300 hover:bg-violet-900">
                      Separar
                    </button>
                  </div>
                </div>
                {c.map((it, k) => (
                  <ItemEditor key={it.key} item={it} ejercicios={ejercicios} enCadena
                    sinDescanso={k < c.length - 1}
                    onCambiar={(campo, valor) => onCambiar(it.key, campo, valor)} onQuitar={() => onQuitar(it.key)} />
                ))}
              </div>
            )}
            {conDescanso && n < cs.length - 1 && (
              <button type="button" onClick={() => onUnir(n)}
                className="block w-full text-center text-xs text-neutral-500 hover:text-violet-300"
                title="El alumno hace los dos ejercicios seguidos y descansa recién al terminar el segundo">
                🔗 Unir con el de abajo (bi-serie)
              </button>
            )}
          </div>
        )
      })}
      <button onClick={onAgregar} className="text-sm text-neutral-400 hover:text-white">+ Agregar a {bloque}</button>
    </div>
  )
}

function ItemEditor({ item: it, ejercicios, onCambiar, onSubir, onBajar, onQuitar, enCadena = false, sinDescanso = false, conDescanso = true }) {
  return (
    <div className="grid grid-cols-6 gap-2 rounded-lg bg-neutral-900 p-2 sm:grid-cols-12">
      <SelectorEjercicio value={it.ejercicio_id} ejercicios={ejercicios} className={`${claseInput} col-span-6 sm:col-span-4`}
        onChange={(v) => onCambiar('ejercicio_id', v)} />
      <input type="number" min="1" value={it.series} onChange={(e) => onCambiar('series', e.target.value)}
        title="Series" placeholder="Series" className={`${claseInput} col-span-2 sm:col-span-1`} />
      <input value={it.repeticiones} onChange={(e) => onCambiar('repeticiones', e.target.value)}
        title="Repeticiones" placeholder="Reps (8, 30s…)" className={`${claseInput} col-span-2 sm:col-span-2`} />
      {!conDescanso ? null : sinDescanso ? (
        <div className="col-span-2 flex items-center text-xs text-violet-300 sm:col-span-2">sin descanso ↓</div>
      ) : (
      <div className="col-span-2 flex sm:col-span-2" title={`Descanso. Vacío = "${TEXTO_VAMOS}"`}>
        <input inputMode="decimal" value={it.descanso} onChange={(e) => onCambiar('descanso', e.target.value)}
          placeholder="¡VAMOS!" aria-label="Descanso"
          className={`${claseInput} min-w-0 rounded-r-none`} />
        <select value={it.unidad} onChange={(e) => onCambiar('unidad', e.target.value)} aria-label="Unidad del descanso"
          className="rounded-r-lg border border-l-0 border-neutral-700 bg-neutral-900 px-1.5 text-sm text-neutral-300 outline-none">
          {UNIDADES_DESCANSO.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
      )}
      <input value={it.nota} onChange={(e) => onCambiar('nota', e.target.value)}
        title="Observación para el alumno: la ve al tocar ⓘ" placeholder="Observación ⓘ"
        className={`${claseInput} ${conDescanso ? 'col-span-4 sm:col-span-2' : 'col-span-6 sm:col-span-4'}`} />
      <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
        {!enCadena && <BotonIcono titulo="Subir" disabled={!onSubir} onClick={onSubir}>↑</BotonIcono>}
        {!enCadena && <BotonIcono titulo="Bajar" disabled={!onBajar} onClick={onBajar}>↓</BotonIcono>}
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
