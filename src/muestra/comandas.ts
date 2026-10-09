import {
  esComandable,
  type Canal,
  type Comanda,
  type ComandaItem,
  type DatosApertura,
  type EnvioCocina,
  type Envio,
  type EstadoComanda,
  type Mozo,
  type Resultado
} from '@shared/types'
import { ahora, copia, db, falla, fechaLocal, nuevoId, ok, textoLimpio, type ComandaGuardada } from './base'
import { moverStock } from './catalogo'
import { cerrarSiTodoCobrado, itemCobrado, tieneCuentas } from './cobros'

const CANTIDAD_MAXIMA = 99
export const EN_CURSO: EstadoComanda[] = ['abierta', 'cobrando']

// ---------- Personal ----------

export function listarMozos(): Mozo[] {
  return copia([...db().mozos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })))
}

// ---------- Lectura ----------

/** La comanda con sus ítems, el nombre del mozo y el total (lo no anulado). */
export function leerComanda(id: number): Comanda | null {
  const c = db().comandas.find((x) => x.id === id)
  if (!c) return null
  const items = db().items.filter((i) => i.comanda_id === id).sort((a, b) => a.id - b.id)
  const { unida_a: _, ...resto } = c
  return copia({
    ...resto,
    mozo_nombre: db().mozos.find((m) => m.id === c.mozo_id)?.nombre ?? null,
    items,
    total: items.filter((i) => i.estado !== 'anulado').reduce((s, i) => s + i.precio * i.cantidad, 0)
  })
}

const enCursoDe = (elementoId: number) =>
  db().comandas.find((c) => c.elemento_id === elementoId && EN_CURSO.includes(c.estado))

/** La comanda en curso (abierta o cobrando) de una mesa o barra, o null si está libre. */
export function comandaEnCurso(elementoId: number): Comanda | null {
  const c = enCursoDe(elementoId)
  return c ? leerComanda(c.id) : null
}

export function tieneComandaEnCurso(elementoId: number): boolean {
  return !!enCursoDe(elementoId)
}

// ---------- Helpers ----------

function comandaEditable(id: number): Resultado<ComandaGuardada> {
  const c = db().comandas.find((x) => x.id === id)
  if (!c) return falla('La comanda no existe.')
  if (!EN_CURSO.includes(c.estado)) return falla('La comanda ya está cerrada.')
  return ok(c)
}

const itemsDe = (comandaId: number) => db().items.filter((i) => i.comanda_id === comandaId)

/** Si la cuenta ya estaba impresa y se agrega algo, deja de estar completa: la mesa vuelve a verde. */
function volverAAbierta(c: ComandaGuardada): void {
  if (c.estado === 'cobrando') {
    c.estado = 'abierta'
    c.cuenta_impresa_en = null
  }
}

const recetaDe = (productoId: number) => db().recetas.filter((r) => r.producto_id === productoId)

/** Lo que vuelve al stock al anular `cantidad` unidades de un ítem enviado: lo mismo que se descontó al enviarlo. */
function devolucionDe(item: ComandaItem, cantidad: number): { insumo_id: number; cantidad: number }[] {
  const enviada = item.cantidad_enviada ?? item.cantidad
  const descontado = new Map<number, number>()
  for (const m of db().movimientosStock)
    if (m.comanda_item_id === item.id && m.motivo === 'venta' && m.cantidad < 0)
      descontado.set(m.insumo_id, (descontado.get(m.insumo_id) ?? 0) - m.cantidad)
  return [...descontado].map(([insumo_id, total]) => ({ insumo_id, cantidad: (total / enviada) * cantidad }))
}

const cantidadValida = (c: unknown): c is number => Number.isInteger(c) && (c as number) >= 1 && (c as number) <= CANTIDAD_MAXIMA

// ---------- Abrir / cancelar ----------

/** Canal de una mesa según el tipo de pestaña donde está (salón, Pedidos Ya o Delivery). */
function canalDe(elementoId: number): Canal {
  const el = db().elementos.find((e) => e.id === elementoId)
  return db().salones.find((s) => s.id === el?.salon_id)?.tipo ?? 'salon'
}

