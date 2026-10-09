import type { Ticket } from '@shared/ticket'
import Modal from '../components/Modal'
import VistaTicket from '../components/VistaTicket'

interface Props {
  titulo: string
  tickets: Ticket[]
  /** Algo que avisar arriba de los tickets */
  errorInicial?: string | null
  onCerrar: () => void
}

/** Vista previa de uno o más tickets (ej. cocina y barra). En la muestra no se imprime: se ven en pantalla. */
export default function ModalTickets({ titulo, tickets, errorInicial, onCerrar }: Props) {
  return (
    <Modal
      titulo={titulo}
      onCerrar={onCerrar}
      ancho={tickets.length > 1 ? 860 : 480}
      pie={
        <>
          {errorInicial && <p className="error">{errorInicial}</p>}
          <button onClick={onCerrar}>Cerrar</button>
        </>
      }
    >
      <p className="ayuda-lista">En el local, cada ticket sale por la impresora de su destino (cocina, barra o caja).</p>
      <div className="tickets">
        {tickets.map((t) => (
          <div key={t.titulo} className="ticket-columna">
            <div className="fila ticket-titulo">
              <strong>{t.titulo}</strong>
            </div>
            <VistaTicket ticket={t} />
          </div>
        ))}
      </div>
    </Modal>
  )
}
