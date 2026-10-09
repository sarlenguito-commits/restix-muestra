// Tickets como renglones de texto de ancho fijo, igual que en una impresora térmica.
// El mismo formato sirve para la vista previa en pantalla y para imprimir.

import { MEDIOS_PAGO, NOMBRE_MEDIO, type Comanda, type ComandaItem, type Cuenta, type Destino, type ResumenTurno } from './types'

/** Caracteres por renglón en papel de 80 mm (fuente normal, con margen). */
export const ANCHO_TICKET = 42

export interface Renglon {
  texto: string
  /** grande: doble tamaño (ocupa el doble de ancho) */
  estilo?: 'normal' | 'negrita' | 'grande'
  alineado?: 'izquierda' | 'centro'
}

/** A qué impresora va: la de cocina, la de barra o la de caja (cuentas, comprobantes y cierres) */
export type DestinoImpresion = 'cocina' | 'barra' | 'caja'

export interface Ticket {
  titulo: string
  renglones: Renglon[]
  destino: DestinoImpresion
}

/** Impresora elegida en Ajustes para cada destino (null: se pregunta con el cuadro de Windows) */
export type Impresoras = Record<DestinoImpresion, string | null>

/** Una impresora instalada en Windows */
export interface ImpresoraDisponible {
  /** Nombre que entiende Windows (el que se guarda) */
  nombre: string
  /** Nombre para mostrar */
  descripcion: string
}

export interface DatosLocal {
  nombre: string
  direccion: string
  pie: string
}

// ---------- Ayudas de formato ----------

const PESOS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const PESOS_CENTAVOS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 900000 → "$9.000" (sin espacio: en el ticket el ancho es valioso) */
export function precioTicket(centavos: number): string {
  return `$${(centavos % 100 === 0 ? PESOS : PESOS_CENTAVOS).format(centavos / 100)}`
}

/** En texto grande entra la mitad de caracteres */
const ANCHO_GRANDE = ANCHO_TICKET / 2

const linea = (caracter = '-'): Renglon => ({ texto: caracter.repeat(ANCHO_TICKET) })
const centro = (texto: string, estilo: Renglon['estilo'] = 'normal'): Renglon => ({ texto, estilo, alineado: 'centro' })

/** Texto a la izquierda y a la derecha en el mismo renglón; si no entra, se corta el de la izquierda. */
function columnas(izquierda: string, derecha: string, ancho = ANCHO_TICKET): string {
  const espacio = ancho - derecha.length - 1
  const izq = izquierda.length > espacio ? izquierda.slice(0, espacio - 1) + '…' : izquierda
  return izq + ' '.repeat(ancho - izq.length - derecha.length) + derecha
}

/** Corta un texto largo en varios renglones, respetando las palabras (una palabra más larga que el renglón se parte). */
function partir(texto: string, ancho: number): string[] {
  const renglones: string[] = []
  let actual = ''
  const palabras = texto.split(/\s+/).flatMap((p) => (p.length > ancho ? (p.match(new RegExp(`.{1,${ancho}}`, 'g')) ?? [p]) : [p]))
  for (const palabra of palabras) {
    if ((actual + ' ' + palabra).trim().length > ancho) {
      if (actual) renglones.push(actual)
      actual = palabra
    } else actual = (actual + ' ' + palabra).trim()
  }
  if (actual) renglones.push(actual)
  return renglones
}

/** "Mesa 4" si el nombre es un número; si no, el nombre tal cual ("Barra principal") */
export function nombreMesa(nombre: string): string {
  return /^\d/.test(nombre) ? `Mesa ${nombre}` : nombre
}

/** Cómo se nombra una comanda: "Mesa 4", "Pedidos Ya #4821" o "Delivery · Marta" */
export function etiquetaComanda(c: Pick<Comanda, 'canal' | 'mesa_nombre' | 'pedido_ref' | 'cliente_nombre'>): string {
  if (c.canal === 'pedidosya') return `Pedidos Ya #${c.pedido_ref ?? '?'}`
  if (c.canal === 'delivery') return `Delivery · ${c.cliente_nombre ?? '?'}`
  return nombreMesa(c.mesa_nombre)
}

