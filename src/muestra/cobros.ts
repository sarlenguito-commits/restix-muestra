import {
  MEDIOS_PAGO,
  type Caja,
  type CobroDelTurno,
  type Cuenta,
  type EstadoCobro,
  type MedioPago,
  type MovimientoCaja,
  type NuevoMovimiento,
  type Pago,
  type PagoPersonal,
  type ParteItem,
  type ProductosDelMes,
  type Resultado,
  type ResumenTurno,
  type TipoDescuento,
  type TurnoCaja
} from '@shared/types'
import { ahora, copia, db, falla, nuevoId, numeroValido, ok, textoLimpio, type CuentaGuardada } from './base'
import { cerrarComanda, EN_CURSO, leerComanda } from './comandas'

/** Margen para comparar cantidades fraccionarias (⅓ + ⅓ + ⅓) */
const EPSILON = 1e-6
const MAXIMO_CUENTAS = 20
/** Tope de un movimiento o pago: $100.000.000 (en centavos), para frenar errores de tipeo */
const MONTO_MAXIMO = 10_000_000_000

// ==================== Caja ====================
// Tres cajas de efectivo:
//  - chica: fondo para cambio. Arranca con el efectivo inicial y pasa al turno siguiente con lo contado.
//  - grande: recibe las ventas en efectivo del turno.
//  - gastos: fondo aparte que sigue de turno en turno.
// Los saldos no se guardan: se calculan con los movimientos, así nunca se descuadran.

const CAJAS: Caja[] = ['chica', 'grande', 'gastos']
const montoValido = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MONTO_MAXIMO
const sinGrande = ({ efectivo_contado_grande: _, ...t }: TurnoCaja & { efectivo_contado_grande: number | null }): TurnoCaja => copia(t)

export function turnoAbierto(): TurnoCaja | null {
  const t = db().turnos.find((x) => x.estado === 'abierto')
  return t ? sinGrande(t) : null
}

/** Con cuánto arranca la caja chica del próximo turno: lo contado al cerrar el anterior. */
export function chicaSugerida(): number {
  const cerrados = db().turnos.filter((t) => t.estado === 'cerrado')
  return cerrados.at(-1)?.efectivo_contado ?? 0
}

/** Abre el turno. Sin monto, la caja chica arranca con lo contado en el cierre anterior. */
export function abrirTurno(efectivoInicial?: number | null): Resultado<TurnoCaja> {
  const inicial = efectivoInicial ?? chicaSugerida()
  if (!montoValido(inicial)) return falla('Efectivo inicial inválido.')
  if (turnoAbierto()) return falla('Ya hay un turno de caja abierto.')
  const turno = {
    id: nuevoId(),
    estado: 'abierto' as const,
    abierto_en: ahora(),
    efectivo_inicial: inicial,
    cerrado_en: null,
    efectivo_contado: null,
    efectivo_contado_grande: null,
    nota_cierre: null
  }
  db().turnos.push(turno)
  return ok(sinGrande(turno))
}

/** Saldo de la caja de gastos: todo lo que entró menos todo lo que salió, desde siempre. */
export function saldoGastos(): number {
  return db().movimientosCaja.reduce(
    (s, m) => s + (m.caja_destino === 'gastos' ? m.monto : 0) - (m.caja_origen === 'gastos' ? m.monto : 0),
    0
  )
}

const conPersona = (m: Omit<MovimientoCaja, 'persona'>): MovimientoCaja => ({
  ...m,
  persona: db().mozos.find((p) => p.id === m.persona_id)?.nombre ?? null
})

/** Ingreso, retiro, traspaso entre cajas o gasto (sale de la caja de gastos). */
export function registrarMovimiento(m: NuevoMovimiento): Resultado<ResumenTurno | null> {
  if (!Number.isInteger(m.monto) || m.monto <= 0 || m.monto > MONTO_MAXIMO) return falla('El monto tiene que ser mayor a cero.')
  const motivo = textoLimpio(m.motivo).slice(0, 200) || null
  let origen: Caja | null = null
  let destino: Caja | null = null
  switch (m.tipo) {
    case 'ingreso':
      destino = m.destino ?? null
      if (!motivo) return falla('Indicá de dónde viene la plata.')
      break
    case 'retiro':
      origen = m.origen ?? null
      if (!motivo) return falla('Indicá el motivo del retiro.')
      break
    case 'traspaso':
      origen = m.origen ?? null
      destino = m.destino ?? null
      if (!origen || !destino) return falla('Elegí de qué caja sale y a cuál va.')
      if (origen === destino) return falla('Elegí dos cajas distintas.')
      break
    case 'gasto':
      origen = 'gastos'
      if (!motivo) return falla('Indicá en qué se gastó.')
      break
    default:
      return falla('Tipo de movimiento inválido.')
  }
  if ((origen && !CAJAS.includes(origen)) || (destino && !CAJAS.includes(destino))) return falla('Caja inválida.')
  if (!origen && !destino) return falla('Elegí la caja.')
  // La caja de gastos se puede usar sin turno abierto; la chica y la grande, no
  const turno = turnoAbierto()
  if ([origen, destino].some((c) => c === 'chica' || c === 'grande') && !turno)
    return falla('Abrí la caja para mover plata de la caja chica o la grande.')
  db().movimientosCaja.push({
    id: nuevoId(),
    turno_id: turno?.id ?? null,
    tipo: m.tipo,
    caja_origen: origen,
    caja_destino: destino,
    monto: m.monto,
    motivo,
    persona_id: null,
    grupo: null,
    fecha: ahora()
  })
  return ok(turno ? resumenTurno(turno.id) : null)
}

