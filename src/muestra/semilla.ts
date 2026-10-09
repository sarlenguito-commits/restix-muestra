// Datos de muestra: un bar inventado, con su plano, su carta, su stock y una semana de turnos ya trabajados.
// El historial se arma con las mismas operaciones que usan las pantallas (abrir mesa, enviar, cobrar, cerrar caja),
// moviendo el reloj hacia atrás. Así los números de Caja y Resúmenes cierran igual que en el uso real.

import { MEDIOS_SALON, type Destino, type FormaMesa, type MedioPago, type TipoElemento, type TipoSalon, type Unidad } from '@shared/types'
import { db, moverReloj, usarDatos, type Datos } from './base'
import { ajustarStock, crearCategoria, crearInsumo, crearProducto, guardarReceta } from './catalogo'
import {
  abrirTurno,
  cerrarTurno,
  chicaSugerida,
  cobrarCuenta,
  cobroTodoJunto,
  descuentoCuenta,
  pagarPersonal,
  registrarMovimiento,
  resumenTurno
} from './cobros'
import { abrirMesa, agregarItem, enviar, imprimirCuenta, marcarEntregado } from './comandas'
import { tamanioInicial } from './plano'

/** Números al azar pero siempre los mismos (la muestra arranca igual para todos) */
function azarConSemilla(semilla: number) {
  let s = semilla
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pesos = (p: number) => p * 100

const CARTA: { categoria: string; productos: [string, number, Destino][] }[] = [
  { categoria: 'Pizzas', productos: [['Muzzarella', 12000, 'cocina'], ['Napolitana', 14000, 'cocina'], ['Fugazzeta', 14500, 'cocina'], ['Calabresa', 15000, 'cocina']] },
  { categoria: 'Hamburguesas', productos: [['Clásica', 11000, 'cocina'], ['Cheddar y panceta', 13500, 'cocina'], ['Veggie', 12000, 'cocina']] },
  { categoria: 'Para picar', productos: [['Papas fritas', 7000, 'cocina'], ['Papas con cheddar', 9000, 'cocina'], ['Rabas', 16000, 'cocina'], ['Provoleta', 9500, 'cocina']] },
  { categoria: 'Postres', productos: [['Flan con dulce de leche', 5500, 'cocina'], ['Brownie con helado', 7000, 'cocina']] },
  { categoria: 'Cervezas', productos: [['Rubia (pinta)', 5500, 'barra'], ['Roja (pinta)', 5500, 'barra'], ['IPA (pinta)', 6000, 'barra'], ['Porrón 1 l', 8000, 'barra']] },
  { categoria: 'Tragos', productos: [['Fernet con cola', 7500, 'barra'], ['Gin tonic', 8500, 'barra'], ['Aperol spritz', 8500, 'barra'], ['Mojito', 8000, 'barra']] },
  { categoria: 'Sin alcohol', productos: [['Gaseosa 500 ml', 3500, 'barra'], ['Agua 500 ml', 2800, 'barra'], ['Limonada', 4500, 'barra'], ['Café', 2500, 'barra']] }
]

/** [nombre, unidad, stock inicial, stock mínimo] */
const INSUMOS: [string, Unidad, number, number][] = [
  ['Bollo de pizza', 'u', 120, 20],
  ['Muzzarella', 'g', 40000, 5000],
  ['Pan de hamburguesa', 'u', 100, 20],
  ['Medallón de carne', 'u', 100, 20],
  ['Medallón veggie', 'u', 30, 10],
  ['Cheddar', 'g', 6000, 1000],
  ['Panceta', 'g', 5000, 1000],
  ['Papas congeladas', 'g', 40000, 6000],
  ['Rabas', 'g', 9000, 3000],
  ['Provoleta', 'u', 30, 6],
  ['Barril rubia', 'ml', 100000, 20000],
  ['Barril roja', 'ml', 60000, 20000],
  ['Barril IPA', 'ml', 60000, 20000],
  ['Fernet', 'ml', 9000, 2000],
  ['Gin', 'ml', 6000, 1500],
  ['Aperol', 'ml', 6000, 1500],
  ['Gaseosa 500 ml', 'u', 120, 24],
  ['Agua 500 ml', 'u', 96, 24],
  ['Limones', 'u', 80, 20],
  ['Café en grano', 'g', 3000, 500]
]

/** Qué gasta cada producto: [producto, [insumo, cantidad][]] */
const RECETAS: [string, [string, number][]][] = [
  ['Muzzarella', [['Bollo de pizza', 1], ['Muzzarella', 250]]],
  ['Napolitana', [['Bollo de pizza', 1], ['Muzzarella', 250]]],
  ['Fugazzeta', [['Bollo de pizza', 1], ['Muzzarella', 300]]],
  ['Calabresa', [['Bollo de pizza', 1], ['Muzzarella', 250]]],
  ['Clásica', [['Pan de hamburguesa', 1], ['Medallón de carne', 1]]],
  ['Cheddar y panceta', [['Pan de hamburguesa', 1], ['Medallón de carne', 1], ['Cheddar', 40], ['Panceta', 40]]],
  ['Veggie', [['Pan de hamburguesa', 1], ['Medallón veggie', 1]]],
  ['Papas fritas', [['Papas congeladas', 300]]],
  ['Papas con cheddar', [['Papas congeladas', 300], ['Cheddar', 60]]],
  ['Rabas', [['Rabas', 250]]],
  ['Provoleta', [['Provoleta', 1]]],
  ['Rubia (pinta)', [['Barril rubia', 500]]],
  ['Roja (pinta)', [['Barril roja', 500]]],
  ['IPA (pinta)', [['Barril IPA', 500]]],
  ['Porrón 1 l', [['Barril rubia', 1000]]],
  ['Fernet con cola', [['Fernet', 100], ['Gaseosa 500 ml', 0.5]]],
  ['Gin tonic', [['Gin', 60]]],
  ['Aperol spritz', [['Aperol', 90]]],
  ['Mojito', [['Limones', 1]]],
  ['Gaseosa 500 ml', [['Gaseosa 500 ml', 1]]],
  ['Agua 500 ml', [['Agua 500 ml', 1]]],
  ['Limonada', [['Limones', 2]]],
  ['Café', [['Café en grano', 15]]]
]

const PERSONAL: [string, 'mozo' | 'cocina' | 'barra'][] = [
  ['Carla', 'mozo'],
  ['Diego', 'mozo'],
  ['Lucía', 'mozo'],
  ['Rosa', 'cocina'],
  ['Tomás', 'barra']
]

type Plano = [TipoElemento, number, number, { nombre?: string; forma?: FormaMesa; ancho?: number; alto?: number; rotacion?: number }?][]

const SALON: Plano = [
  ['pared', 450, 0, { ancho: 912 }],
  ['pared', 450, 560, { ancho: 912 }],
  ['pared', 0, 280, { ancho: 12, alto: 572 }],
  ['pared', 900, 280, { ancho: 12, alto: 572 }],
  ['puerta', 450, 560, { ancho: 100 }],
  ['barra', 700, 70, { nombre: 'Barra', ancho: 300 }],
  ['mesa', 110, 200, { nombre: '1' }],
  ['mesa', 250, 200, { nombre: '2' }],
  ['mesa', 390, 200, { nombre: '3' }],
  ['mesa', 530, 200, { nombre: '4' }],
  ['mesa', 160, 400, { nombre: '5', forma: 'rectangular' }],
  ['mesa', 400, 400, { nombre: '6', forma: 'rectangular' }],
  ['mesa', 640, 330, { nombre: '7' }],
  ['mesa', 780, 330, { nombre: '8' }],
  ['columna', 320, 290],
  ['columna', 560, 290],
  ['planta', 40, 40],
  ['planta', 860, 520],
  ['texto', 450, 520, { nombre: 'Entrada' }]
]

const TERRAZA: Plano = [
  ['pared', 300, 0, { ancho: 612 }],
  ['mesa', 100, 120, { nombre: '9' }],
  ['mesa', 250, 120, { nombre: '10' }],
  ['mesa', 400, 120, { nombre: '11' }],
  ['mesa', 175, 280, { nombre: '12', forma: 'rectangular' }],
  ['mesa', 420, 280, { nombre: '13', forma: 'rectangular' }],
  ['planta', 40, 380],
  ['planta', 560, 380],
  ['texto', 300, 380, { nombre: 'Terraza' }]
]

/** Pedidos Ya y Delivery: casilleros fijos (PY 1…6, D 1…6), igual que en Restix */
const casilleros = (prefijo: string): Plano =>
  [0, 1, 2, 3, 4, 5].map((i) => ['mesa', 100 + (i % 3) * 160, 100 + Math.floor(i / 3) * 160, { nombre: `${prefijo} ${i + 1}`, ancho: 110, alto: 110 }])

function vacio(): Datos {
  return {
    ultimoId: 0,
    salones: [],
    elementos: [],
    categorias: [],
    productos: [],
    insumos: [],
    recetas: [],
    movimientosStock: [],
    mozos: [],
    comandas: [],
    items: [],
    cuentas: [],
    partes: [],
    pagos: [],
    correcciones: [],
    turnos: [],
    movimientosCaja: [],
    local: { nombre: 'Bar El Patio', direccion: 'Av. de Ejemplo 1234', pie: '¡Gracias por venir! · Muestra de Restix' },
    tema: 'oscuro',
    comisionPedidosYa: 22
  }
}

function armarPlano(nombre: string, tipo: TipoSalon, orden: number, plano: Plano): void {
  const d = db()
  const salon = { id: ++d.ultimoId, nombre, orden, tipo }
  d.salones.push(salon)
  plano.forEach(([t, x, y, extra = {}], capa) => {
    const forma = t === 'mesa' ? (extra.forma ?? 'cuadrada') : null
    const tam = tamanioInicial(t, forma)
    d.elementos.push({
      id: ++d.ultimoId,
      salon_id: salon.id,
      tipo: t,
      forma,
      nombre: extra.nombre ?? null,
      lugares: forma && tipo === 'salon' ? (forma === 'rectangular' ? 6 : 4) : null,
      x,
      y,
      ancho: extra.ancho ?? tam.ancho,
      alto: extra.alto ?? tam.alto,
      rotacion: extra.rotacion ?? 0,
      capa
    })
  })
}

/** Lo que se espera de un Resultado del armado: si falla, es un error de la semilla (no del usuario) */
function seguro<T>(r: { ok: true; dato: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`Datos de muestra: ${r.error}`)
  return r.dato
}

export function crearDatosDeMuestra(ahoraReal = Date.now()): Datos {
  const d = vacio()
  usarDatos(d)
  const azar = azarConSemilla(2026)
  const elegir = <T>(lista: T[]) => lista[Math.floor(azar() * lista.length)]

  // Reloj: "día" días atrás, a la hora y minutos indicados. El turno de hoy abrió hace 3 horas: los días se cuentan
  // desde esa fecha (si alguien entra a la 1 de la mañana, "hoy" sigue siendo el día en que abrió la caja)
  const hoy0 = new Date(ahoraReal - 3 * 3600000)
  hoy0.setHours(0, 0, 0, 0)
  const en = (dia: number, hora: number, minutos = 0) =>
    moverReloj(hoy0.getTime() - dia * 86400000 + (hora * 60 + minutos) * 60000 - ahoraReal)

  // ---------- Plano, carta, stock y personal (una semana atrás) ----------
  en(8, 12)
  armarPlano('Salón', 'salon', 0, SALON)
  armarPlano('Terraza', 'salon', 1, TERRAZA)
  armarPlano('Pedidos Ya', 'pedidosya', 2, casilleros('PY'))
  armarPlano('Delivery', 'delivery', 3, casilleros('D'))

  for (const { categoria, productos } of CARTA) {
    const c = seguro(crearCategoria(categoria))
    for (const [nombre, precio, destino] of productos) seguro(crearProducto({ categoria_id: c.id, nombre, precio: pesos(precio), destino }))
  }
  for (const [nombre, unidad, inicial, minimo] of INSUMOS)
    seguro(crearInsumo({ nombre, unidad, stock_inicial: inicial, stock_minimo: minimo }))
  const insumo = (n: string) => d.insumos.find((i) => i.nombre === n)!.id
  for (const [producto, receta] of RECETAS) {
    const p = d.productos.find((x) => x.nombre === producto)!
    seguro(guardarReceta(p.id, receta.map(([n, cantidad]) => ({ insumo_id: insumo(n), cantidad }))))
  }
  PERSONAL.forEach(([nombre, rol]) => d.mozos.push({ id: ++d.ultimoId, nombre, rol, activo: true }))

  const mozos = d.mozos.filter((m) => m.rol === 'mozo')
  const mesa = (nombre: string) => d.elementos.find((e) => e.nombre === nombre)!.id
  const comida = d.productos.filter((p) => p.destino === 'cocina')
  const bebida = d.productos.filter((p) => p.destino === 'barra')

  /** Una mesa entera: abre, pide, manda, entrega y (si se indica) pide la cuenta y cobra */
  const atender = (dia: number, hora: number, minuto: number, nombreMesa: string, cobrar: boolean) => {
    en(dia, hora, minuto)
    const pedidosYa = nombreMesa.startsWith('PY')
    const delivery = nombreMesa.startsWith('D ')
    const comanda = seguro(
      abrirMesa(mesa(nombreMesa), {
        mozo_id: pedidosYa || delivery ? null : elegir(mozos).id,
        comensales: pedidosYa || delivery ? null : 2 + Math.floor(azar() * 3),
        pedido_ref: pedidosYa ? String(40000 + Math.floor(azar() * 9999)) : null,
        cliente_nombre: delivery ? elegir(['Vecino de la esquina', 'Oficina del 3.º', 'Cliente de siempre']) : null,
        cliente_direccion: delivery ? 'Av. de Ejemplo 1500' : null,
        cliente_telefono: null
      })
    )
    for (let i = 0; i < 1 + Math.floor(azar() * 3); i++) seguro(agregarItem(comanda.id, elegir(comida).id, 1 + Math.floor(azar() * 2)))
    if (!pedidosYa && !delivery)
      for (let i = 0; i < 1 + Math.floor(azar() * 3); i++) seguro(agregarItem(comanda.id, elegir(bebida).id, 1 + Math.floor(azar() * 3)))
    const envio = seguro(enviar(comanda.id))
    en(dia, hora, minuto + 25)
    seguro(marcarEntregado(comanda.id, envio.numero, true))
    if (!cobrar) return comanda.id
    en(dia, hora, minuto + 70)
    seguro(imprimirCuenta(comanda.id))
    const cuenta = seguro(cobroTodoJunto(comanda.id)).cuentas[0]
    if (azar() < 0.15) seguro(descuentoCuenta(cuenta.id, 'porcentaje', 10, 'Cliente frecuente'))
    const total = seguro(cobroTodoJunto(comanda.id)).cuentas[0].total
    const medio: MedioPago = pedidosYa ? (azar() < 0.8 ? 'pedidosya' : 'efectivo') : elegir(MEDIOS_SALON)
    // En efectivo, a veces paga justo y a veces con un billete más grande (hay vuelto)
    const recibido = medio === 'efectivo' && azar() < 0.6 ? Math.ceil(total / pesos(5000)) * pesos(5000) : null
    seguro(cobrarCuenta(cuenta.id, [{ medio, monto: total, recibido: recibido && recibido > total ? recibido : null }]))
    return comanda.id
  }

  // ---------- Una semana de turnos cerrados ----------
  for (let dia = 7; dia >= 1; dia--) {
    // Turnos de 18:30 a 23:45 (cierran antes de medianoche: no se pisan con el de hoy)
    en(dia, 18, 30)
    seguro(abrirTurno(chicaSugerida() || pesos(30000)))
    if (dia === 7) seguro(registrarMovimiento({ tipo: 'ingreso', destino: 'gastos', monto: pesos(80000), motivo: 'Fondo para compras' }))
    const mesas = ['1', '2', '3', '4', '5', '6', '7', '8', 'Barra', '9', '10', '11', '12', '13']
    const cantidad = 7 + Math.floor(azar() * 6)
    for (let i = 0; i < cantidad; i++) atender(dia, 19, i * 16, mesas[i % mesas.length], true)
    atender(dia, 20, 15, 'PY 1', true)
    if (azar() < 0.6) atender(dia, 21, 0, 'D 1', true)
    en(dia, 23, 15)
    seguro(registrarMovimiento({ tipo: 'gasto', monto: pesos(6000 + Math.floor(azar() * 8) * 1000), motivo: elegir(['Hielo', 'Limones y menta', 'Artículos de limpieza', 'Servilletas']) }))
    if (dia % 3 === 1) seguro(pagarPersonal({ persona_id: elegir(mozos).id, deChica: 0, deGrande: pesos(25000), motivo: 'Adelanto' }))
    // Al cerrar se cuenta lo que hay: casi siempre justo, alguna vez sobra o falta un poco
    en(dia, 23, 45)
    const r = resumenTurno(d.turnos.at(-1)!.id)!
    const diferencia = azar() < 0.3 ? pesos(elegir([-500, 200, -1000])) : 0
    seguro(cerrarTurno(r.cajas.chica.esperado, r.cajas.grande.esperado + diferencia))
  }

  // ---------- Hoy: caja abierta y el salón en movimiento ----------
  const hace = (minutos: number) => moverReloj(-minutos * 60000)
  hace(180)
  seguro(abrirTurno(chicaSugerida()))
  hace(170)
  atenderHoy('3', true)
  // Mesa 2: comieron y siguen (cocina ya entregó); Mesa 5: pidieron la cuenta (roja)
  atenderHoy('2', false)
  const mesa5 = atenderHoy('5', false)
  hace(20)
  seguro(imprimirCuenta(mesa5))
  // Mesa 7 y Barra: lo último salió recién y la cocina todavía lo está preparando
  for (const nombre of ['7', 'Barra']) {
    hace(12)
    const c = seguro(
      abrirMesa(mesa(nombre), { mozo_id: elegir(mozos).id, comensales: nombre === 'Barra' ? 1 : 3 })
    )
    seguro(agregarItem(c.id, elegir(comida).id, 1))
    seguro(agregarItem(c.id, elegir(bebida).id, 2))
    seguro(enviar(c.id))
  }
  hace(8)
  const py = seguro(abrirMesa(mesa('PY 2'), { mozo_id: null, comensales: null, pedido_ref: '48213' }))
  seguro(agregarItem(py.id, d.productos.find((p) => p.nombre === 'Muzzarella')!.id, 2))
  seguro(enviar(py.id))

  // Conteo de stock: quedaron pocas rabas y medallones veggie (aparecen en rojo en Stock)
  hace(5)
  seguro(ajustarStock(insumo('Rabas'), 1500, 'Conteo del mediodía'))
  seguro(ajustarStock(insumo('Medallón veggie'), 6, 'Conteo del mediodía'))

  moverReloj(0)
  return d

  /** Mesas de hoy: abren hace un rato (en minutos relativos a ahora) */
  function atenderHoy(nombreMesa: string, cobrar: boolean): number {
    const comanda = seguro(abrirMesa(mesa(nombreMesa), { mozo_id: elegir(mozos).id, comensales: 2 + Math.floor(azar() * 3) }))
    seguro(agregarItem(comanda.id, elegir(comida).id, 1 + Math.floor(azar() * 2)))
    seguro(agregarItem(comanda.id, elegir(bebida).id, 2))
    const envio = seguro(enviar(comanda.id))
    seguro(marcarEntregado(comanda.id, envio.numero, true))
    if (cobrar) {
      const cuenta = seguro(cobroTodoJunto(comanda.id)).cuentas[0]
      seguro(cobrarCuenta(cuenta.id, [{ medio: 'debito', monto: cuenta.total, recibido: null }]))
    }
    return comanda.id
  }
}