/** "1", "½", "⅓", "1½"… para partes de ítems compartidos */
export function cantidadLegible(c: number): string {
  const entero = Math.floor(c + 1e-6)
  const resto = c - entero
  if (resto < 0.01) return String(entero)
  const fracciones: [number, string][] = [
    [1 / 2, '½'],
    [1 / 3, '⅓'],
    [2 / 3, '⅔'],
    [1 / 4, '¼'],
    [3 / 4, '¾']
  ]
  const f = fracciones.find(([v]) => Math.abs(v - resto) < 0.01)
  if (f) return `${entero || ''}${f[1]}`
  return c.toFixed(2).replace('.', ',')
}

/** Fecha y hora actual en el formato de la base: "2026-09-24 12:47:05" */
export function ahora(): string {
  const d = new Date()
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:00`
}

/** "2026-09-24 12:47:05" → "24/09/2026 12:47" */
function fechaHora(fecha: string): string {
  const [dia, hora] = fecha.split(' ')
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a} ${hora?.slice(0, 5) ?? ''}`
}

/** Renglón de mozo y comensales (solo en el salón); en delivery, la dirección del cliente */
function lineaMozo(c: Comanda): Renglon[] {
  if (c.canal === 'salon') return [{ texto: columnas(`Mozo: ${c.mozo_nombre ?? '-'}`, c.comensales ? `${c.comensales} pers.` : '') }]
  if (c.canal === 'delivery' && c.cliente_direccion) return partir(c.cliente_direccion, ANCHO_TICKET).map((t) => ({ texto: t }))
  return []
}

// ---------- Comanda para cocina / barra ----------

export function ticketEnvio(comanda: Comanda, numero: number, items: ComandaItem[], destino: Destino): Ticket | null {
  const delDestino = items.filter((i) => i.destino === destino)
  if (!delDestino.length) return null
  const hora = delDestino[0].enviado_en?.slice(11, 16) ?? ''
  const renglones: Renglon[] = [centro(`*** ${destino.toUpperCase()} ***`, 'grande')]
  if (comanda.canal === 'pedidosya') {
    renglones.push(centro('PEDIDOS YA', 'grande'), centro(`#${comanda.pedido_ref ?? '?'}`, 'grande'))
  } else if (comanda.canal === 'delivery') {
    renglones.push(centro('DELIVERY', 'grande'))
    for (const r of partir((comanda.cliente_nombre ?? '').toUpperCase(), ANCHO_GRANDE)) renglones.push(centro(r, 'grande'))
    if (comanda.cliente_direccion) for (const r of partir(comanda.cliente_direccion, ANCHO_TICKET)) renglones.push(centro(r, 'negrita'))
    if (comanda.cliente_telefono) renglones.push(centro(`Tel. ${comanda.cliente_telefono}`))
  } else {
    renglones.push(...partir(nombreMesa(comanda.mesa_nombre).toUpperCase(), ANCHO_GRANDE).map((r) => centro(r, 'grande')))
  }
  renglones.push({ texto: columnas(`Envío ${numero}`, hora) })
  if (comanda.canal === 'salon')
    renglones.push({ texto: columnas(`Mozo: ${comanda.mozo_nombre ?? '-'}`, comanda.comensales ? `${comanda.comensales} pers.` : '') })
  renglones.push(linea('='))
  for (const i of delDestino) {
    const [primero, ...resto] = partir(i.nombre, ANCHO_GRANDE - 4)
    renglones.push({ texto: `${String(i.cantidad).padStart(2)}  ${primero}`, estilo: 'grande' })
    for (const r of resto) renglones.push({ texto: `    ${r}`, estilo: 'grande' })
    if (i.nota) for (const r of partir(`>> ${i.nota.toUpperCase()}`, ANCHO_TICKET - 4)) renglones.push({ texto: `    ${r}`, estilo: 'negrita' })
  }
  renglones.push(linea('='))
  return { titulo: destino === 'cocina' ? 'Cocina' : 'Barra', renglones, destino }
}

// ---------- Anulación para cocina / barra ----------

/** Lo que se anuló de un renglón (puede ser una parte: 1 de 3) */
export type ItemAnulado = Pick<ComandaItem, 'nombre' | 'nota' | 'destino' | 'entregado_en'> & { cantidad: number }

