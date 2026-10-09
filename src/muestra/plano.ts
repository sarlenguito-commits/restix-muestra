import {
  esComandable,
  type CambiosElemento,
  type Elemento,
  type EstadoMesa,
  type FormaMesa,
  type NuevoElemento,
  type Resultado,
  type Salon,
  type TipoElemento
} from '@shared/types'
import { copia, db, falla, mismoNombre, nuevoId, numeroValido, ok, textoLimpio } from './base'
import { EN_CURSO, tieneComandaEnCurso } from './comandas'

const TIPOS: TipoElemento[] = ['mesa', 'pared', 'barra', 'puerta', 'columna', 'planta', 'texto']
const FORMAS: FormaMesa[] = ['cuadrada', 'rectangular']

/** Tamaño inicial de cada elemento nuevo (en píxeles del plano). */
export function tamanioInicial(tipo: TipoElemento, forma: FormaMesa | null): { ancho: number; alto: number } {
  switch (tipo) {
    case 'mesa':
      return forma === 'rectangular' ? { ancho: 140, alto: 80 } : { ancho: 80, alto: 80 }
    case 'pared':
      return { ancho: 200, alto: 12 }
    case 'barra':
      return { ancho: 240, alto: 60 }
    case 'puerta':
      return { ancho: 80, alto: 12 }
    case 'columna':
      return { ancho: 30, alto: 30 }
    case 'planta':
      return { ancho: 40, alto: 40 }
    case 'texto':
      return { ancho: 120, alto: 30 }
  }
}

// ---------- Salones ----------

/** Primero los salones comunes (el primero es el que se abre al entrar), después Pedidos Ya y Delivery. */
export function listarSalones(): Salon[] {
  const lista = [...db().salones].sort(
    (a, b) => Number(a.tipo !== 'salon') - Number(b.tipo !== 'salon') || a.orden - b.orden || a.id - b.id
  )
  return copia(lista)
}

export function crearSalon(nombre: string): Resultado<Salon> {
  const limpio = textoLimpio(nombre)
  if (!limpio) return falla('El salón necesita un nombre.')
  const orden = Math.max(-1, ...db().salones.map((s) => s.orden)) + 1
  const salon: Salon = { id: nuevoId(), nombre: limpio, orden, tipo: 'salon' }
  db().salones.push(salon)
  return ok(copia(salon))
}

export function renombrarSalon(id: number, nombre: string): Resultado<Salon> {
  const limpio = textoLimpio(nombre)
  if (!limpio) return falla('El salón necesita un nombre.')
  const salon = db().salones.find((s) => s.id === id)
  if (!salon) return falla('El salón no existe.')
  salon.nombre = limpio
  return ok(copia(salon))
}

export function borrarSalon(id: number): Resultado<null> {
  const d = db()
  const salon = d.salones.find((s) => s.id === id)
  if (!salon) return falla('El salón no existe.')
  if (salon.tipo !== 'salon') return falla('Las pestañas Pedidos Ya y Delivery no se pueden borrar.')
  if (d.salones.filter((s) => s.tipo === 'salon').length <= 1) return falla('Tiene que quedar al menos un salón.')
  const delSalon = new Set(d.elementos.filter((e) => e.salon_id === id).map((e) => e.id))
  const enUso = d.comandas.filter((c) => c.elemento_id !== null && delSalon.has(c.elemento_id) && EN_CURSO.includes(c.estado))
  if (enUso.length) return falla(`El salón tiene mesas en uso (${enUso.map((c) => c.mesa_nombre).join(', ')}). Cerralas primero.`)
  d.elementos = d.elementos.filter((e) => e.salon_id !== id)
  d.salones = d.salones.filter((s) => s.id !== id)
  return ok(null)
}

// ---------- Elementos ----------

export function listarElementos(salonId: number): Elemento[] {
  return copia(db().elementos.filter((e) => e.salon_id === salonId).sort((a, b) => a.capa - b.capa || a.id - b.id))
}

const comandables = () => db().elementos.filter((e) => esComandable(e.tipo))

/** Nombre libre para una barra nueva: "Barra", después "Barra 2", "Barra 3"… */
function siguienteNombreBarra(): string {
  const usados = new Set(comandables().map((e) => (e.nombre ?? '').toLowerCase()))
  if (!usados.has('barra')) return 'Barra'
  let n = 2
  while (usados.has(`barra ${n}`)) n++
  return `Barra ${n}`
}

/** Siguiente número libre para una mesa: si existen 1, 2 y 5 devuelve "6". */
function siguienteNombreMesa(): string {
  const numeros = db()
    .elementos.filter((e) => e.tipo === 'mesa')
    .map((e) => Number(e.nombre))
    .filter((n) => Number.isInteger(n))
  return String(numeros.length ? Math.max(...numeros) + 1 : 1)
}

/** Mesas y barras no pueden repetir nombre (en ningún salón): es lo que se ve en la comanda y en el ticket. */
const nombreOcupado = (nombre: string, salvoId?: number) =>
  comandables().some((e) => e.id !== salvoId && mismoNombre(e.nombre, nombre))

