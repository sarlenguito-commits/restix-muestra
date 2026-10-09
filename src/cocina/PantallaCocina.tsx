import { useCallback, useEffect, useState } from 'react'
import type { EnvioCocina } from '@shared/types'
import { etiquetaComanda } from '@shared/ticket'

/** Minutos para el aviso amarillo y el rojo */
const DEMORA = 15
const ATRASO = 25

/** "2026-09-24 20:15:03" (hora local de la base) → Date */
const fecha = (s: string) => new Date(s.replace(' ', 'T'))
const hora = (s: string) => s.slice(11, 16)

/** Avisa al menú (el número de Cocina) que algo cambió */
export const avisarCocina = () => window.dispatchEvent(new Event('cocina-cambiada'))

function Tarjeta({
  e,
  ahora,
  entregado,
  onMarcar
}: {
  e: EnvioCocina
  ahora: number
  entregado?: boolean
  onMarcar: () => void
}) {
  const minutos = Math.max(0, Math.floor((ahora - fecha(e.enviado_en).getTime()) / 60000))
  const nivel = entregado ? '' : minutos >= ATRASO ? 'atrasado' : minutos >= DEMORA ? 'demora' : ''
  return (
    <article className={`tarjeta-cocina ${nivel} ${entregado ? 'entregado' : ''}`}>
      <header>
        <strong>{etiquetaComanda(e)}</strong>
        <span className="ayuda-lista">
          {hora(e.enviado_en)}
          {e.envio > 1 && ` · envío ${e.envio}`}
        </span>
      </header>
      <p className={`demora-texto ${nivel}`}>
        {entregado
          ? `Entregado ${hora(e.entregado_en ?? '')}`
          : `${nivel === 'atrasado' ? '⚠ ' : ''}hace ${minutos === 0 ? 'menos de 1 min' : `${minutos} min`}`}
      </p>
      <ul>
        {e.items.map((i) => (
          <li key={i.id}>
            <strong>{i.cantidad} ×</strong> {i.nombre}
            {i.nota && <span className="nota-item">({i.nota})</span>}
          </li>
        ))}
      </ul>
      <button className={entregado ? 'secundario' : 'enviar'} onClick={onMarcar}>
        {entregado ? '↩ Deshacer' : e.canal === 'salon' ? '✓ En mesa' : '✓ Entregado'}
      </button>
    </article>
  )
}

/** Lo que cocina tiene que preparar: una tarjeta por envío, del más viejo al más nuevo. */
export default function PantallaCocina() {
  const [pendientes, setPendientes] = useState<EnvioCocina[] | null>(null)
  const [entregados, setEntregados] = useState<EnvioCocina[] | null>(null)
  const [verEntregados, setVerEntregados] = useState(false)
  const [ahora, setAhora] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setPendientes(await window.restix.cocina.pendientes())
    if (verEntregados) setEntregados(await window.restix.cocina.entregados())
    setAhora(Date.now())
  }, [verEntregados])

  // Se actualiza sola cada 10 segundos (pedidos nuevos y los minutos de cada tarjeta)
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 10000)
    window.addEventListener('cocina-cambiada', cargar)
    return () => {
      clearInterval(t)
      window.removeEventListener('cocina-cambiada', cargar)
    }
  }, [cargar])

  const marcar = async (e: EnvioCocina, entregado: boolean) => {
    const r = await window.restix.cocina.entregar(e.comanda_id, e.envio, entregado)
    setError(r.ok ? null : r.error)
    avisarCocina()
  }

  if (!pendientes) return <div className="cargando">Cargando…</div>

  return (
    <div className="pantalla-caja pantalla-cocina">
      <header className="zona-encabezado">
        <div>
          <h2 className="titulo-seccion">Cocina</h2>
          <span className="ayuda-lista">
            Lo que falta llevar, del más viejo al más nuevo. Amarillo a los {DEMORA} min y rojo a los {ATRASO}.
          </span>
        </div>
        <button className="secundario" onClick={() => setVerEntregados((v) => !v)}>
          {verEntregados ? 'Ocultar entregados' : 'Ver entregados hoy'}
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {pendientes.length ? (
        <div className="grilla-cocina">
          {pendientes.map((e) => (
            <Tarjeta key={`${e.comanda_id}-${e.envio}`} e={e} ahora={ahora} onMarcar={() => marcar(e, true)} />
          ))}
        </div>
      ) : (
        <p className="vacio-cocina">No hay nada pendiente en cocina 🎉</p>
      )}

      {verEntregados && (
        <section>
          <h3 className="titulo-seccion chico">Entregados hoy</h3>
          {entregados?.length ? (
            <div className="grilla-cocina">
              {entregados.map((e) => (
                <Tarjeta
                  key={`${e.comanda_id}-${e.envio}`}
                  e={e}
                  ahora={ahora}
                  entregado
                  onMarcar={() => marcar(e, false)}
                />
              ))}
            </div>
          ) : (
            <p className="ayuda-lista">Todavía no se entregó nada hoy.</p>
          )}
        </section>
      )}
    </div>
  )
}