/** Pago a una persona del personal, que puede salir en partes de la caja chica y de la grande. */
export function pagarPersonal(p: PagoPersonal): Resultado<ResumenTurno> {
  const turno = turnoAbierto()
  if (!turno) return falla('Abrí la caja para registrar pagos al personal.')
  if (!db().mozos.some((m) => m.id === p.persona_id)) return falla('La persona no existe.')
  const partes: [Caja, number][] = [
    ['chica', p.deChica],
    ['grande', p.deGrande]
  ]
  if (partes.some(([, v]) => !montoValido(v))) return falla('Montos inválidos.')
  if (p.deChica + p.deGrande <= 0) return falla('El pago tiene que ser mayor a cero.')
  const motivo = textoLimpio(p.motivo).slice(0, 200) || null
  const grupo = Math.max(0, ...db().movimientosCaja.map((m) => m.grupo ?? 0)) + 1
  for (const [caja, monto] of partes)
    if (monto > 0)
      db().movimientosCaja.push({
        id: nuevoId(),
        turno_id: turno.id,
        tipo: 'pago_personal',
        caja_origen: caja,
        caja_destino: null,
        monto,
        motivo,
        persona_id: p.persona_id,
        grupo,
        fecha: ahora()
      })
  return ok(resumenTurno(turno.id)!)
}

/** Borra un movimiento cargado por error (y las otras partes del mismo pago). Solo del turno abierto o de gastos. */
export function borrarMovimiento(id: number): Resultado<ResumenTurno | null> {
  const m = db().movimientosCaja.find((x) => x.id === id)
  if (!m) return falla('El movimiento no existe.')
  const turno = turnoAbierto()
  if (m.turno_id !== null && m.turno_id !== turno?.id) return falla('Es de un turno ya cerrado: no se puede borrar.')
  db().movimientosCaja = db().movimientosCaja.filter((x) => (m.grupo !== null ? x.grupo !== m.grupo : x.id !== id))
  return ok(turno ? resumenTurno(turno.id) : null)
}

/** Movimientos de la caja de gastos (de todos los turnos), del más nuevo al más viejo. */
export function movimientosGastos(limite = 100): MovimientoCaja[] {
  return db()
    .movimientosCaja.filter((m) => m.caja_origen === 'gastos' || m.caja_destino === 'gastos')
    .sort((a, b) => b.id - a.id)
    .slice(0, limite)
    .map(conPersona)
}