export function crearElemento(datos: NuevoElemento): Resultado<Elemento> {
  const d = db()
  if (!TIPOS.includes(datos.tipo)) return falla('Tipo de elemento inválido.')
  if (!d.salones.some((s) => s.id === datos.salon_id)) return falla('El salón no existe.')
  if (!numeroValido(datos.x) || !numeroValido(datos.y)) return falla('Posición inválida.')

  const esMesa = datos.tipo === 'mesa'
  const forma = esMesa ? (FORMAS.includes(datos.forma as FormaMesa) ? datos.forma! : 'cuadrada') : null
  const nombre = esMesa
    ? textoLimpio(datos.nombre) || siguienteNombreMesa()
    : datos.tipo === 'barra'
      ? textoLimpio(datos.nombre) || siguienteNombreBarra()
      : datos.tipo === 'texto'
        ? textoLimpio(datos.nombre) || 'Texto'
        : null
  if (nombre && esComandable(datos.tipo) && nombreOcupado(nombre)) return falla(`Ya existe una mesa o barra llamada "${nombre}".`)
  const capa = Math.max(-1, ...d.elementos.filter((e) => e.salon_id === datos.salon_id).map((e) => e.capa)) + 1
  const elemento: Elemento = {
    id: nuevoId(),
    salon_id: datos.salon_id,
    tipo: datos.tipo,
    forma,
    nombre,
    lugares: forma ? (forma === 'rectangular' ? 6 : 4) : null,
    x: datos.x,
    y: datos.y,
    ...tamanioInicial(datos.tipo, forma),
    rotacion: 0,
    capa
  }
  d.elementos.push(elemento)
  return ok(copia(elemento))
}

export function actualizarElemento(id: number, cambios: CambiosElemento): Resultado<Elemento> {
  const el = db().elementos.find((e) => e.id === id)
  if (!el) return falla('El elemento no existe.')

  // Se valida todo antes de tocar nada: o se guardan todos los cambios o ninguno
  const nuevo: Elemento = { ...el }
  for (const k of ['x', 'y', 'rotacion', 'capa'] as const) {
    if (k in cambios) {
      if (!numeroValido(cambios[k])) return falla(`Valor inválido para ${k}.`)
      nuevo[k] = cambios[k]!
    }
  }
  for (const k of ['ancho', 'alto'] as const) {
    if (k in cambios) {
      if (!numeroValido(cambios[k]) || cambios[k]! < 5) return falla('El tamaño es demasiado chico.')
      nuevo[k] = cambios[k]!
    }
  }
  if (el.tipo === 'mesa') {
    if ('forma' in cambios) {
      if (!FORMAS.includes(cambios.forma as FormaMesa)) return falla('Forma de mesa inválida.')
      nuevo.forma = cambios.forma!
    }
    if ('lugares' in cambios) {
      const l = cambios.lugares
      if (!Number.isInteger(l) || l! < 1 || l! > 99) return falla('Los lugares deben ser entre 1 y 99.')
      nuevo.lugares = l!
    }
  }
  if ('nombre' in cambios && (esComandable(el.tipo) || el.tipo === 'texto')) {
    const nombre = textoLimpio(cambios.nombre)
    if (!nombre) return falla(el.tipo === 'texto' ? 'El texto no puede estar vacío.' : 'Necesita un nombre.')
    if (esComandable(el.tipo) && nombreOcupado(nombre, id)) return falla(`Ya existe una mesa o barra llamada "${nombre}".`)
    nuevo.nombre = nombre
  }
  Object.assign(el, nuevo)
  // Si la mesa tiene una comanda en curso, la cuenta tiene que salir con el nombre nuevo
  if ('nombre' in cambios)
    for (const c of db().comandas) if (c.elemento_id === id && EN_CURSO.includes(c.estado)) c.mesa_nombre = el.nombre ?? ''
  return ok(copia(el))
}

export function borrarElemento(id: number): Resultado<null> {
  const el = db().elementos.find((e) => e.id === id)
  if (!el) return ok(null)
  if (tieneComandaEnCurso(id))
    return falla(`${el.nombre} tiene una comanda en curso: cerrala o pasala a otra mesa antes de borrarla.`)
  db().elementos = db().elementos.filter((e) => e.id !== id)
  return ok(null)
}

/** Estado de cada mesa o barra del salón que tiene comanda en curso (las demás están libres). */
export function estadosMesas(salonId: number): Record<number, EstadoMesa> {
  const delSalon = new Set(db().elementos.filter((e) => e.salon_id === salonId).map((e) => e.id))
  const estados: Record<number, EstadoMesa> = {}
  for (const c of db().comandas)
    if (c.elemento_id !== null && delSalon.has(c.elemento_id) && EN_CURSO.includes(c.estado))
      estados[c.elemento_id] = c.estado === 'abierta' ? 'activa' : 'cobrando'
  return estados
}
