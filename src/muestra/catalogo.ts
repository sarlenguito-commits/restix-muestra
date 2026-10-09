import type {
  CambiosInsumo,
  CambiosProducto,
  Categoria,
  Destino,
  Insumo,
  ItemReceta,
  ItemRecetaDetalle,
  MovimientoStock,
  NuevoInsumo,
  NuevoProducto,
  Producto,
  Resultado,
  Unidad
} from '@shared/types'
import { ahora, copia, db, falla, mismoNombre, nuevoId, numeroValido, ok, textoLimpio } from './base'

const DESTINOS: Destino[] = ['cocina', 'barra']
const UNIDADES: Unidad[] = ['u', 'g', 'ml']
/** Tope de precio: $100.000.000 (en centavos), para frenar errores de tipeo */
const PRECIO_MAXIMO = 10_000_000_000
/** Tope de stock: 100 toneladas / 100.000 litros / 100 millones de unidades, para frenar errores de tipeo */
const STOCK_MAXIMO = 100_000_000
const MOVIMIENTOS_POR_CONSULTA = 100

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })

// ---------- Categorías ----------

export function listarCategorias(): Categoria[] {
  return copia([...db().categorias].sort((a, b) => a.orden - b.orden || a.id - b.id))
}

export function crearCategoria(nombre: string): Resultado<Categoria> {
  const limpio = textoLimpio(nombre)
  if (!limpio) return falla('La categoría necesita un nombre.')
  if (db().categorias.some((c) => mismoNombre(c.nombre, limpio))) return falla(`Ya existe la categoría "${limpio}".`)
  const categoria: Categoria = { id: nuevoId(), nombre: limpio, orden: Math.max(-1, ...db().categorias.map((c) => c.orden)) + 1 }
  db().categorias.push(categoria)
  return ok(copia(categoria))
}

export function renombrarCategoria(id: number, nombre: string): Resultado<Categoria> {
  const limpio = textoLimpio(nombre)
  if (!limpio) return falla('La categoría necesita un nombre.')
  const categoria = db().categorias.find((c) => c.id === id)
  if (!categoria) return falla('La categoría no existe.')
  if (db().categorias.some((c) => c.id !== id && mismoNombre(c.nombre, limpio))) return falla(`Ya existe la categoría "${limpio}".`)
  categoria.nombre = limpio
  return ok(copia(categoria))
}

export function borrarCategoria(id: number): Resultado<null> {
  const total = db().productos.filter((p) => p.categoria_id === id).length
  if (total) return falla(`La categoría tiene ${total === 1 ? '1 producto' : `${total} productos`}. Movelos a otra categoría o borralos primero.`)
  db().categorias = db().categorias.filter((c) => c.id !== id)
  return ok(null)
}

// ---------- Productos ----------

export function listarProductos(): Producto[] {
  return copia([...db().productos].sort((a, b) => a.categoria_id - b.categoria_id || a.orden - b.orden || a.id - b.id))
}

const precioValido = (p: unknown): p is number => numeroValido(p) && Number.isInteger(p) && p >= 0 && p <= PRECIO_MAXIMO

/** Un producto no puede repetir nombre dentro de su categoría */
function duplicado(nombre: string, categoriaId: number, salvoId?: number): string | null {
  if (!db().productos.some((p) => p.id !== salvoId && p.categoria_id === categoriaId && mismoNombre(p.nombre, nombre))) return null
  const categoria = db().categorias.find((c) => c.id === categoriaId)?.nombre ?? 'esa categoría'
  return `Ya hay un producto "${nombre}" en ${categoria}.`
}

export function crearProducto(datos: NuevoProducto): Resultado<Producto> {
  const nombre = textoLimpio(datos.nombre)
  if (!nombre) return falla('El producto necesita un nombre.')
  if (!db().categorias.some((c) => c.id === datos.categoria_id)) return falla('La categoría no existe.')
  if (!precioValido(datos.precio)) return falla('Precio inválido.')
  const repetido = duplicado(nombre, datos.categoria_id)
  if (repetido) return falla(repetido)
  const orden = Math.max(-1, ...db().productos.filter((p) => p.categoria_id === datos.categoria_id).map((p) => p.orden)) + 1
  const producto: Producto = {
    id: nuevoId(),
    categoria_id: datos.categoria_id,
    nombre,
    precio: datos.precio,
    destino: DESTINOS.includes(datos.destino as Destino) ? datos.destino! : 'cocina',
    activo: true,
    orden
  }
  db().productos.push(producto)
  return ok(copia(producto))
}