export function resumenTurno(turnoId: number): ResumenTurno | null {
  const d = db()
  const turno = d.turnos.find((t) => t.id === turnoId)
  if (!turno) return null

  const cobradas = d.cuentas
    .filter((c) => c.turno_id === turnoId && c.estado === 'cobrada')
    .map((c) => {
      const co = d.comandas.find((x) => x.id === c.comanda_id)!
      const mozo =
        co.canal === 'pedidosya' ? 'Pedidos Ya' : co.canal === 'delivery' ? 'Delivery' : (d.mozos.find((m) => m.id === co.mozo_id)?.nombre ?? 'Sin mozo')
      return { total: c.total!, descuento: c.descuento!, mozo, canal: co.canal, id: c.id }
    })

  const pagos = d.pagos.filter((p) => p.turno_id === turnoId)
  const porMedio = Object.fromEntries(MEDIOS_PAGO.map((m) => [m, 0])) as Record<MedioPago, number>
  for (const p of pagos) porMedio[p.medio] += p.monto

  // Pedidos Ya: lo que se cobró online (por la app) y lo que pagó en efectivo; la comisión se estima con el %
  const pedidosYa = { online: 0, efectivo: 0, porcentaje: d.comisionPedidosYa, comision: 0 }
  const cuentasPY = new Set(cobradas.filter((c) => c.canal === 'pedidosya').map((c) => c.id))
  for (const p of pagos.filter((x) => cuentasPY.has(x.cuenta_id))) {
    if (p.medio === 'pedidosya') pedidosYa.online += p.monto
    else pedidosYa.efectivo += p.monto
  }
  pedidosYa.comision = Math.round(((pedidosYa.online + pedidosYa.efectivo) * pedidosYa.porcentaje) / 100)

  const mozos = new Map<string, { mozo: string; total: number; cuentas: number }>()
  for (const c of cobradas) {
    const m = mozos.get(c.mozo) ?? { mozo: c.mozo, total: 0, cuentas: 0 }
    m.total += c.total
    m.cuentas++
    mozos.set(c.mozo, m)
  }

  const movimientos = d.movimientosCaja.filter((m) => m.turno_id === turnoId).sort((a, b) => a.id - b.id).map(conPersona)
  const neto = (caja: Caja) =>
    movimientos.reduce((s, m) => s + (m.caja_destino === caja ? m.monto : 0) - (m.caja_origen === caja ? m.monto : 0), 0)
  const esperadoChica = turno.efectivo_inicial + neto('chica')
  const esperadoGrande = porMedio.efectivo + neto('grande')
  const cerrado = turno.estado === 'cerrado'
  const cajaTurno = (esperado: number, contado: number | null) => ({
    esperado,
    contado: cerrado ? contado : null,
    diferencia: cerrado && contado !== null ? contado - esperado : null
  })
  const cajas = {
    chica: cajaTurno(esperadoChica, turno.efectivo_contado),
    grande: cajaTurno(esperadoGrande, turno.efectivo_contado_grande)
  }

  const personal = new Map<string, { persona: string; total: number; deChica: number; deGrande: number }>()
  for (const m of movimientos.filter((x) => x.tipo === 'pago_personal')) {
    const nombre = m.persona ?? '—'
    const p = personal.get(nombre) ?? { persona: nombre, total: 0, deChica: 0, deGrande: 0 }
    p.total += m.monto
    if (m.caja_origen === 'chica') p.deChica += m.monto
    if (m.caja_origen === 'grande') p.deGrande += m.monto
    personal.set(nombre, p)
  }

  const abiertas = d.comandas.filter((c) => EN_CURSO.includes(c.estado))
  const enMesasAbiertas = abiertas.reduce((s, c) => s + leerComanda(c.id)!.total, 0)
  const deEsteTurno = new Set(cobradas.map((c) => c.id))
  const diferencias = [cajas.chica.diferencia, cajas.grande.diferencia]
  return {
    turno: sinGrande(turno),
    ventas: cobradas.reduce((s, c) => s + c.total, 0),
    descuentos: cobradas.reduce((s, c) => s + c.descuento, 0),
    cuentasCobradas: cobradas.length,
    porMedio,
    porMozo: [...mozos.values()].sort((a, b) => b.total - a.total),
    pedidosYa,
    movimientos,
    cajas,
    gastosSaldo: saldoGastos(),
    pagosPersonal: [...personal.values()],
    efectivoEsperado: esperadoChica + esperadoGrande,
    diferencia: diferencias.every((x) => x === null) ? null : diferencias.reduce<number>((s, x) => s + (x ?? 0), 0),
    mesasAbiertas: abiertas.length,
    enMesasAbiertas,
    correcciones: d.correcciones.filter((c) => deEsteTurno.has(c.cuenta_id)).length
  }
}

/** Cierra el turno contando cada caja por separado. Lo contado en la chica es con lo que arranca el turno siguiente. */
export function cerrarTurno(contadoChica: number, contadoGrande: number, nota?: string): Resultado<ResumenTurno> {
  const turno = db().turnos.find((t) => t.estado === 'abierto')
  if (!turno) return falla('No hay un turno de caja abierto.')
  for (const v of [contadoChica, contadoGrande]) if (!montoValido(v)) return falla('Efectivo contado inválido.')
  Object.assign(turno, {
    estado: 'cerrado',
    cerrado_en: ahora(),
    efectivo_contado: contadoChica,
    efectivo_contado_grande: contadoGrande,
    nota_cierre: textoLimpio(nota).slice(0, 300) || null
  })
  return ok(resumenTurno(turno.id)!)
}

const MES = /^\d{4}-\d{2}$/