/** Valida los datos de apertura según el canal y devuelve los que se guardan (o el motivo del rechazo). */
function datosSegunCanal(canal: Canal, datos: DatosApertura, mozoActivo: boolean): Resultado<Required<DatosApertura>> {
  if (datos.mozo_id !== null) {
    const mozo = db().mozos.find((m) => m.id === datos.mozo_id)
    if (!mozo || (mozoActivo && !mozo.activo)) return falla('El mozo no existe o está inactivo.')
  }
  if (datos.comensales !== null && !cantidadValida(datos.comensales)) return falla('Cantidad de comensales inválida.')
  const pedido = textoLimpio(datos.pedido_ref).slice(0, 30) || null
  const nombre = textoLimpio(datos.cliente_nombre).slice(0, 60) || null
  if (canal === 'pedidosya' && !pedido) return falla('Cargá el número de pedido de Pedidos Ya.')
  if (canal === 'delivery' && !nombre) return falla('Cargá el nombre del cliente.')
  return ok({
    mozo_id: datos.mozo_id,
    comensales: datos.comensales,
    pedido_ref: canal === 'pedidosya' ? pedido : null,
    cliente_nombre: canal === 'delivery' ? nombre : null,
    cliente_direccion: canal === 'delivery' ? textoLimpio(datos.cliente_direccion).slice(0, 100) || null : null,
    cliente_telefono: canal === 'delivery' ? textoLimpio(datos.cliente_telefono).slice(0, 30) || null : null
  })
}

export function abrirMesa(elementoId: number, datos: DatosApertura): Resultado<Comanda> {
  const el = db().elementos.find((e) => e.id === elementoId)
  if (!el || !esComandable(el.tipo)) return falla('La mesa no existe.')
  if (tieneComandaEnCurso(elementoId)) return falla(`${el.nombre} ya tiene una comanda abierta.`)
  const canal = canalDe(elementoId)
  const d = datosSegunCanal(canal, datos, true)
  if (!d.ok) return d
  const comanda: ComandaGuardada = {
    id: nuevoId(),
    elemento_id: elementoId,
    mesa_nombre: el.nombre ?? '',
    ...d.dato,
    estado: 'abierta',
    abierta_en: ahora(),
    cuenta_impresa_en: null,
    cerrada_en: null,
    canal,
    unida_a: null
  }
  db().comandas.push(comanda)
  return ok(leerComanda(comanda.id)!)
}

export function actualizarApertura(comandaId: number, datos: DatosApertura): Resultado<Comanda> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  const d = datosSegunCanal(r.dato.canal, datos, false)
  if (!d.ok) return d
  Object.assign(r.dato, d.dato)
  return ok(leerComanda(comandaId)!)
}

/** Para una mesa abierta por error: solo si no queda nada enviado sin anular. */
export function cancelarComanda(comandaId: number): Resultado<null> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  const items = itemsDe(comandaId)
  if (items.some((i) => i.estado === 'enviado'))
    return falla('Ya se envió algo a cocina o barra: no se puede cancelar. Anulá los ítems o cobrá la mesa.')
  const d = db()
  d.items = d.items.filter((i) => !(i.comanda_id === comandaId && i.estado === 'pendiente'))
  d.cuentas = d.cuentas.filter((c) => !(c.comanda_id === comandaId && c.estado === 'pendiente'))
  if (items.some((i) => i.estado === 'anulado')) {
    // Con anulaciones se cierra (quedan en el historial); si no, se borra
    r.dato.estado = 'cerrada'
    r.dato.cerrada_en = ahora()
  } else {
    d.comandas = d.comandas.filter((c) => c.id !== comandaId && !(c.unida_a === comandaId && c.estado === 'unida'))
  }
  return ok(null)
}

/** Mesa o pedido que se cancela después de mandar algo: se anula todo lo enviado y la mesa queda libre sin cobrar. */
export function anularPedido(comandaId: number, motivo: string, devolverStock: boolean): Resultado<null> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  const motivoLimpio = textoLimpio(motivo).slice(0, 200)
  if (!motivoLimpio) return falla('Indicá el motivo de la anulación.')
  const d = db()
  if (d.cuentas.some((c) => c.comanda_id === comandaId && c.estado === 'cobrada'))
    return falla('Ya se cobró una parte: no se puede anular entera. Anulá los ítems que falten y cobrá el resto.')
  d.items = d.items.filter((i) => !(i.comanda_id === comandaId && i.estado === 'pendiente'))
  const cuentas = new Set(d.cuentas.filter((c) => c.comanda_id === comandaId).map((c) => c.id))
  d.cuentas = d.cuentas.filter((c) => !cuentas.has(c.id))
  d.partes = d.partes.filter((p) => !cuentas.has(p.cuenta_id))
  for (const item of itemsDe(comandaId).filter((i) => i.estado === 'enviado')) {
    if (devolverStock)
      for (const ins of devolucionDe(item, item.cantidad))
        moverStock(ins.insumo_id, ins.cantidad, 'venta', `Anulado (${motivoLimpio}): ${item.nombre}`, item.id)
    Object.assign(item, { estado: 'anulado', anulado_motivo: motivoLimpio, stock_devuelto: devolverStock })
  }
  r.dato.estado = 'cerrada'
  r.dato.cerrada_en = ahora()
  return ok(null)
}

