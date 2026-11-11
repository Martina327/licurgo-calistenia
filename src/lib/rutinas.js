// ---------------------------------------------------------------
// Lógica de rutinas compartida entre el editor del coach,
// la vista del alumno y (más adelante) plantillas y copiar/pegar.
// Funciones puras: no tocan React ni Supabase.
//
// "Payload" = el formato que recibe la RPC guardar_rutina (p_dias):
//   [{ nombre, items: [{ ejercicio_id, bloque, series, repeticiones, descanso_seg, nota }] }]
// ---------------------------------------------------------------

export const MAX_DIAS = 7

let siguienteClave = 1
export const clave = () => `k${siguienteClave++}`

// ---- Descanso -------------------------------------------------
// En la base se guarda siempre en segundos (descanso_seg).
// El coach lo carga en segundos o minutos. Vacío = largar con el ¡VAMOS! del crono.

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
  key: clave(), ejercicio_id: '', bloque, series: 3, repeticiones: '', descanso: '', unidad: 'seg', nota: '',
})
export const diaVacio = () => ({ key: clave(), nombre: '', items: [] })

// payload (p_dias, plantilla o rutina copiada) → días del editor
export function desdePayload(dias) {
  return (dias ?? []).map((d) => ({
    key: clave(),
    nombre: d.nombre ?? '',
    items: (d.items ?? []).map((i) => ({
      key: clave(),
      ejercicio_id: i.ejercicio_id ?? '',
      bloque: i.bloque,
      series: i.series ?? 3,
      repeticiones: i.repeticiones ?? '',
      ...descansoAEditor(i.descanso_seg),
      nota: i.nota ?? '',
    })),
  }))
}

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
export function aPayload(dias) {
  return dias.map((d) => ({
    nombre: d.nombre.trim(),
    items: d.items.map((i) => ({
      ejercicio_id: i.ejercicio_id,
      bloque: i.bloque,
      series: Number(i.series),
      repeticiones: String(i.repeticiones).trim(),
      descanso_seg: descansoASeg(i.descanso, i.unidad),
      nota: i.nota.trim(),
    })),
  }))
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
      if (Number.isNaN(descansoASeg(it.descanso, it.unidad))) return `Día ${n + 1}: revisá el descanso (un número, o vacío para el ¡VAMOS!).`
      if ((descansoASeg(it.descanso, it.unidad) ?? 0) > 1800) return `Día ${n + 1}: el descanso no puede pasar de 30 minutos.`
    }
  }
  return null
}

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
