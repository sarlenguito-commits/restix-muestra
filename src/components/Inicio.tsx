import { useEffect, useState } from 'react'
import PantallaCaja from '../caja/PantallaCaja'
import PantallaResumenes from '../caja/PantallaResumenes'
import PantallaCocina from '../cocina/PantallaCocina'
import PantallaItems from '../items/PantallaItems'
import PantallaPlano from '../plano/PantallaPlano'
import { estadoStock } from '../stock/estado'
import PantallaStock from '../stock/PantallaStock'
import BotonTema from './BotonTema'
import { Confirmaciones, confirmar } from './Confirmar'
import { PinAdmin } from './ModalPin'

type Seccion = 'plano' | 'cocina' | 'items' | 'stock' | 'caja' | 'resumenes'

const SECCIONES: { id: Seccion; nombre: string }[] = [
  { id: 'plano', nombre: 'Plano' },
  { id: 'cocina', nombre: 'Cocina' },
  { id: 'items', nombre: 'Ítems' },
  { id: 'stock', nombre: 'Stock' },
  { id: 'caja', nombre: 'Caja' },
  { id: 'resumenes', nombre: 'Resúmenes' }
]

export default function Inicio() {
  const [seccion, setSeccion] = useState<Seccion>('plano')
  const [stockBajo, setStockBajo] = useState(0)
  const [enCocina, setEnCocina] = useState(0)

  // Globito del menú: cuántos insumos están en el mínimo o debajo. Se recalcula cuando el stock cambia.
  useEffect(() => {
    const contar = () =>
      window.restix.insumos.listar().then((lista) => setStockBajo(lista.filter((i) => estadoStock(i) !== 'ok').length))
    contar()
    window.addEventListener('stock-cambiado', contar)
    return () => window.removeEventListener('stock-cambiado', contar)
  }, [])

  // Número de Cocina: envíos que todavía no salieron. Se revisa cada 10 segundos y cuando algo cambia.
  useEffect(() => {
    const contar = () => window.restix.cocina.pendientes().then((l) => setEnCocina(l.length))
    contar()
    const t = setInterval(contar, 10000)
    window.addEventListener('cocina-cambiada', contar)
    return () => {
      clearInterval(t)
      window.removeEventListener('cocina-cambiada', contar)
    }
  }, [])
  const reiniciar = async () => {
    const ok = await confirmar('Se borra todo lo que hiciste y vuelven los datos de muestra del principio.', {
      boton: 'Reiniciar',
      titulo: 'Reiniciar datos'
    })
    if (!ok) return
    window.restix.muestra.reiniciar()
    location.reload()
  }

  return (
    <div className="app">
      <header className="barra">
        <div className="barra-izquierda">
          <span className="marca">Restix</span>
          <nav className="menu">
            {SECCIONES.map((s) => (
              <button
                key={s.id}
                className={`menu-item ${seccion === s.id ? 'activo' : ''}`}
                onClick={() => setSeccion(s.id)}
              >
                {s.nombre}
                {s.id === 'cocina' && enCocina > 0 && (
                  <span className="globito" title="Envíos que faltan salir de cocina">
                    {enCocina}
                  </span>
                )}
                {s.id === 'stock' && stockBajo > 0 && (
                  <span className="globito" title="Insumos con stock bajo">
                    {stockBajo}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="barra-derecha">
          <span className="estado ok">Muestra con datos inventados</span>
          <button className="secundario" onClick={reiniciar} title="Vuelve a los datos de muestra del principio">
            Reiniciar datos
          </button>
          <BotonTema />
        </div>
      </header>
      <main className="principal">
        {seccion === 'plano' && <PantallaPlano />}
        {seccion === 'cocina' && <PantallaCocina />}
        {seccion === 'items' && <PantallaItems />}
        {seccion === 'stock' && <PantallaStock />}
        {seccion === 'caja' && <PantallaCaja />}
        {seccion === 'resumenes' && <PantallaResumenes />}
      </main>
      <PinAdmin />
      <Confirmaciones />
    </div>
  )
}
