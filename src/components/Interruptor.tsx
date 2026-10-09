import type { ReactNode } from 'react'

interface Props {
  activo: boolean
  onCambiar: (activo: boolean) => void
  titulo?: string
  /** Texto al lado: tocarlo también prende o apaga (antes había que acertarle al interruptor) */
  texto?: ReactNode
}

/** Interruptor encendido/apagado (un checkbox con otra apariencia). */
export default function Interruptor({ activo, onCambiar, titulo, texto }: Props) {
  return (
    <>
      <label className="interruptor" title={titulo} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={activo} onChange={(e) => onCambiar(e.target.checked)} />
        <span />
      </label>
      {texto !== undefined && (
        <span className="ayuda-lista texto-interruptor" onClick={() => onCambiar(!activo)}>
          {texto}
        </span>
      )}
    </>
  )
}