/**
 * Ticket "ANULADO" para que cocina o barra deje de preparar lo que se anuló.
 * No incluye lo que cocina ya marcó como entregado (ya salió: no hay nada que frenar).
 */
export function ticketAnulacion(
  comanda: Pick<Comanda, 'canal' | 'mesa_nombre' | 'pedido_ref' | 'cliente_nombre'>,
  items: ItemAnulado[],
  motivo: string,
  destino: Destino
): Ticket | null {
  const delDestino = items.filter((i) => i.destino === destino && !(destino === 'cocina' && i.entregado_en))
  if (!delDestino.length) return null
  const hora = ahora().slice(11, 16)
  const renglones: Renglon[] = [
    centro('*** ANULADO ***', 'grande'),
    ...partir(etiquetaComanda(comanda).toUpperCase(), ANCHO_GRANDE).map((r) => centro(r, 'grande')),
    { texto: columnas(destino === 'cocina' ? 'Cocina' : 'Barra', hora) },
    linea('=')
  ]
  for (const i of delDestino) {
    const [primero, ...resto] = partir(i.nombre, ANCHO_GRANDE - 4)
    renglones.push({ texto: `${String(i.cantidad).padStart(2)}  ${primero}`, estilo: 'grande' })
    for (const r of resto) renglones.push({ texto: `    ${r}`, estilo: 'grande' })
    if (i.nota) for (const r of partir(`(${i.nota})`, ANCHO_TICKET - 4)) renglones.push({ texto: `    ${r}` })
  }
  renglones.push(linea('='))
  for (const r of partir(`Motivo: ${motivo}`, ANCHO_TICKET)) renglones.push({ texto: r, estilo: 'negrita' })
  return { titulo: destino === 'cocina' ? 'Anulado cocina' : 'Anulado barra', renglones, destino }
}

/** Los tickets de anulación de cocina y barra (los que correspondan). */
export function ticketsAnulacion(
  comanda: Pick<Comanda, 'canal' | 'mesa_nombre' | 'pedido_ref' | 'cliente_nombre'>,
  items: ItemAnulado[],
  motivo: string
): Ticket[] {
  return (['cocina', 'barra'] as const).map((d) => ticketAnulacion(comanda, items, motivo, d)).filter((t): t is Ticket => t !== null)
}

// ---------- Cuenta (precuenta) ----------

export function ticketCuenta(comanda: Comanda, local: DatosLocal): Ticket {
  // Se agrupan los productos iguales (mismo nombre y precio) aunque hayan salido en distintos envíos
  const grupos = new Map<string, { nombre: string; precio: number; cantidad: number }>()
  for (const i of comanda.items) {
    if (i.estado === 'anulado') continue
    const clave = `${i.nombre}|${i.precio}`
    const g = grupos.get(clave) ?? { nombre: i.nombre, precio: i.precio, cantidad: 0 }
    g.cantidad += i.cantidad
    grupos.set(clave, g)
  }

  const renglones: Renglon[] = partir(local.nombre || 'Mi local', ANCHO_GRANDE).map((r) => centro(r, 'grande'))
  if (local.direccion) renglones.push(centro(local.direccion))
  renglones.push(
    { texto: '' },
    centro('CUENTA - NO VÁLIDO COMO FACTURA', 'negrita'),
    { texto: columnas(etiquetaComanda(comanda), fechaHora(comanda.cuenta_impresa_en ?? comanda.abierta_en)) },
    ...lineaMozo(comanda),
    linea(),
    { texto: columnas('Cant Producto', 'Importe') },
    linea()
  )
  for (const g of grupos.values()) {
    renglones.push({ texto: columnas(`${String(g.cantidad).padEnd(4)} ${g.nombre}`, precioTicket(g.precio * g.cantidad)) })
    if (g.cantidad > 1) renglones.push({ texto: `     ${g.cantidad} x ${precioTicket(g.precio)}` })
  }
  renglones.push(linea(), { texto: columnas('TOTAL', precioTicket(comanda.total), ANCHO_GRANDE), estilo: 'grande' }, linea())
  if (local.pie) for (const r of partir(local.pie, ANCHO_TICKET)) renglones.push(centro(r))
  return { titulo: 'Cuenta', renglones, destino: 'caja' }
}


