import type { Unidad } from '@shared/types'

// ---------- Dinero (se guarda en centavos) ----------

const PESOS_ENTEROS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const PESOS_CON_CENTAVOS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 900000 → "9.000" · 935050 → "9.350,50" (los centavos solo se muestran si hay) */
export function precioParaCampo(centavos: number): string {
  return (centavos % 100 === 0 ? PESOS_ENTEROS : PESOS_CON_CENTAVOS).format(centavos / 100)
}

/** 900000 → "$ 9.000" · 935050 → "$ 9.350,50" */
export function formatearPrecio(centavos: number): string {
  return `$ ${precioParaCampo(centavos)}`
}

/**
 * Lee un precio escrito a mano y lo devuelve en centavos (null si no se entiende).
 * Acepta "9000", "9.000", "$ 9.000", "9.000,50", "9000,5".
 */
export function leerPrecio(texto: string): number | null {
  let t = texto.replace(/[$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.') // "9.000,50" → "9000.50"
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '') // "9.000" son miles, no decimales
  }
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

// ---------- Cantidades de insumos (se guardan en u, g o ml) ----------

const NUMERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

/** 1500 g → "1,5 kg" · 200 g → "200 g" · 50000 ml → "50 L" · 3 u → "3 u" */
export function formatearCantidad(cantidad: number, unidad: Unidad): string {
  const abs = Math.abs(cantidad)
  if (unidad === 'g' && abs >= 1000) return `${NUMERO.format(cantidad / 1000)} kg`
  if (unidad === 'ml' && abs >= 1000) return `${NUMERO.format(cantidad / 1000)} L`
  return `${NUMERO.format(cantidad)} ${unidad}`
}

/** Unidades en que se puede escribir una cantidad, con su factor a la unidad base. */
export const UNIDADES_ENTRADA: Record<Unidad, { etiqueta: string; factor: number }[]> = {
  u: [{ etiqueta: 'u', factor: 1 }],
  g: [
    { etiqueta: 'g', factor: 1 },
    { etiqueta: 'kg', factor: 1000 }
  ],
  ml: [
    { etiqueta: 'ml', factor: 1 },
    { etiqueta: 'L', factor: 1000 }
  ]
}

export const NOMBRE_UNIDAD: Record<Unidad, string> = {
  u: 'Unidades',
  g: 'Peso (g / kg)',
  ml: 'Volumen (ml / L)'
}

/**
 * Lee una cantidad escrita a mano, en formato argentino como la muestran los campos (null si no se entiende):
 * "0,2" → 0.2 · "1.550" → 1550 (punto de miles) · "1.550,5" → 1550.5 · "1.5" → 1.5 (punto suelto = decimal).
 * Antes "1.550" se leía como 1,55: una receta con 1550 g se guardaba como 1,55 g al tocar Guardar.
 */
export function leerNumero(texto: string): number | null {
  let t = texto.replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.') // "1.550,5" → "1550.5"
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '') // "1.550" son miles, no decimales
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Cómo mostrar una cantidad base dentro de un campo: la unidad más cómoda y el número. */
export function cantidadParaCampo(cantidad: number, unidad: Unidad): { valor: string; factor: number } {
  const grande = UNIDADES_ENTRADA[unidad][1]
  if (grande && cantidad >= grande.factor && cantidad % 100 === 0) {
    return { valor: NUMERO.format(cantidad / grande.factor), factor: grande.factor }
  }
  return { valor: NUMERO.format(cantidad), factor: 1 }
}
