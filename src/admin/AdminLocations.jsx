import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Save } from 'lucide-react';
import { C } from '../theme';
import { safeUrl } from '../safeUrl.mjs';

// Sucursales (0040).
//
// Cada una tiene nombre, direccion, enlace de mapa y si tiene cafeteria.
// Lo que se atiende en cada una NO se configura aqui: sale de los
// horarios (Consultorio → Horarios), donde cada bloque dice en que
// sucursal es. Un servicio aparece en una sucursal si algun especialista
// que lo da tiene horario ahi.
//
// No se borran: una sucursal con horarios o citas solo se desactiva (la
// base lo impide, y borrarla dejaria citas sin lugar).

const idDesde = (nombre, usados) => {
  const base = String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sucursal';
  let id = base;
  for (let n = 2; usados.has(id); n += 1) id = `${base}-${n}`;
  return id;
};

export default function AdminLocations({ catalogs, catalogActions }) {
  const guardadas = catalogs?.locations || [];
  const [lista, setLista] = useState(guardadas);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Si el catalogo se recarga (otra pestaña, otro usuario), se toma lo
  // nuevo mientras no haya cambios sin guardar aqui.
  const sinCambios = JSON.stringify(lista) === JSON.stringify(guardadas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (sinCambios) setLista(guardadas); }, [guardadas]);

  const cambiar = (i, campo, valor) => {
    setAviso('');
    setLista((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  const agregar = () => {
    setAviso('');
    setLista((prev) => [...prev, {
      id: '', name: '', address: '', mapsUrl: '', hasCafe: false, active: true, nueva: true,
    }]);
  };

  const quitarNueva = (i) => setLista((prev) => prev.filter((_, j) => j !== i));

  const problema = (() => {
    for (const l of lista) {
      if (String(l.name || '').trim().length < 2) return 'Cada sucursal necesita un nombre.';
      if (String(l.mapsUrl || '').trim() && !safeUrl(l.mapsUrl)) return `El enlace de mapa de "${l.name}" tiene que empezar con https://.`;
    }
    const nombres = lista.map((l) => String(l.name || '').trim().toLowerCase());
    if (new Set(nombres).size !== nombres.length) return 'Hay dos sucursales con el mismo nombre.';
    return '';
  })();

  const guardar = async () => {
    if (problema) { setError(problema); return; }
    setGuardando(true);
    setError('');
    setAviso('');
    const usados = new Set(lista.filter((l) => l.id).map((l) => l.id));
    const final = lista.map((l) => {
      if (l.id) return { ...l, nueva: undefined };
      const id = idDesde(l.name, usados);
      usados.add(id);
      return { ...l, id, nueva: undefined };
    }).map(({ nueva, ...resto }) => resto);
    const r = await catalogActions.setLocations(final);
    setGuardando(false);
    if (r?.ok === false) {
      setError(r.error?.message || 'No se pudieron guardar las sucursales.');
      return;
    }
    setLista(final);
    setAviso('Sucursales guardadas. Ahora asigna cada bloque de horario a su sucursal en Consultorio → Horarios.');
  };

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Sucursales
      </h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', margin: '0 0 20px', maxWidth: 680, lineHeight: 1.55 }}>
        Los lugares donde se atiende. Qué se ofrece en cada una sale de los horarios: en Consultorio → Horarios
        cada bloque dice en qué sucursal es. Al pedir cita en la página, el paciente elige primero la sucursal.
      </p>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}

      <div style={{ display: 'grid', gap: 12 }}>
        {lista.length === 0 && (
          <div style={tarjeta}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--admin-muted)' }}>
              Todavía no hay sucursales. Mientras no haya, la reserva no pregunta el lugar.
            </p>
          </div>
        )}
        {lista.map((l, i) => (
          <fieldset key={l.id || `nueva-${i}`} style={{ ...tarjeta, margin: 0, opacity: l.active === false ? 0.7 : 1 }}>
            <legend style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', fontSize: 13, fontWeight: 700, color: 'var(--admin-text)' }}>
              <MapPin size={14} aria-hidden="true" /> {String(l.name || '').trim() || 'Sucursal nueva'}
              {l.active === false && <span style={{ fontWeight: 600, color: 'var(--admin-muted)' }}> · desactivada</span>}
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
              <Campo etiqueta="Nombre">
                <input className="admin-input" style={campo} value={l.name} placeholder="Lincoln"
                  onChange={(e) => cambiar(i, 'name', e.target.value)} />
              </Campo>
              <Campo etiqueta="Dirección">
                <input className="admin-input" style={campo} value={l.address} placeholder="Av Abraham Lincoln 1600, Real Cumbres"
                  onChange={(e) => cambiar(i, 'address', e.target.value)} />
              </Campo>
              <Campo etiqueta="Enlace de Google Maps">
                <input className="admin-input" style={campo} value={l.mapsUrl} placeholder="https://maps.app.goo.gl/…"
                  onChange={(e) => cambiar(i, 'mapsUrl', e.target.value)} />
              </Campo>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <label style={casilla}>
                <input type="checkbox" checked={Boolean(l.hasCafe)} onChange={(e) => cambiar(i, 'hasCafe', e.target.checked)} />
                Tiene cafetería (se ofrece pedir café con la cita)
              </label>
              <label style={casilla}>
                <input type="checkbox" checked={l.active !== false} onChange={(e) => cambiar(i, 'active', e.target.checked)} />
                Activa (aparece al pedir cita)
              </label>
              {l.nueva && (
                <button type="button" onClick={() => quitarNueva(i)} style={{ ...botonSecundario, marginLeft: 'auto' }}>Quitar</button>
              )}
            </div>
          </fieldset>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" onClick={agregar} style={botonSecundario}>
          <Plus size={14} aria-hidden="true" /> Agregar sucursal
        </button>
        <button type="button" onClick={guardar} disabled={guardando || sinCambios} style={{ ...botonPrimario, opacity: guardando || sinCambios ? 0.5 : 1 }}>
          <Save size={14} aria-hidden="true" /> {guardando ? 'Guardando…' : 'Guardar sucursales'}
        </button>
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--admin-row-text)' }}>
      {etiqueta}
      {children}
    </label>
  );
}

function Aviso({ tono, children }) {
  const esError = tono === 'error';
  return (
    <div role={esError ? 'alert' : 'status'} style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
      border: '1px solid ' + (esError ? C.rustAlpha40 : 'var(--admin-border)'),
      background: esError ? C.rustAlpha20 : 'var(--admin-surface-soft)',
      color: esError ? C.rustText : 'var(--admin-text)',
    }}>
      {children}
    </div>
  );
}

const tarjeta = {
  background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 16,
};
const campo = {
  width: '100%', boxSizing: 'border-box', background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)',
  borderRadius: 9, padding: '9px 10px', color: 'var(--admin-text)', fontFamily: 'inherit', fontSize: 14, fontWeight: 400,
};
const casilla = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--admin-text)', cursor: 'pointer' };
const botonBase = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, minHeight: 40,
  fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const botonPrimario = { ...botonBase, background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none' };
const botonSecundario = { ...botonBase, background: 'transparent', color: 'var(--admin-text)', border: '1px solid var(--admin-border-interactive)' };