// ---------- Cuenta de una persona (división por ítems) y comprobante de cobro ----------

function encabezadoLocal(local: DatosLocal): Renglon[] {
  const r = partir(local.nombre || 'Mi local', ANCHO_GRANDE).map((t) => centro(t, 'grande'))
  if (local.direccion) r.push(centro(local.direccion))
  r.push({ texto: '' })
  return r
}

/**
 * Ticket de una cuenta: cuenta previa (antes de cobrar) o comprobante de pago (ya cobrada, con los pagos).
 * fecha: cuándo se imprime la cuenta previa (la del comprobante es la del cobro).
 */
export function ticketDeCuenta(cuenta: Cuenta, comanda: Comanda, local: DatosLocal, fecha: string): Ticket {
  const cobrada = cuenta.estado === 'cobrada'
  const titulo = cuenta.por_items ? `${etiquetaComanda(comanda)} · ${cuenta.nombre}` : etiquetaComanda(comanda)

  // Se agrupan los iguales (mismo nombre y precio) sumando cantidades e importes
  const grupos = new Map<string, { nombre: string; precio: number; cantidad: number; importe: number }>()
  for (const i of cuenta.items) {
    const clave = `${i.nombre}|${i.precio}`
    const g = grupos.get(clave) ?? { nombre: i.nombre, precio: i.precio, cantidad: 0, importe: 0 }
    g.cantidad += i.cantidad
    g.importe += i.importe
    grupos.set(clave, g)
  }

  const renglones: Renglon[] = [
    ...encabezadoLocal(local),
    centro(cobrada ? 'COMPROBANTE DE PAGO' : 'CUENTA', 'negrita'),
    centro('NO VÁLIDO COMO FACTURA'),
    { texto: columnas(titulo, fechaHora(cuenta.cobrada_en ?? fecha)) },
    ...lineaMozo(comanda),
    linea(),
    { texto: columnas('Cant Producto', 'Importe') },
    linea()
  ]
  for (const g of grupos.values()) {
    renglones.push({ texto: columnas(`${cantidadLegible(g.cantidad).padEnd(4)} ${g.nombre}`, precioTicket(g.importe)) })
    if (g.cantidad > 1 && Number.isInteger(g.cantidad)) renglones.push({ texto: `     ${g.cantidad} x ${precioTicket(g.precio)}` })
  }
  renglones.push(linea())
  if (cuenta.descuento > 0) {
    renglones.push({ texto: columnas('Subtotal', precioTicket(cuenta.subtotal)) })
    const motivo = cuenta.descuento_motivo ? `Descuento (${cuenta.descuento_motivo})` : 'Descuento'
    renglones.push({ texto: columnas(motivo, `-${precioTicket(cuenta.descuento)}`) })
  }
  renglones.push({ texto: columnas('TOTAL', precioTicket(cuenta.total), ANCHO_GRANDE), estilo: 'grande' })

  if (cobrada && cuenta.pagos.length) {
    renglones.push(linea())
    for (const p of cuenta.pagos) {
      renglones.push({ texto: columnas(NOMBRE_MEDIO[p.medio], precioTicket(p.monto)) })
      if (p.recibido !== null && p.recibido > p.monto)
        renglones.push({ texto: `  Recibió ${precioTicket(p.recibido)} · Vuelto ${precioTicket(p.recibido - p.monto)}` })
    }
  }
  renglones.push(linea())
  if (local.pie) for (const r of partir(local.pie, ANCHO_TICKET)) renglones.push(centro(r))
  return {
    titulo: cobrada ? `Comprobante ${cuenta.por_items ? cuenta.nombre : ''}`.trim() : `Cuenta ${cuenta.nombre}`,
    renglones,
    destino: 'caja'
  }
}

// ---------- Cierre de caja ----------

const textoDiferencia = (d: number) => (d === 0 ? 'JUSTO' : d > 0 ? `SOBRA ${precioTicket(d)}` : `FALTA ${precioTicket(-d)}`)

