import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  titulo: string
  /** Se llama con la ✕, con Esc o tocando fuera de la tarjeta */
  onCerrar: () => void
  ancho?: number
  children: ReactNode
  pie?: ReactNode
}

/** Tarjetas abiertas, de la de abajo a la de arriba: Esc cierra solo la de arriba (ej. el PIN encima de otra). */
const abiertas: symbol[] = []

/** Tarjeta flotante centrada. Se puede arrastrar desde el título. */
export default function Modal({ titulo, onCerrar, ancho = 560, children, pie }: Props) {
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number } | null>(null)
  const [yo] = useState(() => Symbol(titulo))

  useEffect(() => {
    abiertas.push(yo)
    return () => {
      abiertas.splice(abiertas.indexOf(yo), 1)
    }
  }, [yo])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abiertas[abiertas.length - 1] === yo) onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar, yo])

  // Arrastrar: se guarda dónde se apretó y se mueve la tarjeta lo mismo que el mouse
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      if (!arrastre.current) return
      setDesplazamiento({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y })
    }
    const soltar = () => (arrastre.current = null)
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [])

  return (
    <div className="modal-fondo" onPointerDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div
        className="modal"
        role="dialog"
        aria-label={titulo}
        style={{ width: ancho, transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }}
      >
        <header
          className="modal-encabezado"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            arrastre.current = { x: e.clientX - desplazamiento.x, y: e.clientY - desplazamiento.y }
          }}
        >
          <h3>{titulo}</h3>
          <button className="icono" onClick={onCerrar} title="Cerrar (Esc)">
            ✕
          </button>
        </header>
        <div className="modal-cuerpo">{children}</div>
        {pie && <footer className="modal-pie">{pie}</footer>}
      </div>
    </div>
  )
}
