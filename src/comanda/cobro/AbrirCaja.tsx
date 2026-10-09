import { useEffect, useState } from 'react'
import { formatearPrecio, leerPrecio, precioParaCampo } from '../../formato'

interface Props {
  onAbrir: (efectivoInicial: number) => Promise<boolean>
}

/**
 * Abrir la caja. La caja chica propone lo contado en el cierre anterior (pasa de turno en turno);
 * se puede corregir si hace falta.
 */
export default function AbrirCaja({ onAbrir }: Props) {
  const [sugerida, setSugerida] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.restix.caja.chicaSugerida().then((monto) => {
      setSugerida(monto)
      setTexto(monto ? precioParaCampo(monto) : '')
    })
  }, [])

  const abrir = async () => {
    const centavos = texto.trim() ? leerPrecio(texto) : 0
    if (centavos === null) return setError('Monto inválido.')
    setError(null)
    await onAbrir(centavos)
  }

  return (
    <div className="abrir-caja">
      <h4>La caja está cerrada</h4>
      <p className="ayuda-lista">
        {sugerida
          ? `La caja chica arranca con ${formatearPrecio(sugerida)}, lo contado en el último cierre. Corregilo si hace falta.`
          : 'Para empezar, cargá el efectivo de la caja chica (el cambio).'}
      </p>
      <div className="fila">
        <span>Caja chica</span>
        <div className="campo-precio">
          <span>$</span>
          <input
            className="campo"
            autoFocus
            placeholder="0"
            inputMode="decimal"
            value={texto}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && abrir()}
          />
        </div>
        <button onClick={abrir}>Abrir caja</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
