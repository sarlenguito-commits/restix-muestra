// La API que usan las pantallas (window.restix). En Restix cada función viaja por IPC al proceso principal de
// Electron; acá llama directo al backend de muestra y guarda en el navegador después de cada operación.

import type { Tema } from '@shared/types'
import { borrarGuardado, db, falla, guardar, leerGuardado, ok, usarDatos } from './base'
import * as catalogo from './catalogo'
import * as cobros from './cobros'
import * as comandas from './comandas'
import * as plano from './plano'
import { crearDatosDeMuestra } from './semilla'

/** PIN de ADMIN de la muestra (se muestra en la ventana del PIN) */
export const PIN_MUESTRA = '1234'

/** Envuelve cada función: responde como promesa (igual que Restix) y guarda los cambios. */
function api<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const r = fn(...args)
    guardar()
    return r
  }
}

export const restix = {
  registro: {
    anotar: async (texto: string) => console.error(texto)
  },
  muestra: {
    /** Borra todo lo hecho y vuelve a los datos de muestra del principio */
    reiniciar: () => {
      borrarGuardado()
      usarDatos(crearDatosDeMuestra())
      guardar()
    }
  },
  pin: {
    verificar: async (pin: string) => (pin === PIN_MUESTRA ? ok(null) : falla('PIN incorrecto.'))
  },
  tema: {
    get: async (): Promise<Tema> => db().tema,
    set: api((tema: Tema) => {
      db().tema = tema === 'claro' ? 'claro' : 'oscuro'
    })
  },
  local: {
    ver: async () => structuredClone(db().local)
  },
  salones: {
    listar: api(plano.listarSalones),
    crear: api(plano.crearSalon),
    renombrar: api(plano.renombrarSalon),
    borrar: api(plano.borrarSalon)
  },
  elementos: {
    listar: api(plano.listarElementos),
    crear: api(plano.crearElemento),
    actualizar: api(plano.actualizarElemento),
    borrar: api(plano.borrarElemento)
  },
  mesas: {
    estados: api(plano.estadosMesas)
  },
  categorias: {
    listar: api(catalogo.listarCategorias),
    crear: api(catalogo.crearCategoria),
    renombrar: api(catalogo.renombrarCategoria),
    borrar: api(catalogo.borrarCategoria)
  },
  productos: {
    listar: api(catalogo.listarProductos),
    crear: api(catalogo.crearProducto),
    actualizar: api(catalogo.actualizarProducto),
    borrar: api(catalogo.borrarProducto)
  },
  recetas: {
    todas: api(catalogo.todasLasRecetas),
    ver: api(catalogo.verReceta),
    guardar: api(catalogo.guardarReceta)
  },
  insumos: {
    listar: api(catalogo.listarInsumos),
    crear: api(catalogo.crearInsumo),
    actualizar: api(catalogo.actualizarInsumo),
    borrar: api(catalogo.borrarInsumo)
  },
  stock: {
    ingresar: api(catalogo.ingresarStock),
    ajustar: api(catalogo.ajustarStock),
    movimientos: api(catalogo.listarMovimientos)
  },
  mozos: {
    listar: api(comandas.listarMozos)
  },
  comandas: {
    enCurso: api(comandas.comandaEnCurso),
    abrir: api(comandas.abrirMesa),
    actualizarApertura: api(comandas.actualizarApertura),
    cancelar: api(comandas.cancelarComanda),
    /** En Restix pide el PIN de ADMIN también en el proceso principal; acá la pantalla ya lo pidió */
    anularPedido: api((id: number, motivo: string, devolverStock: boolean, pin: string) =>
      pin === PIN_MUESTRA ? comandas.anularPedido(id, motivo, devolverStock) : falla('PIN incorrecto.')
    ),
    agregar: api(comandas.agregarItem),
    cambiarItem: api(comandas.cambiarItem),
    quitarItem: api(comandas.quitarItem),
    enviar: api(comandas.enviar),
    verEnvio: api(comandas.verEnvio),
    anularItem: api(comandas.anularItem),
    imprimirCuenta: api(comandas.imprimirCuenta),
    cerrar: api(comandas.cerrarComanda),
    pasar: api(comandas.pasarMesa),
    unir: api(comandas.unirMesas)
  },
  cocina: {
    pendientes: api(comandas.pendientesCocina),
    entregados: api(comandas.entregadosHoy),
    entregar: api(comandas.marcarEntregado)
  },
  caja: {
    turno: api(cobros.turnoAbierto),
    chicaSugerida: api(cobros.chicaSugerida),
    abrir: api(cobros.abrirTurno),
    movimiento: api(cobros.registrarMovimiento),
    pagarPersonal: api(cobros.pagarPersonal),
    borrarMovimiento: api((id: number, pin: string) => (pin === PIN_MUESTRA ? cobros.borrarMovimiento(id) : falla('PIN incorrecto.'))),
    gastos: api(() => ({ saldo: cobros.saldoGastos(), movimientos: cobros.movimientosGastos() })),
    resumen: api(cobros.resumenTurno),
    cerrar: api(cobros.cerrarTurno),
    turnos: api(cobros.listarTurnos),
    meses: api(cobros.mesesConTurnos),
    productosVendidos: api(cobros.productosVendidos),
    cobros: api(cobros.cobrosDelTurno),
    corregirPagos: api((cuentaId: number, pagos: Parameters<typeof cobros.corregirPagos>[1], pin: string) =>
      pin === PIN_MUESTRA ? cobros.corregirPagos(cuentaId, pagos) : falla('PIN incorrecto.')
    )
  },
  cobro: {
    estado: api(cobros.estadoCobro),
    todoJunto: api(cobros.cobroTodoJunto),
    dividir: api(cobros.dividirPorItems),
    deshacerDivision: api(cobros.deshacerDivision),
    agregarCuenta: api(cobros.agregarCuenta),
    quitarCuenta: api(cobros.quitarCuenta),
    renombrarCuenta: api(cobros.renombrarCuenta),
    asignar: api(cobros.asignarItem),
    repartir: api(cobros.repartirItem),
    descuento: api(cobros.descuentoCuenta),
    cobrar: api(cobros.cobrarCuenta),
    verCuenta: api(cobros.verCuenta)
  }
}

export type RestixApi = typeof restix

/** Carga lo guardado en el navegador (o los datos de muestra) y deja la API en window.restix. */
export function instalarMuestra(): void {
  const guardado = leerGuardado()
  usarDatos(guardado ?? crearDatosDeMuestra())
  if (!guardado) guardar()
  window.restix = restix
}