/** Turnos de un mes ("2026-10"), o los últimos 60 si no se indica. */
export function listarTurnos(mes?: string | null): TurnoCaja[] {
  const todos = [...db().turnos].sort((a, b) => b.id - a.id)
  if (mes && MES.test(mes)) return todos.filter((t) => t.abierto_en.startsWith(mes)).map(sinGrande)
  return todos.slice(0, 60).map(sinGrande)
}

/** Meses que tienen turnos cerrados, del más nuevo al más viejo. */
export function mesesConTurnos(): string[] {
  const meses = new Set(db().turnos.filter((t) => t.estado === 'cerrado').map((t) => t.abierto_en.slice(0, 7)))
  return [...meses].sort().reverse()
}

/** Ranking de productos de un mes (el mes del turno en que se cobró), más los productos en carta que no se vendieron. */
export function productosVendidos(mes: string): Resultado<ProductosDelMes> {
  if (!MES.test(String(mes))) return falla('Mes inválido.')
  const d = db()
  const turnosDelMes = new Set(d.turnos.filter((t) => t.abierto_en.startsWith(mes)).map((t) => t.id))
  const comandasDelMes = new Set(
    d.cuentas.filter((c) => c.estado === 'cobrada' && c.turno_id !== null && turnosDelMes.has(c.turno_id)).map((c) => c.comanda_id)
  )
  const vendidos = new Map<number, { nombre: string; cantidad: number; importe: number }>()
  for (const i of d.items) {
    const c = d.comandas.find((x) => x.id === i.comanda_id)!
    if (i.estado !== 'enviado' || c.estado !== 'cerrada' || !comandasDelMes.has(c.id)) continue
    const v = vendidos.get(i.producto_id) ?? { nombre: i.nombre, cantidad: 0, importe: 0 }
    v.cantidad += i.cantidad
    v.importe += i.precio * i.cantidad
    vendidos.set(i.producto_id, v)
  }
  const sinVentas = d.productos
    .filter((p) => p.activo && !vendidos.has(p.id))
    .map((p) => p.nombre)
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  const lista = [...vendidos.values()].sort((a, b) => b.cantidad - a.cantidad || b.importe - a.importe)
  return ok({ vendidos: lista, sinVentas })
}

// ==================== Cuentas ====================

/** Ítems que cuentan para cobrar: enviados (no anulados ni pendientes) */
const itemsCobrables = (comandaId: number) =>
  db()
    .items.filter((i) => i.comanda_id === comandaId && i.estado === 'enviado')
    .sort((a, b) => a.id - b.id)

function calcularDescuento(subtotal: number, tipo: TipoDescuento | null, valor: number | null): number {
  if (!tipo || !valor) return 0
  if (tipo === 'porcentaje') return Math.min(subtotal, Math.round((subtotal * valor) / 100))
  return Math.min(subtotal, valor)
}

function armarCuenta(f: CuentaGuardada): Cuenta {
  const d = db()
  let items: ParteItem[]
  if (f.por_items) {
    const enviados = new Map(itemsCobrables(f.comanda_id).map((i) => [i.id, i]))
    items = d.partes
      .filter((p) => p.cuenta_id === f.id && enviados.has(p.comanda_item_id))
      .sort((a, b) => a.comanda_item_id - b.comanda_item_id)
      .map((p) => {
        const i = enviados.get(p.comanda_item_id)!
        return { comanda_item_id: i.id, nombre: i.nombre, precio: i.precio, cantidad: p.cantidad, importe: p.importe }
      })
  } else {
    items = itemsCobrables(f.comanda_id).map((i) => ({
      comanda_item_id: i.id,
      nombre: i.nombre,
      precio: i.precio,
      cantidad: i.cantidad,
      importe: i.precio * i.cantidad
    }))
  }
  const pagos: Pago[] = d.pagos
    .filter((p) => p.cuenta_id === f.id)
    .sort((a, b) => a.id - b.id)
    .map((p) => ({ medio: p.medio, monto: p.monto, recibido: p.recibido }))
  // Una cuenta cobrada muestra los importes guardados ("foto"); una pendiente se calcula en vivo
  const cobrada = f.estado === 'cobrada'
  const subtotal = cobrada ? f.subtotal! : items.reduce((s, i) => s + i.importe, 0)
  const descuento = cobrada ? f.descuento! : calcularDescuento(subtotal, f.descuento_tipo, f.descuento_valor)
  return copia({
    id: f.id,
    comanda_id: f.comanda_id,
    nombre: f.nombre,
    por_items: f.por_items,
    estado: f.estado,
    descuento_tipo: f.descuento_tipo,
    descuento_valor: f.descuento_valor,
    descuento_motivo: f.descuento_motivo,
    items,
    subtotal,
    descuento,
    total: cobrada ? f.total! : subtotal - descuento,
    pagos,
    cobrada_en: f.cobrada_en
  })
}

