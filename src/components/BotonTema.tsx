import { useState } from 'react'
import { aplicarTema, temaActual } from '../tema'

export default function BotonTema() {
  const [tema, setTema] = useState(temaActual())

  const cambiar = () => {
    const nuevo = tema === 'oscuro' ? 'claro' : 'oscuro'
    aplicarTema(nuevo)
    setTema(nuevo)
    window.restix.tema.set(nuevo)
  }

  return (
    <button
      className="icono"
      onClick={cambiar}
      title={tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {tema === 'oscuro' ? '☀' : '☾'}
    </button>
  )
}