// ---------- Ítems ----------

export function agregarItem(comandaId: number, productoId: number, cantidad = 1, nota?: string): Resultado<Comanda> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  if (!cantidadValida(cantidad)) return falla('Cantidad inválida.')
  const p = db().productos.find((x) => x.id === productoId)
  if (!p) return falla('El producto no existe.')
  if (!p.activo) return falla(`"${p.nombre}" está fuera de carta.`)
  const notaLimpia = textoLimpio(nota).slice(0, 200) || null
  // Si ya hay uno igual sin enviar (mismo producto y nota), se suma la cantidad
  const igual = itemsDe(comandaId).find((i) => i.producto_id === productoId && i.estado === 'pendiente' && i.nota === notaLimpia)
  if (igual) igual.cantidad = Math.min(CANTIDAD_MAXIMA, igual.cantidad + cantidad)
  else
    db().items.push({
      id: nuevoId(),
      comanda_id: comandaId,
      producto_id: productoId,
      nombre: p.nombre,
      precio: p.precio,
      cantidad,
      nota: notaLimpia,
      destino: p.destino,
      estado: 'pendiente',
      envio: null,
      creado_en: ahora(),
      enviado_en: null,
      anulado_motivo: null,
      stock_devuelto: null,
      entregado_en: null,
      cantidad_enviada: null
    })
  volverAAbierta(r.dato)
  return ok(leerComanda(comandaId)!)
}

const buscarItem = (id: number) => db().items.find((i) => i.id === id)

/** Cantidad o nota de un ítem que todavía no se envió. */
export function cambiarItem(itemId: number, cambios: { cantidad?: number; nota?: string | null }): Resultado<Comanda> {
  const item = buscarItem(itemId)
  if (!item) return falla('El ítem no existe.')
  if (item.estado !== 'pendiente') return falla('Ya se envió: para cambiarlo hay que anularlo.')
  if (cambios.cantidad !== undefined && !cantidadValida(cambios.cantidad)) return falla('Cantidad inválida.')
  if (cambios.cantidad !== undefined) item.cantidad = cambios.cantidad
  if (cambios.nota !== undefined) item.nota = textoLimpio(cambios.nota).slice(0, 200) || null
  return ok(leerComanda(item.comanda_id)!)
}

/** Quita un ítem que todavía no se envió. */
export function quitarItem(itemId: number): Resultado<Comanda> {
  const item = buscarItem(itemId)
  if (!item) return falla('El ítem no existe.')
  if (item.estado !== 'pendiente') return falla('Ya se envió: para sacarlo hay que anularlo.')
  db().items = db().items.filter((i) => i.id !== itemId)
  return ok(leerComanda(item.comanda_id)!)
}

// ---------- Enviar ----------

/** Todo lo pendiente sale a cocina/barra como un envío nuevo, y se descuenta el stock según las recetas. */
export function enviar(comandaId: number): Resultado<Envio> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  const items = itemsDe(comandaId)
  const pendientes = items.filter((i) => i.estado === 'pendiente')
  if (!pendientes.length) return falla('No hay nada nuevo para enviar.')
  const numero = Math.max(0, ...items.map((i) => i.envio ?? 0)) + 1
  const alertas = new Set<string>()
  const cuando = ahora()
  for (const item of pendientes) {
    Object.assign(item, { estado: 'enviado', envio: numero, enviado_en: cuando, cantidad_enviada: item.cantidad })
    for (const ins of recetaDe(item.producto_id))
      moverStock(ins.insumo_id, -ins.cantidad * item.cantidad, 'venta', `${r.dato.mesa_nombre}: ${item.nombre}`, item.id)
  }
  // Insumos que quedaron en cero o menos (se envía igual: en la cocina ya se está preparando)
  for (const item of pendientes)
    for (const ins of recetaDe(item.producto_id)) {
      const insumo = db().insumos.find((i) => i.id === ins.insumo_id)
      if (insumo && insumo.stock <= 0) alertas.add(insumo.nombre)
    }
  const comanda = leerComanda(comandaId)!
  return ok({ comanda, numero, items: comanda.items.filter((i) => i.envio === numero), alertasStock: [...alertas] })
}