export function actualizarProducto(id: number, cambios: CambiosProducto): Resultado<Producto> {
  const actual = db().productos.find((p) => p.id === id)
  if (!actual) return falla('El producto no existe.')
  const nuevo: Producto = { ...actual }
  if ('nombre' in cambios) {
    const nombre = textoLimpio(cambios.nombre)
    if (!nombre) return falla('El producto necesita un nombre.')
    nuevo.nombre = nombre
  }
  if ('precio' in cambios) {
    if (!precioValido(cambios.precio)) return falla('Precio inválido.')
    nuevo.precio = cambios.precio
  }
  if ('destino' in cambios) {
    if (!DESTINOS.includes(cambios.destino as Destino)) return falla('Destino inválido.')
    nuevo.destino = cambios.destino!
  }
  if ('categoria_id' in cambios) {
    if (!db().categorias.some((c) => c.id === cambios.categoria_id)) return falla('La categoría no existe.')
    nuevo.categoria_id = cambios.categoria_id!
  }
  if ('activo' in cambios) nuevo.activo = !!cambios.activo
  const repetido = duplicado(nuevo.nombre, nuevo.categoria_id, id)
  if (repetido) return falla(repetido)
  Object.assign(actual, nuevo)
  return ok(copia(actual))
}

/** Borra un producto (y su receta). Si ya se vendió no se puede: se saca de la carta, para no perder el historial. */
export function borrarProducto(id: number): Resultado<null> {
  if (db().items.some((i) => i.producto_id === id))
    return falla('Este producto ya se vendió: no se puede borrar. Apagá "En carta" para que no se pueda comandar.')
  db().productos = db().productos.filter((p) => p.id !== id)
  db().recetas = db().recetas.filter((r) => r.producto_id !== id)
  return ok(null)
}

// ---------- Recetas ----------

function detalle(r: { insumo_id: number; cantidad: number }): ItemRecetaDetalle {
  const insumo = db().insumos.find((i) => i.id === r.insumo_id)!
  return { insumo_id: r.insumo_id, cantidad: r.cantidad, nombre: insumo.nombre, unidad: insumo.unidad }
}

export function verReceta(productoId: number): ItemRecetaDetalle[] {
  return db().recetas.filter((r) => r.producto_id === productoId).map(detalle).sort(porNombre)
}

/** Todas las recetas de una vez (para mostrar el resumen en la lista de productos). */
export function todasLasRecetas(): (ItemRecetaDetalle & { producto_id: number })[] {
  return db()
    .recetas.map((r) => ({ producto_id: r.producto_id, ...detalle(r) }))
    .sort((a, b) => a.producto_id - b.producto_id || porNombre(a, b))
}

/** Reemplaza la receta completa. Todo o nada: si un renglón es inválido no se guarda ninguno. */
export function guardarReceta(productoId: number, items: ItemReceta[]): Resultado<ItemRecetaDetalle[]> {
  if (!db().productos.some((p) => p.id === productoId)) return falla('El producto no existe.')
  if (!Array.isArray(items)) return falla('Receta inválida.')
  const vistos = new Set<number>()
  for (const item of items) {
    const insumo = db().insumos.find((i) => i.id === item.insumo_id)
    if (!insumo) return falla('Uno de los insumos no existe.')
    if (vistos.has(item.insumo_id)) return falla(`"${insumo.nombre}" está repetido en la receta.`)
    if (!numeroValido(item.cantidad) || item.cantidad <= 0 || item.cantidad > STOCK_MAXIMO)
      return falla(`Cantidad inválida para "${insumo.nombre}".`)
    vistos.add(item.insumo_id)
  }
  db().recetas = db().recetas.filter((r) => r.producto_id !== productoId)
  for (const item of items) db().recetas.push({ producto_id: productoId, insumo_id: item.insumo_id, cantidad: item.cantidad })
  return ok(verReceta(productoId))
}

// ---------- Insumos y stock ----------

export function listarInsumos(): Insumo[] {
  return copia([...db().insumos].sort(porNombre))
}

/**
 * Cambia el stock y deja el movimiento en el historial, las dos cosas juntas.
 * comandaItemId: el renglón de comanda que lo generó (ventas y devoluciones).
 */
export function moverStock(
  insumoId: number,
  cantidad: number,
  motivo: MovimientoStock['motivo'],
  nota: string | null,
  comandaItemId: number | null = null
): void {
  const insumo = db().insumos.find((i) => i.id === insumoId)
  if (!insumo) return
  insumo.stock = Math.round((insumo.stock + cantidad) * 1000) / 1000
  db().movimientosStock.push({ id: nuevoId(), insumo_id: insumoId, cantidad, motivo, nota, fecha: ahora(), comanda_item_id: comandaItemId })
}

