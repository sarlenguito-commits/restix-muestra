import type { ReactNode } from 'react'
import type { FormaMesa, TipoElemento } from '@shared/types'

export interface OpcionPaleta {
  tipo: TipoElemento
  forma?: FormaMesa
  etiqueta: string
  icono: ReactNode
}

// Íconos simples de 20×20 que imitan cómo se ve cada cosa en el plano
const OPCIONES: OpcionPaleta[] = [
  {
    tipo: 'mesa',
    forma: 'cuadrada',
    etiqueta: 'Mesa cuadrada',
    icono: <rect x="5" y="5" width="10" height="10" rx="1.5" />
  },
  {
    tipo: 'mesa',
    forma: 'rectangular',
    etiqueta: 'Mesa rectangular',
    icono: <rect x="2" y="6" width="16" height="8" rx="1.5" />
  },
  { tipo: 'pared', etiqueta: 'Pared', icono: <rect x="1" y="8.5" width="18" height="3" fill="currentColor" /> },
  {
    tipo: 'barra',
    etiqueta: 'Barra',
    icono: <rect x="2" y="6" width="16" height="7" rx="1" fill="currentColor" opacity="0.6" />
  },
  {
    tipo: 'puerta',
    etiqueta: 'Puerta',
    icono: (
      <>
        <path d="M4 16 V4" />
        <path d="M4 4 A12 12 0 0 1 16 16" strokeDasharray="2 2" />
      </>
    )
  },
  { tipo: 'columna', etiqueta: 'Columna', icono: <rect x="6" y="6" width="8" height="8" fill="currentColor" /> },
  {
    tipo: 'planta',
    etiqueta: 'Planta',
    icono: (
      <>
        <circle cx="10" cy="10" r="7" />
        <circle cx="10" cy="10" r="3" fill="currentColor" />
      </>
    )
  },
  {
    tipo: 'texto',
    etiqueta: 'Texto',
    icono: (
      <text x="10" y="15" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" stroke="none">
        T
      </text>
    )
  }
]

interface Props {
  onAgregar: (opcion: OpcionPaleta) => void
}

export default function Paleta({ onAgregar }: Props) {
  return (
    <div className="paleta">
      <span className="paleta-titulo">Agregar</span>
      {OPCIONES.map((o) => (
        <button key={o.etiqueta} className="herramienta" onClick={() => onAgregar(o)} title={`Agregar ${o.etiqueta.toLowerCase()}`}>
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            {o.icono}
          </svg>
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}
