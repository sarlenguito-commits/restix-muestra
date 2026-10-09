import { useState } from 'react'
import type { Categoria, Producto } from '@shared/types'
import { formatearPrecio } from '../formato'

interface Props {
  categorias: Categoria[]
  /** Solo los que están en carta */
  productos: Producto[]
  /** Cuántos de cada producto hay ya en el pedido (id → cantidad) */
  enPedido: Record<number, number>
  onAgregar: (productoId: number) => void
}

export default function GrillaProductos({ categorias, productos, enPedido, onAgregar }: Props) {
  const conProductos = categorias.filter((c) => productos.some((p) => p.categoria_id === c.id))
  const [categoriaId, setCategoriaId] = useState<number | null>(conProductos[0]?.id ?? null)
  const [busqueda, setBusqueda] = useState('')

  // Con búsqueda se buscan en todas las categorías
  const texto = busqueda.trim().toLowerCase()
  const visibles = texto
    ? productos.filter((p) => p.nombre.toLowerCase().includes(texto))
    : productos.filter((p) => p.categoria_id === categoriaId)

  return (
    <section className="grilla-productos">
      <div className="categorias-comanda">
        {conProductos.map((c) => (
          <button
            key={c.id}
            className={`pestana-categoria ${!texto && c.id === categoriaId ? 'activa' : ''}`}
            onClick={() => {
              setCategoriaId(c.id)
              setBusqueda('')
            }}
          >
            {c.nombre}
          </button>
        ))}
        <input
          className="campo buscador"
          placeholder="🔍 Buscar producto…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="botones-productos">
        {visibles.map((p) => (
          <button key={p.id} className="boton-producto" onClick={() => onAgregar(p.id)}>
            <span className="nombre">{p.nombre}</span>
            <span className="precio">{formatearPrecio(p.precio)}</span>
            {enPedido[p.id] > 0 && <span className="cantidad-pedida">{enPedido[p.id]}</span>}
          </button>
        ))}
        {!visibles.length && <p className="ayuda-lista">No hay productos {texto ? 'que coincidan' : 'en carta en esta categoría'}.</p>}
      </div>
    </section>
  )
}
