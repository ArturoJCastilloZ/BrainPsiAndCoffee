import React from 'react';
import { Link } from 'react-router-dom';

// El elemento firma del sitio: servicios y bebidas con la misma gramatica
// de menu de cafeteria —nombre, puntos, duracion, precio—. Hace visible la
// propuesta: la terapia con precio a la vista, como el cafe.
//
// Es una lista de verdad (<ul>) y cada renglon, si lleva a algun lado, un
// enlace con su texto completo: el lector de pantalla oye "Psicologia
// infantil, 45 minutos, 550 pesos", no "........".

export const precio = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '';
};

export default function Pizarron({ titulo, nota, items, pie, vacio, as: Encabezado = 'h2', id }) {
  return (
    <section className="pub-board" aria-labelledby={id}>
      <Encabezado className="pub-board-title" id={id}>{titulo}</Encabezado>
      {nota && <p className="pub-board-note">{nota}</p>}
      {items.length === 0 ? (
        <p className="pub-board-empty">{vacio}</p>
      ) : (
        <ul className="pub-board-list">
          {items.map((item) => {
            const contenido = (
              <>
                <span className="pub-board-name">{item.nombre}</span>
                <span className="pub-board-leader" aria-hidden="true" />
                <span className="pub-board-time">{item.tiempo || ''}</span>
                <span className="pub-board-price">{item.precio}</span>
                {item.detalle && <span className="pub-board-detail">{item.detalle}</span>}
              </>
            );
            return (
              <li key={item.id} className="pub-board-item">
                {item.href
                  ? <Link to={item.href} className="pub-board-row">{contenido}</Link>
                  : <div className="pub-board-row">{contenido}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {pie && <p className="pub-board-foot">{pie}</p>}
    </section>
  );
}
