import { useEffect, useState } from 'react'
import type { CambiosInsumo, Insumo, MotivoMovimiento, MovimientoStock } from '@shared/types'
import { CampoTexto } from '../components/Campos'
import EntradaCantidad, { aBase, cantidadVacia, type ValorCantidad } from '../components/EntradaCantidad'
import { cantidadParaCampo, formatearCantidad, NOMBRE_UNIDAD } from '../formato'
import { estadoStock, NOMBRE_ESTADO_STOCK } from './estado'

const NOMBRE_MOTIVO: Record<MotivoMovimiento, string> = {
  inicial: 'Stock inicial',
  ingreso: 'Ingreso',
  venta: 'Venta',
  ajuste: 'Ajuste'
}

/** "2026-09-24 11:55:03" → "24/09/26 11:55" */
function formatearFecha(fecha: string): string {
  const [dia, hora] = fecha.split(' ')
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a.slice(2)} ${hora?.slice(0, 5) ?? ''}`
}

interface Props {
  insumo: Insumo
  /** Productos cuya receta usa este insumo */
  usadoEn: string[]
  onActualizar: (cambios: CambiosInsumo) => Promise<boolean>
  onIngresar: (cantidad: number, nota: string) => Promise<boolean>
  onAjustar: (stockReal: number, nota: string) => Promise<boolean>
  onBorrar: () => void
  onCerrar: () => void
}

export default function PanelInsumo(props: Props) {
  const { insumo: i } = props
  const estado = estadoStock(i)
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])

  // El historial se vuelve a pedir cada vez que cambia el stock (ingreso o ajuste)
  useEffect(() => {
    window.restix.stock.movimientos(i.id).then(setMovimientos)
  }, [i.id, i.stock])

  return (
    <aside className="panel">
      <div className="panel-encabezado">
        <h3>{i.nombre}</h3>
        <button className="icono" onClick={props.onCerrar} title="Cerrar">
          ✕
        </button>
      </div>

      <div className="stock-actual">
        <span className="numero">{formatearCantidad(i.stock, i.unidad)}</span>
        <span className={`insignia stock-${estado}`}>{NOMBRE_ESTADO_STOCK[estado]}</span>
      </div>

      <div className="campo-grupo">
        <label>Nombre</label>
        <CampoTexto valor={i.nombre} onGuardar={(nombre) => props.onActualizar({ nombre })} />
        <span className="ayuda-lista">Se mide en: {NOMBRE_UNIDAD[i.unidad]} (no se puede cambiar)</span>
      </div>

      <FormularioMovimiento
        titulo="Ingresar mercadería"
        ayuda="Se suma al stock actual."
        boton="Ingresar"
        insumo={i}
        placeholderNota="Ej.: compra al proveedor"
        onEnviar={props.onIngresar}
      />

      <FormularioMovimiento
        titulo="Ajustar por conteo"
        ayuda="Cuánto hay realmente. Se registra la diferencia."
        boton="Ajustar"
        insumo={i}
        placeholderNota="Ej.: conteo de heladera"
        permiteCero
        onEnviar={props.onAjustar}
      />

      <StockMinimo insumo={i} onGuardar={(stock_minimo) => props.onActualizar({ stock_minimo })} />

      <div className="campo-grupo">
        <label>Usado en</label>
        <span className="ayuda-lista">{props.usadoEn.length ? props.usadoEn.join(', ') : 'Ninguna receta'}</span>
      </div>

      <div className="campo-grupo">
        <label>Historial</label>
        <ul className="historial">
          {movimientos.map((m) => (
            <li key={m.id}>
              <span className="fecha">{formatearFecha(m.fecha)}</span>
              <span className="motivo">
                {NOMBRE_MOTIVO[m.motivo]}
                {m.nota && <em> · {m.nota}</em>}
              </span>
              <span className={`cantidad ${m.cantidad < 0 ? 'negativa' : 'positiva'}`}>
                {m.cantidad > 0 ? '+' : ''}
                {formatearCantidad(m.cantidad, i.unidad)}
              </span>
            </li>
          ))}
          {!movimientos.length && <li className="ayuda-lista">Sin movimientos.</li>}
        </ul>
      </div>

      <div className="panel-pie">
        <button
          className="peligro"
          onClick={props.onBorrar}
          disabled={props.usadoEn.length > 0}
          title={props.usadoEn.length ? 'Se usa en recetas: sacalo de ellas primero' : ''}
        >
          Borrar insumo
        </button>
      </div>
    </aside>
  )
}

interface FormularioProps {
  titulo: string
  ayuda: string
  boton: string
  insumo: Insumo
  placeholderNota: string
  /** El ajuste acepta 0 (se terminó); el ingreso no */
  permiteCero?: boolean
  onEnviar: (cantidad: number, nota: string) => Promise<boolean>
}

function FormularioMovimiento({ titulo, ayuda, boton, insumo, placeholderNota, permiteCero, onEnviar }: FormularioProps) {
  const [cantidad, setCantidad] = useState<ValorCantidad>(cantidadVacia)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    const base = aBase(cantidad)
    if (base === null || base < 0 || (!permiteCero && base === 0)) return setError('Escribí una cantidad válida.')
    setError(null)
    if (await onEnviar(base, nota)) {
      setCantidad({ texto: '', factor: cantidad.factor })
      setNota('')
    }
  }

  return (
    <div className="campo-grupo caja-movimiento">
      <label>{titulo}</label>
      <span className="ayuda-lista">{ayuda}</span>
      <EntradaCantidad unidad={insumo.unidad} valor={cantidad} onCambiar={setCantidad} placeholder="Cantidad" onEnter={enviar} />
      <input
        className="campo"
        placeholder={placeholderNota}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && enviar()}
      />
      {error && <p className="error">{error}</p>}
      <button className="secundario" onClick={enviar}>
        {boton}
      </button>
    </div>
  )
}

function StockMinimo({ insumo, onGuardar }: { insumo: Insumo; onGuardar: (v: number) => Promise<boolean> }) {
  const inicial = (): ValorCantidad => {
    const c = cantidadParaCampo(insumo.stock_minimo, insumo.unidad)
    return { texto: c.valor, factor: c.factor }
  }
  const [valor, setValor] = useState<ValorCantidad>(inicial)
  // Vuelve al valor guardado al cambiar de insumo o después de guardar
  useEffect(() => setValor(inicial()), [insumo.id, insumo.stock_minimo])

  const base = aBase(valor)
  const modificado = base !== null && base !== insumo.stock_minimo

  return (
    <div className="campo-grupo">
      <label>Stock mínimo (debajo de esto, alerta)</label>
      <div className="fila">
        <EntradaCantidad unidad={insumo.unidad} valor={valor} onCambiar={setValor} onEnter={() => modificado && onGuardar(base!)} />
        {modificado && base! >= 0 && (
          <button className="secundario" onClick={() => onGuardar(base!)}>
            Guardar
          </button>
        )}
      </div>
    </div>
  )
}