/** Resumen del turno para imprimir al cerrar la caja (o para reimprimir uno viejo). */
export function ticketCierre(r: ResumenTurno, local: DatosLocal): Ticket {
  const t = r.turno
  const cerrado = t.estado === 'cerrado'
  const renglones: Renglon[] = [
    ...encabezadoLocal(local),
    centro(cerrado ? 'CIERRE DE CAJA' : 'CAJA (PARCIAL)', 'negrita'),
    { texto: columnas('Apertura', fechaHora(t.abierto_en)) },
    { texto: columnas('Cierre', t.cerrado_en ? fechaHora(t.cerrado_en) : '-') },
    linea(),
    { texto: 'VENDIDO', estilo: 'negrita' }
  ]
  for (const m of MEDIOS_PAGO) renglones.push({ texto: columnas(`  ${NOMBRE_MEDIO[m]}`, precioTicket(r.porMedio[m])) })
  renglones.push(
    { texto: columnas('TOTAL', precioTicket(r.ventas), ANCHO_GRANDE), estilo: 'grande' },
    { texto: columnas(`Cuentas cobradas: ${r.cuentasCobradas}`, `Desc. ${precioTicket(r.descuentos)}`) },
    ...(r.correcciones ? [{ texto: `Cobros con medio de pago corregido: ${r.correcciones}` }] : []),
    linea(),
    { texto: 'POR MOZO', estilo: 'negrita' }
  )
  for (const m of r.porMozo) renglones.push({ texto: columnas(`  ${m.mozo} (${m.cuentas})`, precioTicket(m.total)) })
  if (!r.porMozo.length) renglones.push({ texto: '  Sin ventas' })

  const py = r.pedidosYa
  if (py.comision > 0) {
    renglones.push(linea(), { texto: 'PEDIDOS YA', estilo: 'negrita' })
    renglones.push({ texto: columnas('  Vendido', precioTicket(py.online + py.efectivo)) })
    renglones.push({ texto: columnas(`  Comisión estimada (${py.porcentaje}%)`, `-${precioTicket(py.comision)}`) })
    renglones.push({ texto: columnas('  Neto', precioTicket(py.online + py.efectivo - py.comision)) })
  }

  if (r.pagosPersonal.length) {
    renglones.push(linea(), { texto: 'PAGOS AL PERSONAL', estilo: 'negrita' })
    for (const p of r.pagosPersonal) {
      renglones.push({ texto: columnas(`  ${p.persona}`, precioTicket(p.total)) })
      renglones.push({ texto: `    chica ${precioTicket(p.deChica)} + grande ${precioTicket(p.deGrande)}` })
    }
  }

  const otros = r.movimientos.filter((m) => m.tipo !== 'pago_personal')
  if (otros.length) {
    renglones.push(linea(), { texto: 'MOVIMIENTOS', estilo: 'negrita' })
    const corto: Record<string, string> = { chica: 'chica', grande: 'grande', gastos: 'gastos' }
    for (const m of otros) {
      const desde = m.caja_origen ? corto[m.caja_origen] : ''
      const hacia = m.caja_destino ? corto[m.caja_destino] : ''
      const cajas = desde && hacia ? `${desde}>${hacia}` : desde || hacia
      renglones.push({ texto: columnas(`  ${cajas} ${m.motivo ?? ''}`.trimEnd(), precioTicket(m.monto)) })
    }
  }

  renglones.push(linea(), { texto: 'ARQUEO', estilo: 'negrita' })
  for (const [nombre, c] of [
    ['Caja chica', r.cajas.chica],
    ['Caja grande', r.cajas.grande]
  ] as const) {
    renglones.push({ texto: columnas(`  ${nombre} esperado`, precioTicket(c.esperado)) })
    if (c.contado !== null) {
      renglones.push({ texto: columnas(`  ${nombre} contado`, precioTicket(c.contado)) })
      renglones.push({ texto: columnas('    Diferencia', textoDiferencia(c.diferencia ?? 0)), estilo: 'negrita' })
    }
  }
  renglones.push({ texto: columnas('  Caja de gastos (saldo)', precioTicket(r.gastosSaldo)) })
  if (t.nota_cierre) for (const p of partir(`Nota: ${t.nota_cierre}`, ANCHO_TICKET)) renglones.push({ texto: p })
  renglones.push(linea())
  return { titulo: cerrado ? 'Cierre de caja' : 'Caja parcial', renglones, destino: 'caja' }
}
