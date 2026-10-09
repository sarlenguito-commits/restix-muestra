import { useState, type ReactNode } from 'react'
import type { Salon } from '@shared/types'
import { CampoTexto } from '../components/Campos'

interface Props {
  salones: Salon[]
  salonId: number | null
  editando: boolean
  /** Salón que acaba de crearse: se abre directo para ponerle nombre */
  renombrarId: number | null
  onElegir: (id: number) => void
  onAgregar: () => void
  onRenombrar: (id: number, nombre: string) => Promise<boolean>
  onFinRenombrar: () => void
  children?: ReactNode
}

export default function Pestanas(props: Props) {
  const [renombrandoLocal, setRenombrandoLocal] = useState<number | null>(null)
  const renombrando = props.renombrarId ?? renombrandoLocal

  const terminar = () => {
    setRenombrandoLocal(null)
    props.onFinRenombrar()
  }

  return (
    <nav className="pestanas">
      {props.salones.map((s) =>
        renombrando === s.id ? (
          <CampoTexto
            key={s.id}
            className="pestana-campo"
            valor={s.nombre}
            autoFocus
            onGuardar={(nombre) => props.onRenombrar(s.id, nombre)}
            onTerminar={terminar}
          />
        ) : (
          <button
            key={s.id}
            className={`pestana ${s.id === props.salonId ? 'activa' : ''}`}
            onClick={() => props.onElegir(s.id)}
            onDoubleClick={() => setRenombrandoLocal(s.id)}
            title="Doble clic para renombrar"
          >
            {s.tipo === 'pedidosya' ? '🛵 ' : s.tipo === 'delivery' ? '🏠 ' : ''}
            {s.nombre}
          </button>
        )
      )}
      <button className="pestana pestana-agregar" onClick={props.onAgregar} title="Agregar salón (ej.: Patio)">
        +
      </button>
      <div className="pestanas-derecha">{props.children}</div>
    </nav>
  )
}
