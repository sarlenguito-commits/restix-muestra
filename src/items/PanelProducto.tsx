import { useMemo, useState } from 'react'
import type { CambiosProducto, Categoria, Insumo, ItemReceta, ItemRecetaDetalle, Producto } from '@shared/types'
import { CampoPrecio, CampoTexto } from '../components/Campos'
import Interruptor from '../components/Interruptor'
import { confirmar } from '../components/Confirmar'
import Modal from '../components/Modal'
import { cantidadParaCampo, formatearCantidad, leerNumero, UNIDADES_ENTRADA } from '../formato'
import { SelectorDestino } from './TablaProductos'

interface Props {
  producto: Producto
  categorias: Categoria[]
  receta: ItemRecetaDetalle[]
  insumos: Insumo[]
  onActualizar: (cambios: CambiosProducto) => Promise<boolean>
  onGuardarReceta: (items: ItemReceta[]) => Promise<boolean>
  onBorrar: () => void
  onCerrar: () => void
}

export default function PanelProducto(props: Props) {
  const { producto: p, onActualizar } = props
  const [editandoReceta, setEditandoReceta] = useState(false)

  return (
    <aside className="panel">
      <div className="panel-encabezado">
        <h3>{p.nombre}</h3>
        <button className="icono" onClick={props.onCerrar} title="Cerrar">
          ✕
        </button>
      </div>

      <div className="campo-grupo">
        <label>Nombre</label>
        <CampoTexto valor={p.nombre} onGuardar={(nombre) => onActualizar({ nombre })} />
      </div>
      <div className="campo-grupo">
        <label>Precio</label>
        <CampoPrecio valor={p.precio} onGuardar={(precio) => onActualizar({ precio })} />
      </div>
      <div className="campo-grupo">
        <label>Categoría</label>
        <select
          className="campo"
          value={p.categoria_id}
          onChange={(e) => onActualizar({ categoria_id: Number(e.target.value) })}
        >
          {props.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo-grupo">
        <label>Se prepara en</label>
        <SelectorDestino valor={p.destino} onCambiar={(destino) => onActualizar({ destino })} />
      </div>
      <div className="campo-grupo">
        <label>En carta</label>
        <div className="fila">
          <Interruptor activo={p.activo} onCambiar={(activo) => onActualizar({ activo })} />
          <span className="ayuda-lista">{p.activo ? 'Se puede comandar' : 'No aparece para comandar'}</span>
        </div>
      </div>

      <div className="campo-grupo">
        <label>Receta</label>
        {props.receta.length ? (
          <ul className="receta-resumen">
            {props.receta.map((r) => (
              <li key={r.insumo_id}>
                <span className="cantidad">{formatearCantidad(r.cantidad, r.unidad)}</span> {r.nombre}
              </li>
            ))}
          </ul>
        ) : (
          <span className="ayuda-lista">Sin receta: se vende sin descontar stock.</span>
        )}
        <button className="secundario" onClick={() => setEditandoReceta(true)}>
          {props.receta.length ? 'Editar receta' : 'Armar receta'}
        </button>
      </div>

      <div className="panel-pie">
        <button className="peligro" onClick={props.onBorrar}>
          Borrar producto
        </button>
      </div>

      {editandoReceta && (
        <EditorReceta
          producto={p}
          receta={props.receta}
          insumos={props.insumos}
          onGuardar={props.onGuardarReceta}
          onCerrar={() => setEditandoReceta(false)}
        />
      )}
    </aside>
  )
}

// ---------- Editor de receta (tarjeta flotante) ----------

/** Un renglón mientras se edita: el número tal como lo escribió el usuario y en qué unidad */
interface Renglon {
  insumo_id: number
  valor: string
  /** 1 = unidad base (g, ml, u); 1000 = kg o L */
  factor: number
}

interface EditorProps {
  producto: Producto
  receta: ItemRecetaDetalle[]
  insumos: Insumo[]
  onGuardar: (items: ItemReceta[]) => Promise<boolean>
  onCerrar: () => void
}

function EditorReceta({ producto, receta, insumos, onGuardar, onCerrar }: EditorProps) {
  const inicial = useMemo(
    () =>
      receta.map((r) => {
        const c = cantidadParaCampo(r.cantidad, r.unidad)
        return { insumo_id: r.insumo_id, valor: c.valor, factor: c.factor }
      }),
    [receta]
  )
  const [renglones, setRenglones] = useState<Renglon[]>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const insumoDe = (id: number) => insumos.find((i) => i.id === id)
  const modificada = JSON.stringify(renglones) !== JSON.stringify(inicial)
  const disponibles = insumos.filter((i) => !renglones.some((r) => r.insumo_id === i.id))

  const cambiar = (i: number, cambios: Partial<Renglon>) =>
    setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, ...cambios } : r)))

  const cerrar = async () => {
    if (modificada && !(await confirmar('Hay cambios sin guardar en la receta. ¿Descartarlos?', { boton: 'Descartar' }))) return
    onCerrar()
  }

  const guardar = async () => {
    const items: ItemReceta[] = []
    for (const r of renglones) {
      const n = leerNumero(r.valor)
      if (n === null || n <= 0) return setError(`Revisá la cantidad de "${insumoDe(r.insumo_id)?.nombre}".`)
      items.push({ insumo_id: r.insumo_id, cantidad: n * r.factor })
    }
    setError(null)
    setGuardando(true)
    const ok = await onGuardar(items)
    setGuardando(false)
    if (ok) onCerrar()
  }

  return (
    <Modal
      titulo={`Receta: ${producto.nombre}`}
      onCerrar={cerrar}
      ancho={620}
      pie={
        <>
          {error && <p className="error">{error}</p>}
          <button className="secundario" onClick={cerrar}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || !modificada}>
            {guardando ? 'Guardando…' : 'Guardar receta'}
          </button>
        </>
      }
    >
      <p className="ayuda-lista">Lo que se descuenta del stock cada vez que se vende 1 unidad de este producto.</p>

      <table className="tabla tabla-receta">
        <thead>
          <tr>
            <th>Insumo</th>
            <th className="derecha">Cantidad</th>
            <th>Unidad</th>
            <th className="derecha">En stock</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {renglones.map((r, i) => {
            const insumo = insumoDe(r.insumo_id)
            if (!insumo) return null
            return (
              <tr key={r.insumo_id}>
                <td className="nombre">{insumo.nombre}</td>
                <td className="derecha">
                  <input
                    className="campo cantidad"
                    inputMode="decimal"
                    value={r.valor}
                    autoFocus={i === renglones.length - 1 && r.valor === '1'}
                    onChange={(e) => cambiar(i, { valor: e.target.value })}
                  />
                </td>
                <td>
                  {UNIDADES_ENTRADA[insumo.unidad].length > 1 ? (
                    <select
                      className="campo unidad"
                      value={r.factor}
                      onChange={(e) => cambiar(i, { factor: Number(e.target.value) })}
                    >
                      {UNIDADES_ENTRADA[insumo.unidad].map((u) => (
                        <option key={u.etiqueta} value={u.factor}>
                          {u.etiqueta}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="unidad-fija">{insumo.unidad}</span>
                  )}
                </td>
                <td className="derecha tenue">{formatearCantidad(insumo.stock, insumo.unidad)}</td>
                <td className="derecha">
                  <button
                    className="icono chico"
                    title="Quitar de la receta"
                    onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            )
          })}
          {!renglones.length && (
            <tr>
              <td colSpan={5} className="vacio">
                Sin insumos: agregá el primero abajo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {disponibles.length > 0 && (
        <select
          className="campo agregar-insumo"
          value=""
          onChange={(e) =>
            e.target.value &&
            setRenglones((rs) => [...rs, { insumo_id: Number(e.target.value), valor: '1', factor: 1 }])
          }
        >
          <option value="">+ Agregar insumo…</option>
          {disponibles.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </select>
      )}
    </Modal>
  )
}
