import type { Ticket } from '@shared/ticket'

/**
 * En Restix, los tickets cuyo destino tiene impresora elegida salen directo. En la muestra no hay impresoras: todos
 * quedan "pendientes" y se muestran en pantalla (vista previa).
 */
export async function imprimirDirecto(tickets: Ticket[]): Promise<{ impresos: Ticket[]; pendientes: Ticket[]; error: string | null }> {
  return { impresos: [], pendientes: tickets, error: null }
}