/** Los ítems de un envío anterior, para verlo de nuevo. */
export function verEnvio(comandaId: number, numero: number): Resultado<Envio> {
  const comanda = leerComanda(comandaId)
  if (!comanda) return falla('La comanda no existe.')
  const items = comanda.items.filter((i) => i.envio === numero && i.estado !== 'anulado')
  if (!items.length) return falla('Ese envío no tiene ítems.')
  return ok({ comanda, numero, items, alertasStock: [] })
}

// ---------- Anular ----------

/** Anula `cantidad` unidades de un ítem ya enviado. Si es una parte (1 de 3), el renglón se divide. */
export function anularItem(itemId: number, cantidad: number, motivo: string, devolverStock: boolean): Resultado<Comanda> {
  const item = buscarItem(itemId)
  if (!item) return falla('El ítem no existe.')
  if (item.estado !== 'enviado') return falla('Solo se anula lo que ya se envió; lo pendiente se quita directamente.')
  if (!comandaEditable(item.comanda_id).ok) return falla('La comanda ya está cerrada.')
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > item.cantidad) return falla('Cantidad a anular inválida.')
  const motivoLimpio = textoLimpio(motivo).slice(0, 200)
  if (!motivoLimpio) return falla('Indicá el motivo de la anulación.')
  if (itemCobrado(itemId)) return falla('Ese ítem ya se cobró: no se puede anular.')

  // Si estaba asignado a una cuenta separada (sin cobrar), vuelve a "sin asignar"
  db().partes = db().partes.filter((p) => p.comanda_item_id !== itemId)
  const devolucion = devolverStock ? devolucionDe(item, cantidad) : []
  let anulado = item
  if (cantidad < item.cantidad) {
    // Anulación parcial: el renglón original queda con lo que sigue y se crea uno anulado aparte
    item.cantidad -= cantidad
    anulado = { ...item, id: nuevoId(), cantidad }
    db().items.push(anulado)
  }
  Object.assign(anulado, { estado: 'anulado', anulado_motivo: motivoLimpio, stock_devuelto: devolverStock })
  for (const ins of devolucion) moverStock(ins.insumo_id, ins.cantidad, 'venta', `Anulado (${motivoLimpio}): ${item.nombre}`, anulado.id)
  // Si con esto lo que faltaba cobrar quedó vacío (lo demás ya se cobró), la mesa se libera
  cerrarSiTodoCobrado(item.comanda_id)
  return ok(leerComanda(item.comanda_id)!)
}

// ---------- Cuenta y cierre ----------

/** Imprime la cuenta: la mesa pasa a rojo. El monto se puede seguir corrigiendo hasta el cobro. */
export function imprimirCuenta(comandaId: number): Resultado<Comanda> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  const items = itemsDe(comandaId)
  if (items.some((i) => i.estado === 'pendiente')) return falla('Hay ítems sin enviar. Enviá o quitá lo pendiente antes de pedir la cuenta.')
  if (!items.some((i) => i.estado === 'enviado')) return falla('La mesa no tiene consumos.')
  r.dato.estado = 'cobrando'
  r.dato.cuenta_impresa_en = ahora()
  return ok(leerComanda(comandaId)!)
}

/** Cierra la comanda y libera la mesa. Lo llama el cobro cuando se cobraron todas las cuentas. */
export function cerrarComanda(comandaId: number): Resultado<Comanda> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  if (itemsDe(comandaId).some((i) => i.estado === 'pendiente')) return falla('Hay ítems sin enviar.')
  r.dato.estado = 'cerrada'
  r.dato.cerrada_en = ahora()
  return ok(leerComanda(comandaId)!)
}

// ---------- Pasar y unir mesas ----------

/** Mueve la comanda completa a otra mesa libre. La de origen queda libre. */
export function pasarMesa(comandaId: number, destinoId: number): Resultado<Comanda> {
  const r = comandaEditable(comandaId)
  if (!r.ok) return r
  const destino = db().elementos.find((e) => e.id === destinoId)
  if (!destino || !esComandable(destino.tipo)) return falla('La mesa de destino no existe.')
  if (destino.id === r.dato.elemento_id) return falla('Elegí otra mesa.')
  if (canalDe(destinoId) !== r.dato.canal) return falla('Solo se puede pasar a una mesa de la misma pestaña (salón, Pedidos Ya o Delivery).')
  if (tieneComandaEnCurso(destinoId)) return falla(`${destino.nombre} está ocupada: podés unir las mesas.`)
  r.dato.elemento_id = destinoId
  r.dato.mesa_nombre = destino.nombre ?? ''
  return ok(leerComanda(comandaId)!)
}

