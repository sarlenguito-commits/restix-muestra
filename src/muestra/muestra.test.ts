import { beforeEach, describe, expect, it } from 'vitest'
import type { Resultado } from '@shared/types'
import { db, usarDatos } from './base'
import * as catalogo from './catalogo'
import * as cobros from './cobros'
import * as comandas from './comandas'
import * as plano from './plano'
import { crearDatosDeMuestra } from './semilla'

/** Un resultado que tiene que salir bien (si no, la prueba falla mostrando el motivo) */
function bien<T>(r: Resultado<T>): T {
  if (!r.ok) throw new Error(r.error)
  return r.dato
}

/** Un resultado que tiene que fallar, con un mensaje que contenga `texto` */
function mal<T>(r: Resultado<T>, texto: string): void {
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error).toContain(texto)
}

const MIERCOLES_21HS = new Date(2026, 9, 7, 21, 0).getTime()

const mesa = (nombre: string) => db().elementos.find((e) => e.nombre === nombre)!.id
const producto = (nombre: string) => db().productos.find((p) => p.nombre === nombre)!.id
const stock = (nombre: string) => db().insumos.find((i) => i.nombre === nombre)!.stock

beforeEach(() => {
  usarDatos(crearDatosDeMuestra(MIERCOLES_21HS))
})

describe('datos de muestra', () => {
  it('arma el bar: salones, carta, stock, personal y una semana de turnos', () => {
    expect(plano.listarSalones().map((s) => s.nombre)).toEqual(['Salón', 'Terraza', 'Pedidos Ya', 'Delivery'])
    expect(catalogo.listarProductos().length).toBe(25)
    expect(comandas.listarMozos().length).toBe(5)
    expect(db().turnos.filter((t) => t.estado === 'cerrado').length).toBe(7)
    expect(cobros.turnoAbierto()).not.toBeNull()
  })

  it('es siempre la misma (mismos números para todos)', () => {
    const otra = crearDatosDeMuestra(MIERCOLES_21HS)
    expect(JSON.stringify(otra.pagos)).toBe(JSON.stringify(crearDatosDeMuestra(MIERCOLES_21HS).pagos))
  })

  it('cada turno cerrado cuadra: lo vendido es igual a lo cobrado por medio de pago', () => {
    for (const t of cobros.listarTurnos()) {
      const r = cobros.resumenTurno(t.id)!
      const porMedio = Object.values(r.porMedio).reduce((s, v) => s + v, 0)
      expect(porMedio).toBe(r.ventas)
      expect(r.porMozo.reduce((s, m) => s + m.total, 0)).toBe(r.ventas)
    }
  })

  it('los turnos no se pisan, aunque se entre a la muestra de madrugada', () => {
    for (const hora of [MIERCOLES_21HS, new Date(2026, 9, 9, 0, 55).getTime(), new Date(2026, 9, 9, 4, 0).getTime()]) {
      usarDatos(crearDatosDeMuestra(hora))
      const turnos = [...db().turnos].sort((a, b) => a.abierto_en.localeCompare(b.abierto_en))
      for (let i = 1; i < turnos.length; i++) expect(turnos[i].abierto_en > turnos[i - 1].cerrado_en!).toBe(true)
    }
  })

  it('deja el salón en movimiento: mesas abiertas, una con la cuenta pedida y cocina con pendientes', () => {
    const estados = plano.estadosMesas(db().salones[0].id)
    expect(Object.values(estados)).toContain('activa')
    expect(Object.values(estados)).toContain('cobrando')
    expect(comandas.pendientesCocina().length).toBeGreaterThan(0)
  })

  it('deja insumos con stock bajo para que se vea el aviso', () => {
    const bajos = catalogo.listarInsumos().filter((i) => i.stock <= i.stock_minimo)
    expect(bajos.map((i) => i.nombre)).toEqual(expect.arrayContaining(['Rabas', 'Medallón veggie']))
  })
})