const buscarCuenta = (id: number) => db().cuentas.find((c) => c.id === id)
const leerCuenta = (id: number): Cuenta | null => {
  const f = buscarCuenta(id)
  return f ? armarCuenta(f) : null
}
const cuentasDe = (comandaId: number) => db().cuentas.filter((c) => c.comanda_id === comandaId).sort((a, b) => a.id - b.id)

/** Partes de ítems que no están en ninguna cuenta (solo tiene sentido si la mesa está dividida por ítems). */
function partesSinAsignar(comandaId: number): ParteItem[] {
  const resto: ParteItem[] = []
  for (const i of itemsCobrables(comandaId)) {
    const partes = db().partes.filter((p) => p.comanda_item_id === i.id)
    const cantidad = i.cantidad - partes.reduce((s, p) => s + p.cantidad, 0)
    if (cantidad > EPSILON)
      resto.push({
        comanda_item_id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad,
        importe: i.precio * i.cantidad - partes.reduce((s, p) => s + p.importe, 0)
      })
  }
  return resto
}

export function estadoCobro(comandaId: number): Resultado<EstadoCobro> {
  const comanda = leerComanda(comandaId)
  if (!comanda) return falla('La comanda no existe.')
  const cuentas = cuentasDe(comandaId).map(armarCuenta)
  const dividida = cuentas.some((c) => c.por_items)
  return ok({ comanda, cuentas, sinAsignar: dividida ? partesSinAsignar(comandaId) : [], turno: turnoAbierto() })
}

function comandaCobrable(comandaId: number): Resultado<null> {
  const c = db().comandas.find((x) => x.id === comandaId)
  if (!c) return falla('La comanda no existe.')
  if (!EN_CURSO.includes(c.estado)) return falla('La mesa ya está cerrada.')
  return ok(null)
}

const algunaCobrada = (comandaId: number) => cuentasDe(comandaId).some((c) => c.estado === 'cobrada')

function nuevaCuenta(comandaId: number, nombre: string, porItems: boolean): void {
  db().cuentas.push({
    id: nuevoId(),
    comanda_id: comandaId,
    nombre,
    por_items: porItems,
    estado: 'pendiente',
    descuento_tipo: null,
    descuento_valor: null,
    descuento_motivo: null,
    subtotal: null,
    descuento: null,
    total: null,
    turno_id: null,
    cobrada_en: null
  })
}

function borrarCuentas(ids: Set<number>): void {
  db().cuentas = db().cuentas.filter((c) => !ids.has(c.id))
  db().partes = db().partes.filter((p) => !ids.has(p.cuenta_id))
}

/** Deja la mesa lista para cobrarse toda junta (una sola cuenta). */
export function cobroTodoJunto(comandaId: number): Resultado<EstadoCobro> {
  const r = comandaCobrable(comandaId)
  if (!r.ok) return r
  const cuentas = cuentasDe(comandaId)
  if (cuentas.some((c) => c.por_items)) return falla('La mesa está dividida por ítems. Deshacé la división para cobrar todo junto.')
  if (!cuentas.length) nuevaCuenta(comandaId, 'Total', false)
  return estadoCobro(comandaId)
}

/** Divide la mesa en N cuentas separadas (vacías: después se asignan los ítems). */
export function dividirPorItems(comandaId: number, cantidad: number): Resultado<EstadoCobro> {
  const r = comandaCobrable(comandaId)
  if (!r.ok) return r
  if (!Number.isInteger(cantidad) || cantidad < 2 || cantidad > MAXIMO_CUENTAS) return falla('Cantidad de cuentas inválida.')
  if (algunaCobrada(comandaId)) return falla('Ya se cobró una parte: no se puede volver a dividir.')
  borrarCuentas(new Set(cuentasDe(comandaId).map((c) => c.id)))
  for (let n = 1; n <= cantidad; n++) nuevaCuenta(comandaId, `Cuenta ${n}`, true)
  return estadoCobro(comandaId)
}

/** Vuelve a una sola cuenta (solo si todavía no se cobró ninguna). */
export function deshacerDivision(comandaId: number): Resultado<EstadoCobro> {
  if (algunaCobrada(comandaId)) return falla('Ya se cobró una parte: no se puede deshacer la división.')
  borrarCuentas(new Set(cuentasDe(comandaId).map((c) => c.id)))
  return cobroTodoJunto(comandaId)
}

