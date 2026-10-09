import type { Unidad } from '@shared/types'
import { leerNumero, UNIDADES_ENTRADA } from '../formato'

/** Lo que el usuario está escribiendo: el número como texto y la unidad elegida (factor a la unidad base). */
export interface ValorCantidad {
  texto: string
  factor: number
}

export const cantidadVacia = (): ValorCantidad => ({ texto: '', factor: 1 })

/** Convierte lo escrito a la unidad base (g, ml, u). null si no es un número. */
export function aBase(v: ValorCantidad): number | null {
  const n = leerNumero(v.texto)
  return n === null ? null : n * v.factor
}

interface Props {
  unidad: Unidad
  valor: ValorCantidad
  onCambiar: (v: ValorCantidad) => void
  placeholder?: string
  onEnter?: () => void
}

/** Campo de cantidad con selector de unidad: g/kg, ml/L o u. */
export default function EntradaCantidad({ unidad, valor, onCambiar, placeholder, onEnter }: Props) {
  const opciones = UNIDADES_ENTRADA[unidad]
  return (
    <div className="entrada-cantidad">
      <input
        className="campo"
        inputMode="decimal"
        placeholder={placeholder}
        value={valor.texto}
        onChange={(e) => onCambiar({ ...valor, texto: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      {opciones.length > 1 ? (
        <select
          className="campo unidad"
          value={valor.factor}
          onChange={(e) => onCambiar({ ...valor, factor: Number(e.target.value) })}
        >
          {opciones.map((u) => (
            <option key={u.etiqueta} value={u.factor}>
              {u.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <span className="unidad-fija">{unidad}</span>
      )}
    </div>
  )
}
