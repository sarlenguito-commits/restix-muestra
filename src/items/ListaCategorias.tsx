import { useState } from 'react'
import type { Categoria } from '@shared/types'

interface Props {
  categorias: Categoria[]
  /** Cantidad de productos por categoría */
  conteo: Record<number, number>
  categoriaId: number | null
  onElegir: (id: number) => void
  onCrear: (nombre: string) => Promise<boolean>
}

export default function ListaCategorias({ categorias, conteo, categoriaId, onElegir, onCrear }: Props) {
  const [nueva, setNueva] = useState('')

  const crear = async () => {
    if (!nueva.trim()) return
    if (await onCrear(nueva)) setNueva('')
  }

  return (
    <aside className="lista-categorias">
      <span className="paleta-titulo">Categorías</span>
      {categorias.map((c) => (
        <button
          key={c.id}
          className={`categoria-item ${c.id === categoriaId ? 'activo' : ''}`}
          onClick={() => onElegir(c.id)}
        >
          <span>{c.nombre}</span>
          <span className="conteo">{conteo[c.id] ?? 0}</span>
        </button>
      ))}
      <div className="categoria-nueva">
        <input
          className="campo"
          placeholder="+ Nueva categoría"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
      </div>
    </aside>
  )
}