export function agregarCuenta(comandaId: number): Resultado<EstadoCobro> {
  const cuentas = cuentasDe(comandaId)
  if (!cuentas.some((c) => c.por_items)) return falla('La mesa no está dividida por ítems.')
  if (cuentas.length >= MAXIMO_CUENTAS) return falla('Demasiadas cuentas.')
  nuevaCuenta(comandaId, `Cuenta ${cuentas.length + 1}`, true)
  return estadoCobro(comandaId)
}

/** Quita una cuenta sin cobrar: sus ítems vuelven a "sin asignar". */
export function quitarCuenta(cuentaId: number): Resultado<EstadoCobro> {
  const c = buscarCuenta(cuentaId)
  if (!c) return falla('La cuenta no existe.')
  if (c.estado === 'cobrada') return falla('La cuenta ya se cobró.')
  if (cuentasDe(c.comanda_id).length <= 2) return falla('Tienen que quedar al menos 2 cuentas. Para una sola, deshacé la división.')
  borrarCuentas(new Set([cuentaId]))
  return estadoCobro(c.comanda_id)
}

export function renombrarCuenta(cuentaId: number, nombre: string): Resultado<EstadoCobro> {
  const c = buscarCuenta(cuentaId)
  if (!c) return falla('La cuenta no existe.')
  const limpio = textoLimpio(nombre).slice(0, 40)
  if (!limpio) return falla('La cuenta necesita un nombre.')
  c.nombre = limpio
  return estadoCobro(c.comanda_id)
}

/**
 * Recalcula los importes de las partes de un ítem. Si el ítem quedó asignado completo, la última parte sin cobrar
 * absorbe el redondeo para que la suma dé exacto (⅓ de $10.000 = 3.333 + 3.333 + 3.334). Lo ya cobrado no se toca.
 */
function recalcularImportes(itemId: number): void {
  const item = db().items.find((i) => i.id === itemId)!
  const partes = db()
    .partes.filter((p) => p.comanda_item_id === itemId)
    .sort((a, b) => a.cuenta_id - b.cuenta_id)
  const cobrada = (p: { cuenta_id: number }) => buscarCuenta(p.cuenta_id)?.estado === 'cobrada'
  for (const p of partes) if (!cobrada(p)) p.importe = Math.round(item.precio * p.cantidad)
  const asignado = partes.reduce((s, p) => s + p.cantidad, 0)
  const ultima = partes.filter((p) => !cobrada(p)).at(-1)
  if (ultima && Math.abs(asignado - item.cantidad) < EPSILON) {
    const suma = partes.reduce((s, p) => s + p.importe, 0)
    ultima.importe = Math.max(0, ultima.importe + item.precio * item.cantidad - suma)
  }
}

function ponerParte(cuentaId: number, itemId: number, cantidad: number): void {
  const parte = db().partes.find((p) => p.cuenta_id === cuentaId && p.comanda_item_id === itemId)
  if (parte) parte.cantidad = cantidad
  else db().partes.push({ cuenta_id: cuentaId, comanda_item_id: itemId, cantidad, importe: 0 })
}

/** Cuánto de un ítem va a una cuenta (0 = sacarlo de esa cuenta). Puede ser fraccionario (½). */
export function asignarItem(cuentaId: number, itemId: number, cantidad: number): Resultado<EstadoCobro> {
  const c = buscarCuenta(cuentaId)
  if (!c) return falla('La cuenta no existe.')
  if (!c.por_items) return falla('La cuenta no es una división por ítems.')
  if (c.estado === 'cobrada') return falla('La cuenta ya se cobró.')
  if (!numeroValido(cantidad) || cantidad < 0) return falla('Cantidad inválida.')
  const item = itemsCobrables(c.comanda_id).find((i) => i.id === itemId)
  if (!item) return falla('El ítem no existe o no se puede cobrar.')
  const otras = db()
    .partes.filter((p) => p.comanda_item_id === itemId && p.cuenta_id !== cuentaId)
    .reduce((s, p) => s + p.cantidad, 0)
  if (otras + cantidad > item.cantidad + EPSILON) return falla('Esa cantidad supera lo que queda sin asignar.')
  if (cantidad < EPSILON) db().partes = db().partes.filter((p) => !(p.cuenta_id === cuentaId && p.comanda_item_id === itemId))
  else ponerParte(cuentaId, itemId, cantidad)
  recalcularImportes(itemId)
  return estadoCobro(c.comanda_id)
}

