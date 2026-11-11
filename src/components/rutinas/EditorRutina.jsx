import { useMemo, useState } from 'react'
import { BLOQUES_EJERCICIO, CATEGORIAS_EJERCICIO } from '../../lib/utils'
import {
  MAX_DIAS, NIVELES, TEXTO_VAMOS, UNIDADES_DESCANSO, agregarDias, cadenas, conBloque, diaConEjercicios, diaVacio, itemVacio,
  llevaDescanso, nombreCadena, payloadDia, payloadPlanificacion, payloadSeccion, pegarDia, pegarSeccion, plantillasDe,
  rutinaConEjercicios,
} from '../../lib/rutinas'
import * as portapapeles from '../../lib/portapapeles'
import { CADENA, estiloSeccion } from '../../lib/secciones'

export const claseInput =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400'

// Editor de rutinas por días y secciones (Entrada en calor / Fuerza / Accesorios / Estiramientos).
// Controlado: recibe `value` = { nombre, objetivo, dias } y avisa con `onChange(nuevoValor)`.
// Para reiniciar la pestaña de día (ej. al cargar otra rutina), el padre le cambia la `key`.
//
//   modo: 'planificacion' → varios días (rutina del alumno o plantilla de planificación)
//         'dia'           → un solo día (plantilla de día)
//         'seccion'       → una sola sección `bloque` (plantilla de sección)
//   plantillas:          todas las plantillas activas (para "Pegar plantilla" en cada nivel)
//   onGuardarPlantilla:  async ({ tipo, bloque, nombre, objetivo, dias }) → texto de error o null
//   onAviso:             ({ tipo: 'ok' | 'error', texto }) para mostrar el resultado
//   origen:              de quién es la rutina (ej. el alumno), para "Pegar … copiado de X"
//   diasHechos:          Set con los números de día que el alumno completó esta semana (✓ en la pestaña)
//
// Copiar/pegar y plantillas en tres niveles (ver lib/rutinas.js):
//   menú de cada sección · menú del día · menú de la planificación (arriba de los días)
export default function EditorRutina({
  value, onChange, ejercicios, plantillas = [], onGuardarPlantilla, onAviso = () => {}, origen = '',
  modo = 'planificacion', bloque: bloqueFijo, etiquetaNombre, diasHechos = new Set(),
}) {
  const [diaSel, setDiaSel] = useState(0)
  const [eleccion, setEleccion] = useState(null) // diálogo con opciones
  const [, setCopias] = useState(0)              // re-render después de copiar
  const rutina = value
  const dia = rutina.dias[Math.min(diaSel, rutina.dias.length - 1)]
  const iDia = rutina.dias.indexOf(dia)
  const esPlanificacion = modo === 'planificacion'
  const bloques = modo === 'seccion' ? [bloqueFijo] : BLOQUES_EJERCICIO
  const nombreDia = (i = iDia) => `Día ${i + 1}${rutina.dias[i]?.nombre ? ` · ${rutina.dias[i].nombre}` : ''}`

  const editar = (cambio) => onChange(cambio(structuredClone(rutina)))

  const agregarDia = () => {
    editar((r) => { r.dias.push(diaVacio()); return r })
    setDiaSel(rutina.dias.length)
  }
  const quitarDia = () => {
    if (!window.confirm(`¿Quitar el ${nombreDia()} y sus ejercicios?`)) return
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
  // Sube o baja un ejercicio suelto o una bi-serie entera
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
  const separar = (bloque, nCadena) =>
    editarBloque(bloque, (cs) => { cs[nCadena].forEach((i) => { i.enlazado = false }); return cs.flat() })

  // ---- Copiar / pegar / plantillas -------------------------------------
  const copiar = (nivel, bloque, contenido, texto) => {
    const ok = portapapeles.copiar(nivel, bloque, { origen, ...contenido })
    setCopias((n) => n + 1)
    onAviso(ok ? { tipo: 'ok', texto } : { tipo: 'error', texto: 'El navegador no permitió guardar la copia.' })
  }
  const guardarPlantilla = async (tipo, bloque, dias, sugerido) => {
    const nombre = window.prompt(`Nombre de la plantilla (${tipo}${bloque ? ` de ${bloque}` : ''}):`, sugerido)?.trim()
    if (!nombre) return
    const error = await onGuardarPlantilla({ tipo, bloque, nombre, objetivo: tipo === NIVELES.planificacion ? rutina.objetivo : null, dias })
    onAviso(error ? { tipo: 'error', texto: error } : { tipo: 'ok', texto: `Plantilla "${nombre}" guardada. La encontrás en Coach → Plantillas.` })
  }

  // Sección: reemplaza solo esa sección del día seleccionado
  const pegarEnSeccion = (bloque, payload, desde) => {
    const tiene = dia.items.some((i) => i.bloque === bloque)
    if (tiene && !window.confirm(`¿Reemplazar ${bloque} del ${nombreDia()} por "${desde}"? El resto del día no cambia.`)) return
    editar((r) => { r.dias[iDia] = pegarSeccion(r.dias[iDia], bloque, payload); return r })
    onAviso({ tipo: 'ok', texto: `${bloque} del ${nombreDia()}: se cargó "${desde}". Modificala si hace falta.` })
  }
  // Día: reemplaza solo el día seleccionado
  const pegarEnDia = (payload, desde) => {
    if (diaConEjercicios(dia) && !window.confirm(`¿Reemplazar el ${nombreDia()} completo por "${desde}"? Los otros días no cambian.`)) return
    editar((r) => { r.dias[iDia] = pegarDia(r.dias[iDia], payload); return r })
    onAviso({ tipo: 'ok', texto: `${nombreDia()}: se cargó "${desde}". Modificalo si hace falta.` })
  }
  // Agregar día(s) al final sin tocar los existentes
  const agregarAlFinal = (payload, desde) => {
    const { dias, agregados, descartados } = agregarDias(rutina.dias, payload)
    if (!agregados) return onAviso({ tipo: 'error', texto: `Ya hay ${MAX_DIAS} días: quitá alguno para agregar otro.` })
    onChange({ ...rutina, dias })
    setDiaSel(rutina.dias.length)
    onAviso({
      tipo: 'ok',
      texto: `Se agregó "${desde}" (${agregados} día${agregados > 1 ? 's' : ''})${descartados ? `; ${descartados} no entraron (máximo ${MAX_DIAS})` : ''}.`,
    })
  }
  // Planificación: si ya hay ejercicios, el coach elige agregar al final o reemplazar todo
  const pegarPlanificacion = (contenido, desde) => {
    const reemplazar = () => {
      onChange({
        ...rutina,
        nombre: rutina.nombre || contenido.nombre || '',
        objetivo: rutina.objetivo || contenido.objetivo || '',
        dias: agregarDias([], contenido.dias).dias,
      })
      setDiaSel(0)
      onAviso({ tipo: 'ok', texto: `Se cargó la planificación "${desde}". Modificala si hace falta.` })
    }
    if (!rutinaConEjercicios(rutina.dias)) return reemplazar()
    setEleccion({
      titulo: `Pegar "${desde}"`,
      texto: `Trae ${contenido.dias.length} día(s). Ya hay ${rutina.dias.length} día(s) cargados. ¿Qué hacemos?`,
      opciones: [
        { texto: 'Agregar sus días al final', accion: () => agregarAlFinal(contenido.dias, desde), principal: true },
        { texto: 'Reemplazar todos los días', accion: reemplazar, peligro: true },
      ],
    })
  }

  // ---- Menús de cada nivel ---------------------------------------------
  const menuSeccion = (bloque) => {
    const copiada = portapapeles.leer('seccion', bloque)
    const vacia = !dia.items.some((i) => i.bloque === bloque)
    return [
      { titulo: `Pegar plantilla de ${bloque}`, items: plantillasDe(plantillas, NIVELES.seccion, bloque)
        .map((p) => ({ texto: p.nombre, accion: () => pegarEnSeccion(bloque, p.dias, p.nombre) })) },
      { titulo: 'Copiado', items: copiada
        ? [{ texto: `Pegar copiado de ${copiada.origen}`, accion: () => pegarEnSeccion(bloque, copiada.dias, `copiado de ${copiada.origen}`) }] : [] },
      { titulo: 'Esta sección', items: [
        { texto: 'Copiar sección', disabled: vacia,
          accion: () => copiar('seccion', bloque, { nombre: bloque, dias: payloadSeccion(dia, bloque) },
            `${bloque} copiada. Pegala desde el menú de ${bloque} de otro día o de otro alumno.`) },
        onGuardarPlantilla && { texto: 'Guardar como plantilla de sección', disabled: vacia,
          accion: () => guardarPlantilla(NIVELES.seccion, bloque, payloadSeccion(dia, bloque), '') },
      ] },
    ]
  }
  const menuDia = () => {
    const copiado = portapapeles.leer('dia')
    const vacio = !diaConEjercicios(dia)
    return [
      { titulo: 'Pegar plantilla de día', items: plantillasDe(plantillas, NIVELES.dia)
        .map((p) => ({ texto: p.nombre, accion: () => pegarEnDia(p.dias, p.nombre) })) },
      { titulo: 'Copiado', items: copiado
        ? [{ texto: `Pegar día copiado de ${copiado.origen}`, accion: () => pegarEnDia(copiado.dias, `día copiado de ${copiado.origen}`) }] : [] },
      { titulo: 'Este día', items: [
        { texto: 'Copiar día', disabled: vacio,
          accion: () => copiar('dia', null, { nombre: dia.nombre, dias: payloadDia(dia) },
            `${nombreDia()} copiado. Pegalo desde el menú del día de otro alumno, o con "Agregar día".`) },
        onGuardarPlantilla && { texto: 'Guardar como plantilla de día', disabled: vacio,
          accion: () => guardarPlantilla(NIVELES.dia, null, payloadDia(dia), dia.nombre) },
      ] },
    ]
  }
  const menuPlanificacion = () => {
    const copiada = portapapeles.leer('planificacion')
    const diaCopiado = portapapeles.leer('dia')
    const lleno = rutina.dias.length >= MAX_DIAS
    return [
      { titulo: 'Pegar planificación (todos los días)', items: [
        ...plantillasDe(plantillas, NIVELES.planificacion).map((p) => ({ texto: p.nombre, accion: () => pegarPlanificacion(p, p.nombre) })),
        copiada && { texto: `Copiada de ${copiada.origen}`, accion: () => pegarPlanificacion(copiada, `copiada de ${copiada.origen}`) },
      ] },
      { titulo: lleno ? `Agregar día (ya hay ${MAX_DIAS})` : 'Agregar día al final', items: [
        ...plantillasDe(plantillas, NIVELES.dia).map((p) => ({ texto: p.nombre, disabled: lleno, accion: () => agregarAlFinal(p.dias, p.nombre) })),
        diaCopiado && { texto: `Día copiado de ${diaCopiado.origen}`, disabled: lleno,
          accion: () => agregarAlFinal(diaCopiado.dias, `día copiado de ${diaCopiado.origen}`) },
      ] },
      { titulo: 'Esta planificación', items: [
        { texto: 'Copiar planificación', disabled: !rutinaConEjercicios(rutina.dias),
          accion: () => copiar('planificacion', null, { nombre: rutina.nombre, objetivo: rutina.objetivo, dias: payloadPlanificacion(rutina.dias) },
            'Planificación copiada. Pegala desde "Planificación" en otro alumno.') },
        onGuardarPlantilla && { texto: 'Guardar como plantilla de planificación', disabled: !rutinaConEjercicios(rutina.dias),
          accion: () => guardarPlantilla(NIVELES.planificacion, null, payloadPlanificacion(rutina.dias), rutina.nombre) },
      ] },
    ]
  }

  return (
    <div className="space-y-4">
      <section className={`grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 ${esPlanificacion ? 'sm:grid-cols-2' : ''}`}>
        <label className="block text-sm">
          <span className="text-neutral-300">{etiquetaNombre ?? 'Nombre de la rutina'}</span>
          <input value={rutina.nombre} onChange={(e) => editar((r) => { r.nombre = e.target.value; return r })}
            placeholder={modo === 'seccion' ? `Ej: ${bloqueFijo} piernas` : 'Ej: Fuerza básica – tren superior'} className={`mt-1 ${claseInput}`} />
        </label>
        {esPlanificacion && (
          <label className="block text-sm">
            <span className="text-neutral-300">Objetivo (lo ve el alumno)</span>
            <input value={rutina.objetivo ?? ''} onChange={(e) => editar((r) => { r.objetivo = e.target.value; return r })}
              placeholder="Ej: primera dominada estricta en 8 semanas" className={`mt-1 ${claseInput}`} />
          </label>
        )}
      </section>

      {esPlanificacion && (
        <div className="flex flex-wrap items-center gap-2">
          <MenuAcciones etiqueta="☰ Planificación" titulo="Pegar, agregar o copiar todos los días" grupos={menuPlanificacion()} destacado />
          {rutina.dias.map((d, i) => (
            <button key={d.key} onClick={() => setDiaSel(i)}
              title={diasHechos.has(i + 1) ? 'El alumno lo completó esta semana' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${i === iDia ? 'bg-white font-medium text-neutral-950' : 'border border-neutral-700 text-neutral-200 hover:border-neutral-500'}`}>
              {diasHechos.has(i + 1) && <span className="text-emerald-500" aria-label="completado esta semana">✓ </span>}
              {nombreDia(i)}
            </button>
          ))}
          {rutina.dias.length < MAX_DIAS && (
            <button onClick={agregarDia} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-white">+ Día vacío</button>
          )}
        </div>
      )}

      {dia && (
        <section className="space-y-5 rounded-xl border border-neutral-800 p-4">
          {modo !== 'seccion' && (
            <div className="flex flex-wrap items-end gap-3">
              {esPlanificacion && (
                <label className="block min-w-48 flex-1 text-sm">
                  <span className="text-neutral-300">Nombre del Día {iDia + 1}</span>
                  <input value={dia.nombre} onChange={(e) => editar((r) => { r.dias[iDia].nombre = e.target.value; return r })}
                    placeholder="Ej: Tracción + Core" className={`mt-1 ${claseInput}`} />
                </label>
              )}
              <MenuAcciones etiqueta={esPlanificacion ? `⋯ Día ${iDia + 1}` : '⋯ Día'} titulo="Pegar o copiar el día completo" grupos={menuDia()} />
              {esPlanificacion && rutina.dias.length > 1 && (
                <button onClick={quitarDia} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">Quitar día</button>
              )}
            </div>
          )}

          {bloques.map((bloque) => (
            <BloqueEditor
              key={bloque}
              bloque={bloque}
              accion={<MenuAcciones etiqueta="⋯ Sección" titulo={`Pegar o copiar ${bloque}`} grupos={menuSeccion(bloque)} />}
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

      {eleccion && <Dialogo {...eleccion} onCerrar={() => setEleccion(null)} />}
    </div>
  )
}

// Menú de acciones como <select> nativo: en el celular abre el selector del sistema.
//   grupos = [{ titulo, items: [{ texto, accion, disabled }] }]  (los grupos o ítems vacíos/falsos se omiten)
function MenuAcciones({ etiqueta, titulo, grupos, destacado = false }) {
  const limpios = grupos
    .map((g) => ({ ...g, items: (g.items ?? []).filter(Boolean) }))
    .filter((g) => g.items.length)
  const elegir = (e) => {
    const [g, i] = e.target.value.split('-').map(Number)
    e.target.value = ''
    limpios[g]?.items[i]?.accion()
  }
  return (
    <select value="" onChange={elegir} title={titulo} aria-label={titulo}
      className={`max-w-56 cursor-pointer rounded-lg px-2.5 py-1.5 text-sm outline-none ${
        destacado
          ? 'bg-white font-semibold text-neutral-950'
          : 'border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'
      }`}>
      <option value="" disabled>{etiqueta}</option>
      {limpios.map((g, gi) => (
        <optgroup key={g.titulo} label={g.titulo}>
          {g.items.map((it, ii) => (
            <option key={it.texto} value={`${gi}-${ii}`} disabled={it.disabled}>{it.texto}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function Dialogo({ titulo, texto, opciones, onCerrar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-5">
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          <p className="mt-1 text-sm text-neutral-400">{texto}</p>
        </div>
        <div className="flex flex-col gap-2">
          {opciones.map((o) => (
            <button key={o.texto} onClick={() => { onCerrar(); o.accion() }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                o.principal ? 'bg-white text-neutral-950' : o.peligro ? 'border border-red-800 text-red-300 hover:bg-red-950' : 'border border-neutral-700'
              }`}>
              {o.texto}
            </button>
          ))}
          <button onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-white">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function BloqueEditor({ bloque, items, ejercicios, accion, onCambiar, onMover, onUnir, onSeparar, onQuitar, onAgregar }) {
  // Entrada en calor y Estiramientos: sin descanso ni bi-series
  const conDescanso = llevaDescanso(bloque)
  const cs = conDescanso ? cadenas(items) : items.map((i) => [i])
  const st = estiloSeccion(bloque)
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${st.panel}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${st.chip}`}>
          <span aria-hidden>{st.icono}</span><h3>{bloque}</h3>
        </div>
        {accion}
      </div>
      {items.length === 0 && <p className="text-sm text-neutral-400">Sin ejercicios en esta sección.</p>}
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
              <div className={`space-y-2 rounded-xl border-2 p-2 ${CADENA.caja}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CADENA.etiqueta}`}>
                    {nombreCadena(c.length)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 hidden text-xs text-fuchsia-200 sm:inline">Sin descanso entre ejercicios, descansa al final</span>
                    <BotonIcono titulo="Subir" disabled={!mover.onSubir} onClick={mover.onSubir}>↑</BotonIcono>
                    <BotonIcono titulo="Bajar" disabled={!mover.onBajar} onClick={mover.onBajar}>↓</BotonIcono>
                    <button type="button" onClick={() => onSeparar(n)} className="rounded-md px-2 py-1 text-xs text-fuchsia-200 hover:bg-fuchsia-900/60">
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
                className="block w-full text-center text-xs text-neutral-400 hover:text-fuchsia-300"
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
    // Celular (12 columnas): ejercicio | series · reps · descanso | observación · botones
    // Pantalla ancha: todo en una fila
    <div className="grid grid-cols-12 gap-2 rounded-lg bg-neutral-950/70 p-2">
      <SelectorEjercicio value={it.ejercicio_id} ejercicios={ejercicios} className={`${claseInput} col-span-12 sm:col-span-4`}
        onChange={(v) => onCambiar('ejercicio_id', v)} />
      <input type="number" min="1" value={it.series} onChange={(e) => onCambiar('series', e.target.value)}
        title="Series" placeholder="Series" className={`${claseInput} col-span-3 sm:col-span-1`} />
      <input value={it.repeticiones} onChange={(e) => onCambiar('repeticiones', e.target.value)}
        title="Repeticiones" placeholder="Reps (8, 30s…)" className={`${claseInput} ${conDescanso ? 'col-span-4' : 'col-span-9'} sm:col-span-2`} />
      {!conDescanso ? null : sinDescanso ? (
        <div className="col-span-5 flex items-center text-xs text-fuchsia-300 sm:col-span-2">sin descanso ↓</div>
      ) : (
      <div className="col-span-5 flex sm:col-span-2" title={`Descanso. Vacío = "${TEXTO_VAMOS}"`}>
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
        className={`${claseInput} col-span-8 ${conDescanso ? 'sm:col-span-2' : 'sm:col-span-4'}`} />
      <div className="col-span-4 flex items-center justify-end gap-1 sm:col-span-1">
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
