import type { Insumo } from '@shared/types'

export type EstadoStock = 'ok' | 'bajo' | 'sin'

export const NOMBRE_ESTADO_STOCK: Record<EstadoStock, string> = {
  ok: 'OK',
  bajo: 'Bajo',
  sin: 'Sin stock'
}

/** Sin stock: 0 o menos · Bajo: en el mínimo o debajo · OK: por encima del mínimo */
export function estadoStock(i: Insumo): EstadoStock {
  if (i.stock <= 0) return 'sin'
  if (i.stock <= i.stock_minimo) return 'bajo'
  return 'ok'
}

/** Avisa al resto de la app (el globito del menú) que el stock cambió. */
export function avisarCambioStock(): void {
  window.dispatchEvent(new Event('stock-cambiado'))
}
