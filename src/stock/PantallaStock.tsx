import { useEffect, useMemo, useState } from 'react'
import type { CambiosInsumo, Insumo, Producto, Resultado, Unidad } from '@shared/types'
import { confirmar } from '../components/Confirmar'
import EntradaCantidad,{ aBase, cantidadVacia, type ValorCantidad } from '../components/EntradaCantidad'
import Interruptor from '../components/Interruptor'
import { formatearCantidad, NOMBRE_UNIDAD } from '../formato'
import { avisarCambioStock, estadoStock, NOMBRE_ESTADO_STOCK } from './estado'
import PanelInsumo from './PanelInsumo'

const DURACION_AVISO_MS = 4000

export default function PantallaStock() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [recetas, setRecetas] = useState<{ producto_id: number; insumo_id: number }[]>([])
  const [insumoId, setInsumoId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloBajos, setSoloBajos] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([window.restix.insumos.listar(), window.restix.productos.listar(), window.restix.recetas.todas()]).then(
      ([ins, prods, recs]) => {
        setInsumos(ins)
        setProductos(prods)
        setRecetas(recs)
      }
    )
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), DURACION_AVISO_MS)
    return () => clearTimeout(t)
  }, [aviso])

  function resultado<T>(r: Resultado<T>): T | null {
    if (r.ok) return r.dato
    setAviso(r.error)
    return null
  }

  /** Nombres de los productos que usan cada insumo en su receta */
  const usadoEn = useMemo(() => {
    const nombres: Record<number, string[]> = {}
    for (const r of recetas) {
      const p = productos.find((x) => x.id === r.producto_id)
      if (p) (nombres[r.insumo_id] ??= []).push(p.nombre)
    }
    return nombres
  }, [recetas, productos])

  const bajos = insumos.filter((i) => estadoStock(i) !== 'ok').length
  const texto = busqueda.trim().toLowerCase()
  const visibles = insumos.filter(
    (i) => (!soloBajos || estadoStock(i) !== 'ok') && (!texto || i.nombre.toLowerCase().includes(texto))
  )
  const insumo = insumos.find((i) => i.id === insumoId)

  /** Reemplaza el insumo en la lista y avisa al menú (por el globito de stock bajo). */
  const reemplazar = (nuevo: Insumo) => {
    setInsumos((lista) => lista.map((i) => (i.id === nuevo.id ? nuevo : i)))
    avisarCambioStock()
  }

  const actualizar = async (cambios: CambiosInsumo) => {
    if (!insumo) return false
    const nuevo = resultado(await window.restix.insumos.actualizar(insumo.id, cambios))
    if (nuevo) reemplazar(nuevo)
    return nuevo !== null
  }

  const ingresar = async (cantidad: number, nota: string) => {
    if (!insumo) return false
    const nuevo = resultado(await window.restix.stock.ingresar(insumo.id, cantidad, nota))
    if (nuevo) reemplazar(nuevo)
    return nuevo !== null
  }

  const ajustar = async (stockReal: number, nota: string) => {
    if (!insumo) return false
    const nuevo = resultado(await window.restix.stock.ajustar(insumo.id, stockReal, nota))
    if (nuevo) reemplazar(nuevo)
    return nuevo !== null
  }

  const borrar = async () => {
    if (!insumo || !(await confirmar(`¿Borrar el insumo "${insumo.nombre}" y su historial?`, { boton: 'Borrar', peligro: true })))
      return
    if (resultado(await window.restix.insumos.borrar(insumo.id)) === null) return
    setInsumos((lista) => lista.filter((i) => i.id !== insumo.id))
    setInsumoId(null)
    avisarCambioStock()
  }

  const crear = async (nombre: string, unidad: Unidad, inicial: number, minimo: number) => {
    const nuevo = resultado(
      await window.restix.insumos.crear({ nombre, unidad, stock_inicial: inicial, stock_minimo: minimo })
    )
    if (!nuevo) return false
    setInsumos((lista) => [...lista, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    setInsumoId(nuevo.id)
    avisarCambioStock()
    return true
  }

  return (
    <div className="pantalla-items">
      <section className="zona-productos">
        <header className="zona-encabezado">
          <div className="fila">
            <h2 className="titulo-seccion">Stock</h2>
            {bajos > 0 && (
              <span className="insignia stock-bajo">
                ⚠ {bajos} {bajos === 1 ? 'insumo con stock bajo' : 'insumos con stock bajo'}
              </span>
            )}
          </div>
          <div className="fila">
            <input
              className="campo buscador"
              placeholder="Buscar insumo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <Interruptor activo={soloBajos} onCambiar={setSoloBajos} texto="Solo bajos" />
          </div>
        </header>

        <table className="tabla">
          <thead>
            <tr>
              <th>Insumo</th>
              <th className="derecha">Stock</th>
              <th className="derecha">Mínimo</th>
              <th>Estado</th>
              <th>Usado en</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((i) => {
              const estado = estadoStock(i)
              const usos = usadoEn[i.id] ?? []
              return (
                <tr key={i.id} className={i.id === insumoId ? 'seleccionada' : ''} onClick={() => setInsumoId(i.id)}>
                  <td className="nombre">{i.nombre}</td>
                  <td className="derecha numero">{formatearCantidad(i.stock, i.unidad)}</td>
                  <td className="derecha tenue">{formatearCantidad(i.stock_minimo, i.unidad)}</td>
                  <td>
                    <span className={`insignia stock-${estado}`}>{NOMBRE_ESTADO_STOCK[estado]}</span>
                  </td>
                  <td className="tenue" title={usos.join(', ')}>
                    {usos.length === 0 ? '—' : usos.length === 1 ? usos[0] : `${usos.length} productos`}
                  </td>
                </tr>
              )
            })}
            {!visibles.length && (
              <tr>
                <td colSpan={5} className="vacio">
                  {insumos.length ? 'Ningún insumo coincide con el filtro.' : 'Todavía no hay insumos.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <NuevoInsumo onCrear={crear} />
      </section>

      {insumo && (
        <PanelInsumo
          key={insumo.id}
          insumo={insumo}
          usadoEn={usadoEn[insumo.id] ?? []}
          onActualizar={actualizar}
          onIngresar={ingresar}
          onAjustar={ajustar}
          onBorrar={borrar}
          onCerrar={() => setInsumoId(null)}
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

function NuevoInsumo({ onCrear }: { onCrear: (n: string, u: Unidad, inicial: number, minimo: number) => Promise<boolean> }) {
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState<Unidad>('u')
  const [inicial, setInicial] = useState<ValorCantidad>(cantidadVacia)
  const [minimo, setMinimo] = useState<ValorCantidad>(cantidadVacia)
  const [error, setError] = useState<string | null>(null)

  const cambiarUnidad = (u: Unidad) => {
    setUnidad(u)
    // El factor elegido (kg, L) no tiene sentido en otra unidad
    setInicial((v) => ({ ...v, factor: 1 }))
    setMinimo((v) => ({ ...v, factor: 1 }))
  }

  const crear = async () => {
    const baseInicial = inicial.texto.trim() ? aBase(inicial) : 0
    const baseMinimo = minimo.texto.trim() ? aBase(minimo) : 0
    if (!nombre.trim()) return setError('Poné un nombre.')
    if (baseInicial === null || baseInicial < 0 || baseMinimo === null || baseMinimo < 0)
      return setError('Revisá las cantidades.')
    setError(null)
    if (await onCrear(nombre, unidad, baseInicial, baseMinimo)) {
      setNombre('')
      setInicial(cantidadVacia())
      setMinimo(cantidadVacia())
    }
  }

  return (
    <>
      <div className="producto-nuevo insumo-nuevo">
        <input
          className="campo"
          placeholder="Nuevo insumo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select className="campo medida" value={unidad} onChange={(e) => cambiarUnidad(e.target.value as Unidad)}>
          {(['u', 'g', 'ml'] as const).map((u) => (
            <option key={u} value={u}>
              {NOMBRE_UNIDAD[u]}
            </option>
          ))}
        </select>
        <EntradaCantidad unidad={unidad} valor={inicial} onCambiar={setInicial} placeholder="Stock inicial" />
        <EntradaCantidad unidad={unidad} valor={minimo} onCambiar={setMinimo} placeholder="Mínimo" onEnter={crear} />
        <button onClick={crear}>Agregar</button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  )
}
