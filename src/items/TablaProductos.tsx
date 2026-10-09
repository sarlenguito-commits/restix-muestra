import { useState } from 'react'
import type { CambiosProducto, Categoria, Destino, ItemRecetaDetalle, Producto } from '@shared/types'
import { CampoPrecio, CampoTexto } from '../components/Campos'
import Interruptor from '../components/Interruptor'
import { formatearCantidad, leerPrecio } from '../formato'

interface Props {
  categoria: Categoria
  productos: Producto[]
  /** Receta de cada producto (id → renglones) */
  recetas: Record<number, ItemRecetaDetalle[]>
  productoId: number | null
  onElegir: (id: number) => void
  onActualizar: (id: number, cambios: CambiosProducto) => Promise<boolean>
  onCrear: (nombre: string, precio: number, destino: Destino) => Promise<boolean>
  onRenombrarCategoria: (nombre: string) => Promise<boolean>
  onBorrarCategoria: () => void
}

export function resumenReceta(receta: ItemRecetaDetalle[] | undefined): string {
  if (!receta?.length) return 'Sin receta'
  return receta.map((r) => `${formatearCantidad(r.cantidad, r.unidad)} ${r.nombre}`).join(' · ')
}

export function SelectorDestino({ valor, onCambiar }: { valor: Destino; onCambiar: (d: Destino) => void }) {
  return (
    <div className="segmentado chico" onClick={(e) => e.stopPropagation()}>
      {(['cocina', 'barra'] as const).map((d) => (
        <button key={d} className={valor === d ? 'activo' : ''} onClick={() => valor !== d && onCambiar(d)}>
          {d === 'cocina' ? 'Cocina' : 'Barra'}
        </button>
      ))}
    </div>
  )
}

export default function TablaProductos(props: Props) {
  const { categoria, productos, recetas, productoId, onElegir, onActualizar } = props

  // El destino más común de la categoría es el que se propone para un producto nuevo
  const destinoComun: Destino =
    productos.filter((p) => p.destino === 'barra').length > productos.length / 2 ? 'barra' : 'cocina'

  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [destino, setDestino] = useState<Destino | null>(null)
  const [error, setError] = useState<string | null>(null)

  const agregar = async () => {
    const centavos = leerPrecio(precio)
    if (!nombre.trim() || centavos === null) return setError('Completá el nombre y un precio válido.')
    setError(null)
    if (await props.onCrear(nombre, centavos, destino ?? destinoComun)) {
      setNombre('')
      setPrecio('')
      setDestino(null)
    }
  }

  return (
    <section className="zona-productos">
      <header className="zona-encabezado">
        <CampoTexto className="campo titulo" valor={categoria.nombre} onGuardar={props.onRenombrarCategoria} />
        <button className="peligro" onClick={props.onBorrarCategoria}>
          Borrar categoría
        </button>
      </header>

      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Precio</th>
            <th>Destino</th>
            <th>Receta</th>
            <th title="Si está apagado, no aparece para comandar">En carta</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr
              key={p.id}
              className={`${p.id === productoId ? 'seleccionada' : ''} ${p.activo ? '' : 'inactiva'}`}
              onClick={() => onElegir(p.id)}
            >
              <td className="nombre">
                {p.nombre}
                {!p.activo && <span className="etiqueta">Fuera de carta</span>}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <CampoPrecio valor={p.precio} onGuardar={(precio) => onActualizar(p.id, { precio })} />
              </td>
              <td>
                <SelectorDestino valor={p.destino} onCambiar={(destino) => onActualizar(p.id, { destino })} />
              </td>
              <td className={`receta ${recetas[p.id]?.length ? '' : 'vacia'}`}>{resumenReceta(recetas[p.id])}</td>
              <td>
                <Interruptor activo={p.activo} onCambiar={(activo) => onActualizar(p.id, { activo })} />
              </td>
            </tr>
          ))}
          {!productos.length && (
            <tr>
              <td colSpan={5} className="vacio">
                Todavía no hay productos en esta categoría.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="producto-nuevo">
        <input
          className="campo"
          placeholder="Nuevo producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && agregar()}
        />
        <div className="campo-precio">
          <span>$</span>
          <input
            className="campo"
            placeholder="Precio"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregar()}
          />
        </div>
        <SelectorDestino valor={destino ?? destinoComun} onCambiar={setDestino} />
        <button onClick={agregar}>Agregar</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