describe('una mesa de punta a punta', () => {
  it('abre, pide, manda a cocina (descuenta stock) y cobra (libera la mesa)', () => {
    const antes = stock('Bollo de pizza')
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: db().mozos[0].id, comensales: 2 }))
    bien(comandas.agregarItem(c.id, producto('Muzzarella'), 2))
    bien(comandas.agregarItem(c.id, producto('Rubia (pinta)'), 2))
    const envio = bien(comandas.enviar(c.id))
    expect(envio.items.length).toBe(2)
    expect(stock('Bollo de pizza')).toBe(antes - 2)

    const cuenta = bien(cobros.cobroTodoJunto(c.id)).cuentas[0]
    expect(cuenta.total).toBe(2 * 1_200_000 + 2 * 550_000)
    const r = bien(cobros.cobrarCuenta(cuenta.id, [{ medio: 'efectivo', monto: cuenta.total, recibido: 4_000_000 }]))
    expect(r.comanda.estado).toBe('cerrada')
    expect(comandas.comandaEnCurso(mesa('1'))).toBeNull()
  })

  it('al anular algo enviado sin preparar, los insumos vuelven al stock', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    bien(comandas.agregarItem(c.id, producto('Fugazzeta'), 3))
    bien(comandas.enviar(c.id))
    const antes = stock('Muzzarella')
    const item = comandas.leerComanda(c.id)!.items[0]
    const despues = bien(comandas.anularItem(item.id, 1, 'Se equivocó el mozo', true))
    expect(stock('Muzzarella')).toBe(antes + 300)
    expect(despues.items.filter((i) => i.estado === 'anulado').map((i) => i.cantidad)).toEqual([1])
    expect(despues.total).toBe(2 * 1_450_000)
  })

  it('no deja cobrar con la caja cerrada', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    bien(comandas.agregarItem(c.id, producto('Café'), 1))
    bien(comandas.enviar(c.id))
    const r = cobros.resumenTurno(cobros.turnoAbierto()!.id)!
    bien(cobros.cerrarTurno(r.cajas.chica.esperado, r.cajas.grande.esperado))
    const cuenta = bien(cobros.cobroTodoJunto(c.id)).cuentas[0]
    mal(cobros.cobrarCuenta(cuenta.id, [{ medio: 'debito', monto: cuenta.total, recibido: null }]), 'Abrí la caja')
  })

  it('lo ya cobrado no se puede anular', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    bien(comandas.agregarItem(c.id, producto('Café'), 2))
    bien(comandas.enviar(c.id))
    const cuentas = bien(cobros.dividirPorItems(c.id, 2)).cuentas
    const item = comandas.leerComanda(c.id)!.items[0]
    bien(cobros.asignarItem(cuentas[0].id, item.id, 1))
    bien(cobros.cobrarCuenta(cuentas[0].id, [{ medio: 'debito', monto: 250_000, recibido: null }]))
    mal(comandas.anularItem(item.id, 2, 'prueba', false), 'ya se cobró')
  })
})

describe('dividir la cuenta', () => {
  it('una pizza compartida entre tres se reparte sin perder un centavo', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: 3 }))
    const p = bien(catalogo.crearProducto({ categoria_id: db().categorias[0].id, nombre: 'Pizza de prueba', precio: 1_000_000 }))
    bien(comandas.agregarItem(c.id, p.id, 1))
    bien(comandas.enviar(c.id))
    const cuentas = bien(cobros.dividirPorItems(c.id, 3)).cuentas
    const item = comandas.leerComanda(c.id)!.items[0]
    const estado = bien(cobros.repartirItem(item.id, cuentas.map((x) => x.id)))
    expect(estado.cuentas.map((x) => x.total)).toEqual([333_333, 333_333, 333_334])
    expect(estado.sinAsignar).toEqual([])
    for (const cuenta of estado.cuentas) bien(cobros.cobrarCuenta(cuenta.id, [{ medio: 'transferencia', monto: cuenta.total, recibido: null }]))
    expect(comandas.leerComanda(c.id)!.estado).toBe('cerrada')
  })

  it('el descuento en % se aplica sobre el subtotal de la cuenta', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    bien(comandas.agregarItem(c.id, producto('Rabas'), 1))
    bien(comandas.enviar(c.id))
    const cuenta = bien(cobros.cobroTodoJunto(c.id)).cuentas[0]
    const r = bien(cobros.descuentoCuenta(cuenta.id, 'porcentaje', 10, 'Cumpleaños'))
    expect(r.cuentas[0].descuento).toBe(160_000)
    expect(r.cuentas[0].total).toBe(1_440_000)
  })
})

