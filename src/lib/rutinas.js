// ---------------------------------------------------------------
// Lógica de rutinas compartida entre el editor del coach,
// la vista del alumno y (más adelante) plantillas y copiar/pegar.
// Funciones puras: no tocan React ni Supabase.
//
// "Payload" = el formato que recibe la RPC guardar_rutina (p_dias):
//   [{ nombre, items: [{ ejercicio_id, bloque, series, repeticiones, descanso_seg, nota, grupo }] }]
//
// Bi-series: ejercicios seguidos del mismo bloque que se hacen sin descanso
// entre ellos. En la base comparten el mismo `grupo` (número por día); el
// descanso se toma del último. En el editor cada ítem tiene `enlazado`:
// true = "va unido al ejercicio de abajo".
// ---------------------------------------------------------------

export const MAX_DIAS = 7

let siguienteClave = 1
export const clave = () => `k${siguienteClave++}`

// ---- Descanso -------------------------------------------------
// En la base se guarda siempre en segundos (descanso_seg).
// El coach lo carga en segundos o minutos. Vacío = largar con el ¡VAMOS! del crono.
// Entrada en calor y Estiramientos NO llevan descanso ni bi-series.

export const BLOQUES_SIN_DESCANSO = ['Entrada en calor', 'Estiramientos']
export const llevaDescanso = (bloque) => !BLOQUES_SIN_DESCANSO.includes(bloque)

export const UNIDADES_DESCANSO = ['seg', 'min']

// segundos → { descanso, unidad } para el editor
export function descansoAEditor(seg) {
  if (seg == null || seg === '') return { descanso: '', unidad: 'seg' }
  const n = Number(seg)
  if (n >= 60 && n % 30 === 0) return { descanso: String(n / 60), unidad: 'min' }
  return { descanso: String(n), unidad: 'seg' }
}

// { descanso, unidad } del editor → segundos (o null si está vacío)
export function descansoASeg(descanso, unidad) {
  const txt = String(descanso ?? '').trim().replace(',', '.')
  if (txt === '') return null
  const n = Number(txt)
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(unidad === 'min' ? n * 60 : n)
}

// Texto para el alumno. null = no cargó descanso → se larga con el ¡VAMOS!
export function textoDescanso(seg) {
  if (seg == null) return null
  if (seg === 0) return 'sin descanso'
  if (seg < 60) return `${seg} seg`
  const min = Math.floor(seg / 60)
  const resto = seg % 60
  return resto ? `${min}:${String(resto).padStart(2, '0')} min` : `${min} min`
}

export const TEXTO_VAMOS = 'Largá con el ¡VAMOS!'

// ---- Estado del editor ----------------------------------------

export const itemVacio = (bloque) => ({
  key: clave(), ejercicio_id: '', bloque, series: 3, repeticiones: '', descanso: '', unidad: 'seg', nota: '', enlazado: false,
})

// ---- Bi-series en el editor -----------------------------------

// Ítems de un bloque (en orden) → cadenas: [[a], [b, c], [d]] donde [b, c] es una bi-serie
export function cadenas(itemsDelBloque) {
  const res = []
  let actual = []
  itemsDelBloque.forEach((it, n) => {
    actual.push(it)
    const ultimo = n === itemsDelBloque.length - 1
    if (!it.enlazado || ultimo) { res.push(actual); actual = [] }
  })
  return res
}

export const nombreCadena = (n) => (n === 2 ? 'Bi-serie' : n === 3 ? 'Tri-serie' : `Circuito de ${n}`)

// Reemplaza los ítems de un bloque dentro del día respetando los de los otros bloques
export const conBloque = (items, bloque, nuevos) => [...items.filter((i) => i.bloque !== bloque), ...nuevos]
export const diaVacio = () => ({ key: clave(), nombre: '', items: [] })

// payload (p_dias, plantilla o rutina copiada) → días del editor
export function desdePayload(dias) {
  return (dias ?? []).map((d) => ({
    key: clave(),
    nombre: d.nombre ?? '',
    items: (d.items ?? []).map((i, n, todos) => ({
      key: clave(),
      ejercicio_id: i.ejercicio_id ?? '',
      bloque: i.bloque,
      series: i.series ?? 3,
      repeticiones: i.repeticiones ?? '',
      ...descansoAEditor(i.descanso_seg),
      nota: i.nota ?? '',
      enlazado: i.grupo != null && siguienteDelBloque(todos, n)?.grupo === i.grupo,
    })),
  }))
}

const siguienteDelBloque = (items, n) => items.slice(n + 1).find((x) => x.bloque === items[n].bloque)

// Filas anidadas de Supabase (rutina_dias → rutina_items) → payload ordenado
export function payloadDesdeBase(rutinaDias) {
  return [...(rutinaDias ?? [])]
    .sort((a, b) => a.numero_dia - b.numero_dia)
    .map((d) => ({
      nombre: d.nombre ?? '',
      items: [...(d.rutina_items ?? [])].sort((a, b) => a.orden - b.orden),
    }))
}

// días del editor → payload para guardar_rutina
// Los ítems salen agrupados por bloque; cada cadena de 2+ recibe un número de grupo
// y solo el último ejercicio de la cadena conserva el descanso.
export function aPayload(dias) {
  return dias.map((d) => {
    const bloques = [...new Set(d.items.map((i) => i.bloque))]
    let grupo = 0
    const items = []
    for (const b of bloques) {
      for (const cadena of cadenas(d.items.filter((i) => i.bloque === b))) {
        const g = cadena.length > 1 && llevaDescanso(b) ? ++grupo : null
        cadena.forEach((i, n) => items.push({
          ejercicio_id: i.ejercicio_id,
          bloque: i.bloque,
          series: Number(i.series),
          repeticiones: String(i.repeticiones).trim(),
          descanso_seg: n < cadena.length - 1 || !llevaDescanso(b) ? null : descansoASeg(i.descanso, i.unidad),
          nota: i.nota.trim(),
          grupo: g,
        }))
      }
    }
    return { nombre: d.nombre.trim(), items }
  })
}

