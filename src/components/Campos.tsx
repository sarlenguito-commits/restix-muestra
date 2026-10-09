import { useEffect, useState } from 'react'
import { leerPrecio, precioParaCampo } from '../formato'

// Campos que guardan al salir (Enter o clic afuera), no en cada tecla:
// así no se valida un nombre a medio escribir.

interface CampoTextoProps {
  valor: string
  /** Devuelve false si no se pudo guardar: el campo vuelve al valor anterior */
  onGuardar: (v: string) => Promise<boolean>
  autoFocus?: boolean
  className?: string
  placeholder?: string
  onTerminar?: () => void
}

export function CampoTexto({ valor, onGuardar, autoFocus, className, placeholder, onTerminar }: CampoTextoProps) {
  const [local, setLocal] = useState(valor)
  useEffect(() => setLocal(valor), [valor])

  const guardar = async () => {
    const limpio = local.trim()
    if (limpio !== valor && !(await onGuardar(limpio))) setLocal(valor)
    onTerminar?.()
  }

  return (
    <input
      className={className ?? 'campo'}
      value={local}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={(e) => autoFocus && e.target.select()}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setLocal(valor)
          onTerminar?.()
        }
      }}
    />
  )
}

interface CampoNumeroProps {
  valor: number
  min: number
  max: number
  onGuardar: (v: number) => Promise<boolean>
}

export function CampoNumero({ valor, min, max, onGuardar }: CampoNumeroProps) {
  const [local, setLocal] = useState(String(valor))
  useEffect(() => setLocal(String(valor)), [valor])

  const guardar = async () => {
    const n = Math.round(Number(local))
    if (!Number.isFinite(n) || n < min || n > max) return setLocal(String(valor))
    if (n !== valor && !(await onGuardar(n))) setLocal(String(valor))
  }

  return (
    <input
      className="campo numero"
      type="number"
      value={local}
      min={min}
      max={max}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

interface CampoPrecioProps {
  /** En centavos */
  valor: number
  onGuardar: (centavos: number) => Promise<boolean>
}

/** Precio en pesos: se muestra "9.000" y se acepta "9000", "9.000" o "9.000,50". */
export function CampoPrecio({ valor, onGuardar }: CampoPrecioProps) {
  const [local, setLocal] = useState(precioParaCampo(valor))
  useEffect(() => setLocal(precioParaCampo(valor)), [valor])

  const guardar = async () => {
    const centavos = leerPrecio(local)
    if (centavos === null) return setLocal(precioParaCampo(valor))
    if (centavos !== valor && !(await onGuardar(centavos))) return setLocal(precioParaCampo(valor))
    setLocal(precioParaCampo(centavos))
  }

  return (
    <div className="campo-precio">
      <span>$</span>
      <input
        className="campo"
        value={local}
        inputMode="decimal"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  )
}