/** Suma los ítems de una comanda en la de otra mesa ocupada. La de origen queda libre (registrada como "unida"). */
export function unirMesas(origenId: number, destinoElementoId: number): Resultado<Comanda> {
  const r = comandaEditable(origenId)
  if (!r.ok) return r
  const destino = enCursoDe(destinoElementoId)
  if (!destino) return falla('La mesa de destino está libre: usá "Pasar mesa".')
  if (destino.id === origenId) return falla('Elegí otra mesa.')
  if (destino.canal !== r.dato.canal) return falla('Solo se pueden unir mesas de la misma pestaña (salón, Pedidos Ya o Delivery).')
  if (tieneCuentas(origenId) || tieneCuentas(destino.id))
    return falla('Alguna de las mesas tiene la cuenta dividida o en cobro. Deshacé la división antes de unir.')
  // Los envíos de la mesa unida se numeran después de los del destino, para no mezclarlos
  const max = Math.max(0, ...itemsDe(destino.id).map((i) => i.envio ?? 0))
  for (const i of itemsDe(origenId)) {
    i.comanda_id = destino.id
    if (i.envio !== null) i.envio += max
  }
  Object.assign(r.dato, { estado: 'unida', unida_a: destino.id, cerrada_en: ahora() })
  db().cuentas = db().cuentas.filter((c) => !(c.comanda_id === origenId && c.estado === 'pendiente'))
  volverAAbierta(destino)
  return ok(leerComanda(destino.id)!)
}

// ---------- Cocina ----------
// Lo que se mandó a cocina y todavía no llegó a la mesa, agrupado por envío. La barra se maneja con sus tickets.

function agrupar(items: ComandaItem[]): EnvioCocina[] {
  const envios = new Map<string, EnvioCocina>()
  for (const i of items) {
    const c = db().comandas.find((x) => x.id === i.comanda_id)!
    const clave = `${i.comanda_id}-${i.envio}`
    let e = envios.get(clave)
    if (!e) {
      e = {
        comanda_id: i.comanda_id,
        envio: i.envio!,
        canal: c.canal,
        mesa_nombre: c.mesa_nombre,
        pedido_ref: c.pedido_ref,
        cliente_nombre: c.cliente_nombre,
        enviado_en: i.enviado_en!,
        entregado_en: i.entregado_en,
        items: []
      }
      envios.set(clave, e)
    }
    e.items.push({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, nota: i.nota })
  }
  return [...envios.values()]
}

const deCocina = () => db().items.filter((i) => i.destino === 'cocina' && i.estado === 'enviado')

/** Lo pendiente, del más viejo al más nuevo (solo de mesas en curso o de las últimas 12 horas). */
export function pendientesCocina(): EnvioCocina[] {
  const desde = fechaLocal(new Date(new Date(ahora().replace(' ', 'T')).getTime() - 12 * 3600 * 1000))
  const items = deCocina()
    .filter((i) => {
      const c = db().comandas.find((x) => x.id === i.comanda_id)!
      return !i.entregado_en && (EN_CURSO.includes(c.estado) || i.enviado_en! >= desde)
    })
    .sort((a, b) => a.enviado_en!.localeCompare(b.enviado_en!) || a.comanda_id - b.comanda_id || a.envio! - b.envio! || a.id - b.id)
  return agrupar(items)
}

/** Lo entregado hoy, lo último primero (para deshacer si se tocó de más). */
export function entregadosHoy(): EnvioCocina[] {
  const hoy = ahora().slice(0, 10)
  const items = deCocina()
    .filter((i) => i.entregado_en && i.entregado_en >= hoy)
    .sort((a, b) => b.entregado_en!.localeCompare(a.entregado_en!) || a.comanda_id - b.comanda_id || a.id - b.id)
  return agrupar(items)
}

/** "✓ En mesa" / "✓ Entregado" (entregado = true) o deshacer (false) de un envío entero. */
export function marcarEntregado(comandaId: number, envio: number, entregado: boolean): Resultado<null> {
  const items = deCocina().filter((i) => i.comanda_id === comandaId && i.envio === envio)
  if (!items.length) return falla('Ese envío ya no está en cocina.')
  const cuando = entregado ? ahora() : null
  for (const i of items) i.entregado_en = cuando
  return ok(null)
}