const cantidadValida = (v: unknown): v is number => numeroValido(v) && v >= 0 && v <= STOCK_MAXIMO

export function crearInsumo(datos: NuevoInsumo): Resultado<Insumo> {
  const nombre = textoLimpio(datos.nombre)
  if (!nombre) return falla('El insumo necesita un nombre.')
  if (!UNIDADES.includes(datos.unidad)) return falla('Unidad inválida.')
  if (!cantidadValida(datos.stock_minimo)) return falla('Stock mínimo inválido.')
  const inicial = datos.stock_inicial ?? 0
  if (!cantidadValida(inicial)) return falla('Stock inicial inválido.')
  if (db().insumos.some((i) => mismoNombre(i.nombre, nombre))) return falla(`Ya existe el insumo "${nombre}".`)
  const insumo: Insumo = { id: nuevoId(), nombre, unidad: datos.unidad, stock: 0, stock_minimo: datos.stock_minimo }
  db().insumos.push(insumo)
  if (inicial > 0) moverStock(insumo.id, inicial, 'inicial', null)
  return ok(copia(insumo))
}

/** La unidad no se puede cambiar: dejaría mal todas las recetas que usan el insumo. */
export function actualizarInsumo(id: number, cambios: CambiosInsumo): Resultado<Insumo> {
  const insumo = db().insumos.find((i) => i.id === id)
  if (!insumo) return falla('El insumo no existe.')
  const nuevo = { ...insumo }
  if ('nombre' in cambios) {
    const nombre = textoLimpio(cambios.nombre)
    if (!nombre) return falla('El insumo necesita un nombre.')
    if (db().insumos.some((i) => i.id !== id && mismoNombre(i.nombre, nombre))) return falla(`Ya existe el insumo "${nombre}".`)
    nuevo.nombre = nombre
  }
  if ('stock_minimo' in cambios) {
    if (!cantidadValida(cambios.stock_minimo)) return falla('Stock mínimo inválido.')
    nuevo.stock_minimo = cambios.stock_minimo!
  }
  Object.assign(insumo, nuevo)
  return ok(copia(insumo))
}

export function borrarInsumo(id: number): Resultado<null> {
  const usos = db()
    .recetas.filter((r) => r.insumo_id === id)
    .map((r) => db().productos.find((p) => p.id === r.producto_id)?.nombre ?? '')
    .sort((a, b) => a.localeCompare(b, 'es'))
  if (usos.length) {
    const recetas = usos.length === 1 ? '1 receta' : `${usos.length} recetas`
    return falla(`Se usa en ${recetas} (${usos.join(', ')}). Sacalo de esas recetas primero.`)
  }
  db().insumos = db().insumos.filter((i) => i.id !== id)
  db().movimientosStock = db().movimientosStock.filter((m) => m.insumo_id !== id)
  return ok(null)
}

/** Ingreso de mercadería: suma al stock. */
export function ingresarStock(id: number, cantidad: number, nota?: string): Resultado<Insumo> {
  const insumo = db().insumos.find((i) => i.id === id)
  if (!insumo) return falla('El insumo no existe.')
  if (!numeroValido(cantidad) || cantidad <= 0 || cantidad > STOCK_MAXIMO) return falla('La cantidad a ingresar tiene que ser mayor a cero.')
  moverStock(id, cantidad, 'ingreso', textoLimpio(nota) || null)
  return ok(copia(insumo))
}

/** Ajuste por conteo: se indica cuánto hay realmente y se registra la diferencia. */
export function ajustarStock(id: number, stockReal: number, nota?: string): Resultado<Insumo> {
  const insumo = db().insumos.find((i) => i.id === id)
  if (!insumo) return falla('El insumo no existe.')
  if (!cantidadValida(stockReal)) return falla('La cantidad contada no puede ser negativa.')
  const diferencia = stockReal - insumo.stock
  if (diferencia !== 0) moverStock(id, diferencia, 'ajuste', textoLimpio(nota) || null)
  return ok(copia(insumo))
}

/** Últimos movimientos de un insumo, del más nuevo al más viejo. */
export function listarMovimientos(insumoId: number): MovimientoStock[] {
  return db()
    .movimientosStock.filter((m) => m.insumo_id === insumoId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .slice(0, MOVIMIENTOS_POR_CONSULTA)
    .map(({ comanda_item_id: _, ...m }) => m)
}
