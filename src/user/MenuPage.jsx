import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MENU_CATEGORIAS } from '../menuCategorias.mjs';
import { activeOffers } from '../offerUtils.mjs';
import { groupOptions, optionsTotal } from '../menuOptions.mjs';
import { precio } from './Pizarron';
import './menu.css';

export default function MenuPage({ addToCart, catalogs, dataLoading }) {
  const [activeTab, setActiveTab] = useState('hot');
  const [customizing, setCustomizing] = useState(null);
  const menu = catalogs?.menu || {};
  const combo = activeOffers(catalogs?.offers || []).find((o) => o.kind === 'combo');
  // Leches, sabores y extras salen de la base. Sin configurar, el modal
  // simplemente no ofrece esa seccion.
  const options = groupOptions(catalogs?.productOptions || []);

  // Las pestañas salen de la MISMA taxonomia que usa la capa de datos
  // para armar las secciones.
  const tabs = MENU_CATEGORIAS.map((c) => ({ id: c.id, label: c.pestana }));

  // Sin seccion en la base no hay seccion, y se DICE: nunca se cae al
  // menu de demostracion con sus precios.
  const section = menu[activeTab] || null;
  const items = (section?.items || []).filter((item) => item.active !== false);
  const isCoffee = activeTab === 'hot' || activeTab === 'cold';

  return (
    <>
      <section className="pub-hero" style={{ paddingBottom: 24 }}>
        <div className="pub-wrap">
          <h1 className="pub-hero-title">La cafetería</h1>
          <p className="pub-hero-lead">
            Cada bebida lleva el nombre de un estado de ánimo: elige el tuyo. Si vienes a una cita, pídelo
            y lo tenemos listo diez minutos antes.
          </p>
        </div>
      </section>

      <section className="pub-wrap" style={{ paddingBottom: 56 }} aria-label="Menú">
        <div className="pub-choice-row" role="group" aria-label="Sección del menú" style={{ marginBottom: 20 }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className="pub-choice" aria-pressed={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="pub-board menu-board">
          <div className="menu-board-head">
            <h2 className="pub-board-title">{section?.title || tabs.find((t) => t.id === activeTab)?.label}</h2>
            {section?.size && <span className="pub-board-note" style={{ margin: 0 }}>{section.size}</span>}
          </div>

          {items.length === 0 ? (
            <p className="pub-board-empty">
              {dataLoading ? 'Cargando el menú…' : 'Todavía no hay nada publicado en esta sección.'}
            </p>
          ) : (
            <ul className="pub-board-list">
              {items.map((item) => (
                <li key={item.id} className="pub-board-item menu-item">
                  <div className="menu-item-text">
                    <span className="pub-board-name">{item.name}</span>
                    {item.sub && <span className="pub-board-detail">{item.sub}</span>}
                  </div>
                  <span className="pub-board-price">{precio(item.price)}</span>
                  <button type="button" className="menu-add"
                    onClick={() => (isCoffee ? setCustomizing(item) : addToCart(item))}
                    aria-label={`${isCoffee ? 'Personalizar' : 'Agregar'} ${item.name}`}>
                    {isCoffee ? 'Personalizar' : 'Agregar'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {combo && <p className="pub-board-foot">{combo.name}: {precio(combo.price)}. {combo.desc}</p>}
        </div>
      </section>

      {customizing && (
        <CustomizeDialog item={customizing} options={options} onClose={() => setCustomizing(null)}
          onAdd={(item, custom) => { addToCart(item, custom); setCustomizing(null); }} />
      )}
    </>
  );
}

// Dialogo NATIVO (<dialog> + showModal): el navegador da gratis lo que
// faltaba — Escape cierra, el foco queda atrapado dentro y vuelve al
// boton que lo abrio, y el resto de la pagina queda inerte para el lector
// de pantalla. Antes era un <div> encima: sin Escape, sin trampa de foco
// y sin boton de cerrar.
function CustomizeDialog({ item, options, onClose, onAdd }) {
  const ref = useRef(null);
  const { milks = [], flavors = [], addons = [] } = options || {};
  const [milk, setMilk] = useState(milks[0] || null);
  const [flavor, setFlavor] = useState(null);
  const [addonIds, setAddonIds] = useState([]);

  // Sin close() en la limpieza, a proposito: al desmontar, React quita el
  // <dialog> del documento y eso ya lo saca de la capa superior. Cerrarlo
  // aqui disparaba 'close' -> onClose, y con StrictMode (que en desarrollo
  // monta, limpia y vuelve a montar) el dialogo se cerraba solo al abrir.
  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  const chosenAddons = addons.filter((a) => addonIds.includes(a.id));
  const total = optionsTotal(item.price, { milk, flavor, addons: chosenAddons });
  const toggleAddon = (id) => setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const recargo = (n) => (n > 0 ? ` +${precio(n)}` : '');

  return (
    <dialog ref={ref} className="menu-dialog" aria-labelledby="menu-dialog-title"
      onClose={onClose}
      // Clic en el fondo (el propio <dialog>, fuera de la caja) cierra.
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="menu-dialog-box">
        <div className="menu-dialog-head">
          <div>
            <h2 id="menu-dialog-title" className="pub-h3" style={{ margin: 0 }}>{item.name}</h2>
            {item.sub && <p className="pub-hint" style={{ margin: '2px 0 0' }}>{item.sub}</p>}
          </div>
          <button type="button" className="pub-icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="menu-dialog-body">
          {milks.length > 0 && (
            <fieldset className="menu-fieldset">
              <legend className="pub-label">Leche</legend>
              <div className="pub-choice-row">
                {milks.map((m) => (
                  <button key={m.id} type="button" className="pub-choice" aria-pressed={milk?.id === m.id} onClick={() => setMilk(m)}>
                    {m.name}{recargo(m.priceDelta)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {flavors.length > 0 && (
            <fieldset className="menu-fieldset">
              {/* Cada sabor lleva su propio recargo: lo decide el admin. */}
              <legend className="pub-label">Sabor</legend>
              <div className="pub-choice-row">
                <button type="button" className="pub-choice" aria-pressed={flavor === null} onClick={() => setFlavor(null)}>Sin sabor</button>
                {flavors.map((f) => (
                  <button key={f.id} type="button" className="pub-choice" aria-pressed={flavor?.id === f.id} onClick={() => setFlavor(f)}>
                    {f.name}{recargo(f.priceDelta)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {addons.length > 0 && (
            <fieldset className="menu-fieldset">
              <legend className="pub-label">Extras</legend>
              {addons.map((a) => (
                <label key={a.id} className="menu-check">
                  <input type="checkbox" checked={addonIds.includes(a.id)} onChange={() => toggleAddon(a.id)} />
                  <span>{a.name}</span>
                  <span className="menu-check-price">+{precio(a.priceDelta)}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div className="menu-dialog-foot">
          <button type="button" className="pub-btn pub-btn-primary" style={{ width: '100%', justifyContent: 'space-between' }}
            onClick={() => onAdd(item, {
              // Los IDS son lo que el servidor valida contra el catalogo.
              // Un nombre no es una llave: no se puede comprobar, y dos
              // clinicas pueden tener sabores homonimos a precios distintos.
              // Sin esto, el trigger de 0023 cobraria solo el precio base.
              optionIds: [milk?.id, flavor?.id, ...chosenAddons.map((a) => a.id)].filter(Boolean),
              // Los nombres se conservan solo para mostrarlos en el carrito
              // y en el ticket del barista.
              milk: milk?.name || null,
              flavor: flavor?.name || null,
              addons: chosenAddons.map((a) => a.name),
              // Se conserva para no romper pedidos ya guardados que lo leen.
              extraShot: chosenAddons.length > 0,
              // Lo que se le muestra al cliente. El servidor lo recalcula y
              // manda; si divergen, gana el catalogo.
              totalPrice: total,
            })}>
            <span>Agregar a mi pedido</span>
            <span>{precio(total)}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