/** Reparte en partes iguales lo que queda sin asignar de un ítem entre varias cuentas (ej. pizza compartida ½ y ½). */
export function repartirItem(itemId: number, cuentaIds: number[]): Resultado<EstadoCobro> {
  if (!Array.isArray(cuentaIds) || cuentaIds.length < 1) return falla('Elegí al menos una cuenta.')
  const item = db().items.find((i) => i.id === itemId)
  if (!item) return falla('El ítem no existe.')
  const cuentas = cuentaIds.map(buscarCuenta)
  if (cuentas.some((c) => !c || c.comanda_id !== item.comanda_id || !c.por_items || c.estado === 'cobrada'))
    return falla('Alguna de las cuentas no es válida o ya se cobró.')
  const enOtras = db()
    .partes.filter((p) => p.comanda_item_id === itemId && !cuentaIds.includes(p.cuenta_id))
    .reduce((s, p) => s + p.cantidad, 0)
  const disponible = item.cantidad - enOtras
  if (disponible < EPSILON) return falla('No queda nada de ese ítem para repartir.')
  for (const id of cuentaIds) ponerParte(id, itemId, disponible / cuentaIds.length)
  recalcularImportes(itemId)
  return estadoCobro(item.comanda_id)
}

export function descuentoCuenta(cuentaId: number, tipo: TipoDescuento | null, valor: number | null, motivo?: string): Resultado<EstadoCobro> {
  const c = buscarCuenta(cuentaId)
  if (!c) return falla('La cuenta no existe.')
  if (c.estado === 'cobrada') return falla('La cuenta ya se cobró.')
  if (tipo === null) {
    Object.assign(c, { descuento_tipo: null, descuento_valor: null, descuento_motivo: null })
    return estadoCobro(c.comanda_id)
  }
  if (tipo !== 'porcentaje' && tipo !== 'monto') return falla('Tipo de descuento inválido.')
  if (!Number.isInteger(valor) || valor! < 0) return falla('Valor de descuento inválido.')
  if (tipo === 'porcentaje' && valor! > 100) return falla('El porcentaje va de 0 a 100.')
  if (tipo === 'monto' && valor! > armarCuenta(c).subtotal) return falla('El descuento no puede superar el subtotal.')
  Object.assign(c, { descuento_tipo: tipo, descuento_valor: valor, descuento_motivo: textoLimpio(motivo).slice(0, 100) || null })
  return estadoCobro(c.comanda_id)
}

/** null si los pagos están bien para ese total; si no, el motivo. */
function validarPagos(pagos: Pago[], total: number): string | null {
  if (!Array.isArray(pagos) || !pagos.length) return 'Pagos inválidos.'
  for (const p of pagos) {
    if (!p || !MEDIOS_PAGO.includes(p.medio)) return 'Medio de pago inválido.'
    if (!Number.isInteger(p.monto) || p.monto <= 0 || p.monto > MONTO_MAXIMO) return 'Hay un pago con monto inválido.'
    const recibido = p.recibido ?? null
    if (recibido !== null && (p.medio !== 'efectivo' || !Number.isInteger(recibido) || recibido < p.monto || recibido > MONTO_MAXIMO))
      return 'En efectivo, lo recibido tiene que cubrir el monto.'
  }
  const dif = total - pagos.reduce((s, p) => s + p.monto, 0)
  if (dif > 0) return 'Falta cobrar una parte del total.'
  if (dif < 0) return 'Los pagos superan el total.'
  return null
}

/** Cobra una cuenta con todos sus pagos juntos. Los pagos tienen que sumar exacto el total. */
export function cobrarCuenta(cuentaId: number, pagos: Pago[]): Resultado<EstadoCobro> {
  const f = buscarCuenta(cuentaId)
  if (!f) return falla('La cuenta no existe.')
  if (f.estado === 'cobrada') return falla('La cuenta ya se cobró.')
  const r = comandaCobrable(f.comanda_id)
  if (!r.ok) return r
  const turno = turnoAbierto()
  if (!turno) return falla('Abrí la caja antes de cobrar.')
  if (db().items.some((i) => i.comanda_id === f.comanda_id && i.estado === 'pendiente'))
    return falla('Hay ítems sin enviar. Enviá o quitá lo pendiente antes de cobrar.')
  const c = armarCuenta(f)
  if (!c.items.length) return falla('La cuenta no tiene ítems.')
  const invalido = validarPagos(pagos, c.total)
  if (invalido) return falla(invalido)
  for (const p of pagos)
    db().pagos.push({ id: nuevoId(), cuenta_id: cuentaId, medio: p.medio, monto: p.monto, recibido: p.medio === 'efectivo' ? (p.recibido ?? null) : null, turno_id: turno.id })
  // Si se cobra "todo junto", la cuenta guarda en qué ítems se cobró (para no anular algo ya cobrado)
  if (!f.por_items) for (const i of c.items) db().partes.push({ cuenta_id: cuentaId, comanda_item_id: i.comanda_item_id, cantidad: i.cantidad, importe: i.importe })
  Object.assign(f, { estado: 'cobrada', subtotal: c.subtotal, descuento: c.descuento, total: c.total, turno_id: turno.id, cobrada_en: ahora() })
  cerrarSiTodoCobrado(f.comanda_id)
  return estadoCobro(f.comanda_id)
}

