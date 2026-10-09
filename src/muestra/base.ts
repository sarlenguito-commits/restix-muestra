// Backend de la muestra: todo vive en memoria y se guarda en el navegador (localStorage).
// En Restix esto es una base SQLite en la PC del local; acá es un objeto con una lista por "tabla".

import type {
  Canal,
  Caja,
  Categoria,
  ComandaItem,
  Elemento,
  EstadoComanda,
  Insumo,
  MedioPago,
  MovimientoCaja,
  MovimientoStock,
  Mozo,
  Producto,
  Resultado,
  Salon,
  Tema,
  TipoDescuento,
  TurnoCaja
} from '@shared/types'
import type { DatosLocal } from '@shared/ticket'

export interface ComandaGuardada {
  id: number
  elemento_id: number | null
  mesa_nombre: string
  mozo_id: number | null
  comensales: number | null
  estado: EstadoComanda
  abierta_en: string
  cuenta_impresa_en: string | null
  cerrada_en: string | null
  canal: Canal
  pedido_ref: string | null
  cliente_nombre: string | null
  cliente_direccion: string | null
  cliente_telefono: string | null
  /** Si se unió a otra mesa, a cuál comanda */
  unida_a: number | null
}

export interface CuentaGuardada {
  id: number
  comanda_id: number
  nombre: string
  por_items: boolean
  estado: 'pendiente' | 'cobrada'
  descuento_tipo: TipoDescuento | null
  descuento_valor: number | null
  descuento_motivo: string | null
  /** Importes "congelados" al cobrar (una cuenta pendiente se calcula en vivo) */
  subtotal: number | null
  descuento: number | null
  total: number | null
  turno_id: number | null
  cobrada_en: string | null
}

export interface ParteGuardada {
  cuenta_id: number
  comanda_item_id: number
  cantidad: number
  importe: number
}

export interface PagoGuardado {
  id: number
  cuenta_id: number
  medio: MedioPago
  monto: number
  recibido: number | null
  turno_id: number
}

export interface Datos {
  ultimoId: number
  salones: Salon[]
  elementos: Elemento[]
  categorias: Categoria[]
  productos: Producto[]
  insumos: Insumo[]
  recetas: { producto_id: number; insumo_id: number; cantidad: number }[]
  movimientosStock: (MovimientoStock & { comanda_item_id: number | null })[]
  mozos: Mozo[]
  comandas: ComandaGuardada[]
  items: ComandaItem[]
  cuentas: CuentaGuardada[]
  partes: ParteGuardada[]
  pagos: PagoGuardado[]
  correcciones: { cuenta_id: number; antes: string; despues: string }[]
  turnos: (TurnoCaja & { efectivo_contado_grande: number | null })[]
  movimientosCaja: Omit<MovimientoCaja, 'persona'>[]
  local: DatosLocal
  tema: Tema
  /** % que cobra Pedidos Ya sobre cada pedido */
  comisionPedidosYa: number
}

export type { Caja }

// ---------- Estado actual ----------

let datos: Datos | null = null

export function db(): Datos {
  if (!datos) throw new Error('La muestra todavía no cargó sus datos.')
  return datos
}

export function usarDatos(d: Datos): void {
  datos = d
}

export function nuevoId(): number {
  return ++db().ultimoId
}

// ---------- Reloj ----------
// Fecha y hora local "AAAA-MM-DD HH:MM:SS", como las guarda Restix. Se puede mover para armar el historial de muestra.

let corrimientoMs = 0

export function moverReloj(ms: number): void {
  corrimientoMs = ms
}

const dos = (n: number) => String(n).padStart(2, '0')

export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
}

export function ahora(): string {
  return fechaLocal(new Date(Date.now() + corrimientoMs))
}

// ---------- Resultados y validaciones ----------

export const ok = <T>(dato: T): Resultado<T> => ({ ok: true, dato })
export const falla = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Texto sin espacios de más; null/undefined → '' */
export const textoLimpio = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ')

/** Número de verdad (ni NaN ni infinito) */
export const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Mismo texto sin importar mayúsculas (para no repetir nombres) */
export const mismoNombre = (a: string | null, b: string | null) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

/** Copia profunda: lo que sale del backend nunca es el mismo objeto que está guardado */
export const copia = <T>(v: T): T => structuredClone(v)

// ---------- Guardado en el navegador ----------

const CLAVE = 'restix-muestra-v1'

export function leerGuardado(): Datos | null {
  try {
    const texto = localStorage.getItem(CLAVE)
    return texto ? (JSON.parse(texto) as Datos) : null
  } catch {
    return null
  }
}

export function guardar(): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db()))
  } catch {
    // Sin localStorage (modo privado): la muestra anda igual, solo que no recuerda nada al recargar
  }
}

export function borrarGuardado(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // nada que borrar
  }
}
