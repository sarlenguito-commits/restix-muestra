import type { Ticket } from '@shared/ticket'

/** El ticket tal como sale en papel de 80 mm: mismos renglones, misma letra de ancho fijo. */
export default function VistaTicket({ ticket }: { ticket: Ticket }) {
  return (
    <div className="papel-ticket">
      {ticket.renglones.map((r, i) => (
        <div key={i} className={`${r.estilo ?? 'normal'} ${r.alineado === 'centro' ? 'centro' : ''}`}>
          {r.texto || ' '}
        </div>
      ))}
    </div>
  )
}
