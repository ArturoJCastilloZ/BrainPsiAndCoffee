import React from 'react';
import { Link } from 'react-router-dom';

// nginx ya respondio 404 (ver docker/nginx.conf); esto es lo que ve la
// persona. Antes una URL inventada redirigia a la portada con 200.
export default function NotFoundPage() {
  return (
    <section className="pub-hero">
      <div className="pub-wrap">
        <h1 className="pub-hero-title">Esta página no existe.</h1>
        <p className="pub-hero-lead">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <div className="pub-actions">
          <Link to="/" className="pub-btn pub-btn-primary">Ir al inicio</Link>
          <Link to="/reservar" className="pub-btn pub-btn-ghost">Solicitar una cita</Link>
        </div>
      </div>
    </section>
  );
}