describe('mesas', () => {
  it('unir mesas suma los ítems en la de destino y libera la de origen', () => {
    const a = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: 2 }))
    bien(comandas.agregarItem(a.id, producto('Café'), 2))
    bien(comandas.enviar(a.id))
    const b = bien(comandas.abrirMesa(mesa('4'), { mozo_id: null, comensales: 2 }))
    bien(comandas.agregarItem(b.id, producto('Agua 500 ml'), 1))
    bien(comandas.enviar(b.id))
    const unida = bien(comandas.unirMesas(a.id, mesa('4')))
    expect(unida.id).toBe(b.id)
    expect(unida.total).toBe(2 * 250_000 + 280_000)
    expect(comandas.comandaEnCurso(mesa('1'))).toBeNull()
  })

  it('no deja borrar una mesa con una comanda en curso', () => {
    const ocupada = db().comandas.find((c) => c.estado === 'abierta' && c.canal === 'salon')!
    mal(plano.borrarElemento(ocupada.elemento_id!), 'comanda en curso')
  })

  it('dos mesas no pueden llamarse igual', () => {
    mal(plano.crearElemento({ salon_id: db().salones[0].id, tipo: 'mesa', nombre: '1', x: 0, y: 0 }), 'Ya existe')
  })
})

describe('cocina', () => {
  it('lo que sale a cocina queda pendiente hasta que se marca entregado', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    bien(comandas.agregarItem(c.id, producto('Provoleta'), 1))
    bien(comandas.agregarItem(c.id, producto('Gin tonic'), 1))
    const envio = bien(comandas.enviar(c.id))
    const tarjeta = comandas.pendientesCocina().find((e) => e.comanda_id === c.id)!
    // La barra no aparece en cocina: solo la provoleta
    expect(tarjeta.items.map((i) => i.nombre)).toEqual(['Provoleta'])
    bien(comandas.marcarEntregado(c.id, envio.numero, true))
    expect(comandas.pendientesCocina().some((e) => e.comanda_id === c.id)).toBe(false)
  })
})

describe('topes contra valores absurdos', () => {
  it('rechaza precios, cantidades y montos fuera de rango', () => {
    const categoria = db().categorias[0].id
    mal(catalogo.crearProducto({ categoria_id: categoria, nombre: 'Caro', precio: 10_000_000_001 }), 'Precio inválido')
    mal(catalogo.crearProducto({ categoria_id: categoria, nombre: 'Negativo', precio: -1 }), 'Precio inválido')
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    mal(comandas.agregarItem(c.id, producto('Café'), 100), 'Cantidad inválida')
    mal(cobros.registrarMovimiento({ tipo: 'gasto', monto: 10_000_000_001, motivo: 'error de tipeo' }), 'mayor a cero')
    mal(catalogo.ingresarStock(db().insumos[0].id, Number.POSITIVE_INFINITY), 'mayor a cero')
  })

  it('los pagos tienen que sumar exacto el total', () => {
    const c = bien(comandas.abrirMesa(mesa('1'), { mozo_id: null, comensales: null }))
    bien(comandas.agregarItem(c.id, producto('Café'), 1))
    bien(comandas.enviar(c.id))
    const cuenta = bien(cobros.cobroTodoJunto(c.id)).cuentas[0]
    mal(cobros.cobrarCuenta(cuenta.id, [{ medio: 'debito', monto: 100, recibido: null }]), 'Falta cobrar')
    mal(cobros.cobrarCuenta(cuenta.id, [{ medio: 'efectivo', monto: cuenta.total, recibido: 1 }]), 'lo recibido')
  })
})

describe('caja', () => {
  it('el turno nuevo arranca con lo que se contó en la caja chica al cerrar el anterior', () => {
    const r = cobros.resumenTurno(cobros.turnoAbierto()!.id)!
    bien(cobros.cerrarTurno(r.cajas.chica.esperado + 1000, r.cajas.grande.esperado))
    expect(cobros.chicaSugerida()).toBe(r.cajas.chica.esperado + 1000)
    expect(bien(cobros.abrirTurno()).efectivo_inicial).toBe(r.cajas.chica.esperado + 1000)
  })

  it('solo se corrigen medios de pago de cobros del turno abierto', () => {
    const viejo = cobros.listarTurnos().find((t) => t.estado === 'cerrado')!
    const cobro = cobros.cobrosDelTurno(viejo.id)[0]
    mal(cobros.corregirPagos(cobro.cuenta_id, [{ medio: 'debito', monto: cobro.total, recibido: null }]), 'turno abierto')
  })
})