// ==================== Corregir un cobro ====================

/** Los cobros de un turno, del más nuevo al más viejo, con sus medios de pago. */
export function cobrosDelTurno(turnoId: number): CobroDelTurno[] {
  return db()
    .cuentas.filter((c) => c.turno_id === turnoId && c.estado === 'cobrada')
    .sort((a, b) => b.cobrada_en!.localeCompare(a.cobrada_en!) || b.id - a.id)
    .map((c) => {
      const co = db().comandas.find((x) => x.id === c.comanda_id)!
      return {
        cuenta_id: c.id,
        comanda_id: c.comanda_id,
        canal: co.canal,
        mesa_nombre: co.mesa_nombre,
        pedido_ref: co.pedido_ref,
        cliente_nombre: co.cliente_nombre,
        cuenta: c.por_items ? c.nombre : null,
        total: c.total!,
        cobrada_en: c.cobrada_en!,
        pagos: armarCuenta(c).pagos,
        correcciones: db().correcciones.filter((x) => x.cuenta_id === c.id).length
      }
    })
}

/** Cambia los medios de pago de un cobro ya hecho (el total no cambia). Solo en el turno abierto. */
export function corregirPagos(cuentaId: number, pagos: Pago[]): Resultado<CobroDelTurno[]> {
  const f = buscarCuenta(cuentaId)
  if (!f) return falla('La cuenta no existe.')
  if (f.estado !== 'cobrada') return falla('Esa cuenta todavía no se cobró.')
  const turno = turnoAbierto()
  if (!turno || f.turno_id !== turno.id)
    return falla('Solo se corrigen cobros del turno abierto: el arqueo de los turnos cerrados ya está hecho.')
  const c = armarCuenta(f)
  const invalido = validarPagos(pagos, c.total)
  if (invalido) return falla(invalido)
  const nuevos = pagos.map((p) => ({ medio: p.medio, monto: p.monto, recibido: p.medio === 'efectivo' ? (p.recibido ?? null) : null }))
  if (JSON.stringify(nuevos) === JSON.stringify(c.pagos)) return falla('No hay cambios para guardar.')
  db().pagos = db().pagos.filter((p) => p.cuenta_id !== cuentaId)
  for (const p of nuevos) db().pagos.push({ id: nuevoId(), cuenta_id: cuentaId, ...p, turno_id: turno.id })
  db().correcciones.push({ cuenta_id: cuentaId, antes: JSON.stringify(c.pagos), despues: JSON.stringify(nuevos) })
  return ok(cobrosDelTurno(turno.id))
}

/** Si ya se cobró todo, borra las cuentas vacías que quedan y libera la mesa. */
export function cerrarSiTodoCobrado(comandaId: number): void {
  if (!algunaCobrada(comandaId)) return
  const pendientes = cuentasDe(comandaId).filter((c) => c.estado === 'pendiente')
  if (pendientes.some((c) => armarCuenta(c).items.length > 0)) return
  const dividida = cuentasDe(comandaId).some((c) => c.por_items)
  if (dividida && partesSinAsignar(comandaId).length > 0) return
  if (db().items.some((i) => i.comanda_id === comandaId && i.estado === 'pendiente')) return
  borrarCuentas(new Set(pendientes.map((c) => c.id)))
  cerrarComanda(comandaId)
}

/** La cuenta cobrada, para el ticket. */
export function verCuenta(cuentaId: number): Resultado<Cuenta> {
  const c = leerCuenta(cuentaId)
  return c ? ok(c) : falla('La cuenta no existe.')
}

/** ¿La comanda tiene la cuenta dividida o algo ya cobrado? (para no unir mesas en ese caso) */
export function tieneCuentas(comandaId: number): boolean {
  return cuentasDe(comandaId).some((c) => c.por_items || c.estado === 'cobrada')
}

/** ¿El ítem ya está en una cuenta cobrada? (no se puede anular) */
export function itemCobrado(itemId: number): boolean {
  return db().partes.some((p) => p.comanda_item_id === itemId && buscarCuenta(p.cuenta_id)?.estado === 'cobrada')
}
