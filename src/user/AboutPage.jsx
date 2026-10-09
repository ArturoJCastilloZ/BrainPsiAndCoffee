import React from 'react';
import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap">
          <h1 className="pub-hero-title">Quiénes somos</h1>
          <p className="pub-hero-lead">
            Un consultorio de psicología y neuropsicología con una cafetería al frente. La idea es sencilla:
            que ir a terapia se sienta tan normal como quedar para un café.
          </p>
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap pub-two">
          <h2 className="pub-h2">Para qué existimos</h2>
          <p className="pub-lead" style={{ margin: 0 }}>
            Para romper el estigma de ir a terapia y cambiar la forma en que nos relacionamos con la salud
            mental: que sea algo cotidiano, accesible y humano.
          </p>
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-wrap pub-two">
          <h2 className="pub-h2">Qué hacemos</h2>
          <p className="pub-lead" style={{ margin: 0 }}>
            Atención psicológica y neuropsicológica para niñas, niños y adultos, en un espacio cálido y
            cercano. La cafetería invita a hacer una pausa: antes de la sesión, después, o mientras esperas
            a quien acompañas.
          </p>
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap pub-two">
          <h2 className="pub-h2">A dónde vamos</h2>
          <div>
            <p className="pub-lead">
              Queremos que la psicología salga del consultorio tradicional y forme parte de la vida diaria,
              con una comunidad que valore el autocuidado y la conversación.
            </p>
            <Link to="/reservar" className="pub-btn pub-btn-primary">Solicitar una cita</Link>
          </div>
        </div>
      </section>
    </>
  );
}