// Devuelve el primer problema encontrado (texto para mostrar) o null si está todo bien
export function validarRutina({ nombre, dias }, { exigirNombre = true } = {}) {
  if (exigirNombre && !String(nombre ?? '').trim()) return 'Poné un nombre a la rutina.'
  if (!dias.length) return 'La rutina necesita al menos un día.'
  for (const [n, d] of dias.entries()) {
    if (d.items.length === 0) return `El Día ${n + 1} no tiene ejercicios.`
    for (const it of d.items) {
      if (!it.ejercicio_id) return `Día ${n + 1}: hay un ejercicio sin elegir.`
      if (!(Number(it.series) >= 1)) return `Día ${n + 1}: las series tienen que ser 1 o más.`
      if (!String(it.repeticiones).trim()) return `Día ${n + 1}: faltan repeticiones (ej: 8, 30s, máx).`
      if (!llevaDescanso(it.bloque)) continue
      if (Number.isNaN(descansoASeg(it.descanso, it.unidad))) return `Día ${n + 1}: revisá el descanso (un número, o vacío para el ¡VAMOS!).`
      if ((descansoASeg(it.descanso, it.unidad) ?? 0) > 1800) return `Día ${n + 1}: el descanso no puede pasar de 30 minutos.`
    }
    for (const b of new Set(d.items.map((i) => i.bloque))) {
      for (const c of cadenas(d.items.filter((i) => i.bloque === b))) {
        if (c.length > 1 && llevaDescanso(b) && new Set(c.map((i) => Number(i.series))).size > 1)
          return `Día ${n + 1}: en una ${nombreCadena(c.length).toLowerCase()} todos los ejercicios llevan las mismas series.`
      }
    }
  }
  return null
}

// ---- Plantillas y copiar/pegar por nivel ----------------------
// Tres niveles, tanto para plantillas como para copiar/pegar:
//   · Sección      → un bloque de un día (ej. el calentamiento de piernas)
//   · Día          → un día completo con todas sus secciones
//   · Planificación → todos los días (la semana)
// Pegar nunca borra lo que no corresponde: pegar una sección reemplaza solo
// esa sección del día; pegar un día reemplaza solo ese día; una planificación
// se puede agregar al final o reemplazar todo (lo elige el coach).

export const BLOQUE_CALENTAMIENTO = 'Entrada en calor'
export const NIVELES = { seccion: 'Sección', dia: 'Día', planificacion: 'Planificación' }

// ¿El día tiene algún ejercicio? (para no pedir confirmación si está vacío)
export const diaConEjercicios = (d) => d.items.length > 0
export const rutinaConEjercicios = (dias) => dias.some(diaConEjercicios)

// Contenido a copiar / guardar como plantilla, en formato payload
export const payloadSeccion = (dia, bloque) =>
  aPayload([{ nombre: '', items: dia.items.filter((i) => i.bloque === bloque) }])
export const payloadDia = (dia) => aPayload([dia])
export const payloadPlanificacion = (dias) => aPayload(dias)

// Reemplaza los ejercicios de UNA sección del día por los del payload (el resto del día queda igual)
export function pegarSeccion(dia, bloque, payload) {
  const nuevos = desdePayload([{ items: payload?.[0]?.items ?? [] }])[0].items.map((i) => ({ ...i, bloque }))
  return { ...dia, items: conBloque(dia.items, bloque, nuevos) }
}

// Reemplaza un día entero; si la plantilla no trae nombre de día, conserva el actual
export function pegarDia(dia, payload) {
  const [nuevo] = desdePayload(payload)
  return { ...nuevo, nombre: nuevo.nombre || dia.nombre }
}

// Agrega días al final sin pasar de MAX_DIAS. Devuelve cuántos entraron y cuántos no.
export function agregarDias(dias, payload) {
  const lugar = Math.max(0, MAX_DIAS - dias.length)
  const nuevos = desdePayload(payload)
  return { dias: [...dias, ...nuevos.slice(0, lugar)], agregados: Math.min(lugar, nuevos.length), descartados: Math.max(0, nuevos.length - lugar) }
}

// Rutina del editor → copia independiente (claves nuevas)
export const clonarDias = (dias) => desdePayload(aPayload(dias))

// Plantillas de un nivel (y sección), ordenadas por nombre
export const plantillasDe = (plantillas, tipo, bloque = null) =>
  (plantillas ?? []).filter((p) => p.tipo === tipo && (tipo !== NIVELES.seccion || p.bloque === bloque))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

// ---- Vista del alumno -----------------------------------------

// Filas planas de v_rutina_alumno → días con sus ítems ordenados
export function agruparPorDia(filas) {
  const dias = new Map()
  for (const f of filas) {
    if (!dias.has(f.numero_dia)) dias.set(f.numero_dia, { numero: f.numero_dia, nombre: f.dia, items: [] })
    if (f.item_id) dias.get(f.numero_dia).items.push(f)
  }
  return [...dias.values()]
    .sort((a, b) => a.numero - b.numero)
    .map((d) => ({ ...d, items: d.items.sort((a, b) => a.orden - b.orden) }))
}

// Ítems ya ordenados de un bloque (filas de la vista) → cadenas según `grupo`
export function cadenasPorGrupo(items) {
  const res = []
  for (const it of items) {
    const ult = res[res.length - 1]
    if (ult && it.grupo != null && ult[0].grupo === it.grupo) ult.push(it)
    else res.push([it])
  }
  return res
}
