import { useEffect, useMemo, useState } from 'react'
import type {
  CambiosProducto,
  Categoria,
  Destino,
  Insumo,
  ItemReceta,
  ItemRecetaDetalle,
  Producto,
  Resultado
} from '@shared/types'
import { confirmar } from '../components/Confirmar'
import ListaCategorias from './ListaCategorias'
import PanelProducto from './PanelProducto'
import TablaProductos from './TablaProductos'

const DURACION_AVISO_MS = 4000

type RecetaFila = ItemRecetaDetalle & { producto_id: number }

export default function PantallaItems() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [recetas, setRecetas] = useState<RecetaFila[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [categoriaId, setCategoriaId] = useState<number | null>(null)
  const [productoId, setProductoId] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.restix.categorias.listar(),
      window.restix.productos.listar(),
      window.restix.recetas.todas(),
      window.restix.insumos.listar()
    ]).then(([cats, prods, recs, ins]) => {
      setCategorias(cats)
      setProductos(prods)
      setRecetas(recs)
      setInsumos(ins)
      setCategoriaId(cats[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), DURACION_AVISO_MS)
    return () => clearTimeout(t)
  }, [aviso])

  /** Devuelve el dato si salió bien; si no, muestra el motivo y devuelve null. */
  function resultado<T>(r: Resultado<T>): T | null {
    if (r.ok) return r.dato
    setAviso(r.error)
    return null
  }

  // Datos derivados
  const conteo = useMemo(() => {
    const c: Record<number, number> = {}
    for (const p of productos) c[p.categoria_id] = (c[p.categoria_id] ?? 0) + 1
    return c
  }, [productos])

  const recetaPorProducto = useMemo(() => {
    const r: Record<number, ItemRecetaDetalle[]> = {}
    for (const fila of recetas) (r[fila.producto_id] ??= []).push(fila)
    return r
  }, [recetas])

  const categoria = categorias.find((c) => c.id === categoriaId)
  const producto = productos.find((p) => p.id === productoId)

  // ---------- Categorías ----------

  const elegirCategoria = (id: number) => {
    setCategoriaId(id)
    setProductoId(null)
  }

  const crearCategoria = async (nombre: string) => {
    const cat = resultado(await window.restix.categorias.crear(nombre))
    if (!cat) return false
    setCategorias((cs) => [...cs, cat])
    elegirCategoria(cat.id)
    return true
  }

  const renombrarCategoria = async (nombre: string) => {
    if (!categoria) return false
    const cat = resultado(await window.restix.categorias.renombrar(categoria.id, nombre))
    if (!cat) return false
    setCategorias((cs) => cs.map((c) => (c.id === cat.id ? cat : c)))
    return true
  }

  const borrarCategoria = async () => {
    if (!categoria) return
    if (conteo[categoria.id]) {
      // El proceso principal lo rechaza igual; se avisa sin preguntar
      resultado(await window.restix.categorias.borrar(categoria.id))
      return
    }
    if (!(await confirmar(`¿Borrar la categoría "${categoria.nombre}"?`, { boton: 'Borrar', peligro: true }))) return
    if (resultado(await window.restix.categorias.borrar(categoria.id)) === null) return
    const resto = categorias.filter((c) => c.id !== categoria.id)
    setCategorias(resto)
    setCategoriaId(resto[0]?.id ?? null)
    setProductoId(null)
  }

  // ---------- Productos ----------

  const crearProducto = async (nombre: string, precio: number, destino: Destino) => {
    if (!categoria) return false
    const p = resultado(await window.restix.productos.crear({ categoria_id: categoria.id, nombre, precio, destino }))
    if (!p) return false
    setProductos((ps) => [...ps, p])
    setProductoId(p.id)
    return true
  }

  const actualizarProducto = async (id: number, cambios: CambiosProducto) => {
    const p = resultado(await window.restix.productos.actualizar(id, cambios))
    if (!p) return false
    setProductos((ps) => ps.map((x) => (x.id === id ? p : x)))
    // Si se movió a otra categoría, se va con él para no perderlo de vista
    if (cambios.categoria_id !== undefined) setCategoriaId(p.categoria_id)
    return true
  }

  const borrarProducto = async () => {
    if (!producto) return
    const pregunta = `¿Borrar "${producto.nombre}"? Si solo querés que no se pueda comandar, apagá "En carta".`
    if (!(await confirmar(pregunta, { boton: 'Borrar', peligro: true }))) return
    if (resultado(await window.restix.productos.borrar(producto.id)) === null) return
    setProductos((ps) => ps.filter((p) => p.id !== producto.id))
    setRecetas((rs) => rs.filter((r) => r.producto_id !== producto.id))
    setProductoId(null)
  }

  const guardarReceta = async (items: ItemReceta[]) => {
    if (!producto) return false
    const nueva = resultado(await window.restix.recetas.guardar(producto.id, items))
    if (!nueva) return false
    setRecetas((rs) => [
      ...rs.filter((r) => r.producto_id !== producto.id),
      ...nueva.map((r) => ({ ...r, producto_id: producto.id }))
    ])
    return true
  }

  return (
    <div className="pantalla-items">
      <ListaCategorias
        categorias={categorias}
        conteo={conteo}
        categoriaId={categoriaId}
        onElegir={elegirCategoria}
        onCrear={crearCategoria}
      />

      {categoria && (
        <TablaProductos
          key={categoria.id}
          categoria={categoria}
          productos={productos.filter((p) => p.categoria_id === categoria.id)}
          recetas={recetaPorProducto}
          productoId={productoId}
          onElegir={setProductoId}
          onActualizar={actualizarProducto}
          onCrear={crearProducto}
          onRenombrarCategoria={renombrarCategoria}
          onBorrarCategoria={borrarCategoria}
        />
      )}

      {producto && (
        <PanelProducto
          producto={producto}
          categorias={categorias}
          receta={recetaPorProducto[producto.id] ?? []}
          insumos={insumos}
          onActualizar={(cambios) => actualizarProducto(producto.id, cambios)}
          onGuardarReceta={guardarReceta}
          onBorrar={borrarProducto}
          onCerrar={() => setProductoId(null)}
        />
      )}

      {aviso && (
        <div className="aviso-flotante" role="alert">
          {aviso}
        </div>
      )}
    </div>
  )
}
