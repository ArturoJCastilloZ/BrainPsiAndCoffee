import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { fullDayLabel, uid, localDate } from '../utils.jsx';
import { precio } from './Pizarron';
import { validateOrder } from '../validation';
import { activeOffers } from '../offerUtils.mjs';
import { trackEvent } from '../monitoring';
import './menu.css';
import './booking.css';

export default function CartPage({ cart, setCart, orders, setOrders, setPage, linkedBookingId, setLinkedBookingId, bookings, showToast, catalogs }) {
  const linkedBooking = bookings.find(b => b.id === linkedBookingId);
  const [customer, setCustomer] = useState({
    customerName: linkedBooking?.name || '',
    customerPhone: linkedBooking?.phone || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Calculate combo
  // Por CATEGORIA, no por el prefijo del id. El trigger de 0023 usa
  // products.category; con prefijos, un producto con otro id dejaria de
  // contar para el combo aqui y si contaria alla, y el total mostrado no
  // coincidiria con el cobrado.
  const esCafe = (i) => i.category === 'hot' || i.category === 'cold';
  const esPostre = (i) => i.category === 'desserts';
  const hasCoffee = cart.some(esCafe);
  const hasDessert = cart.some(esPostre);
  // La de tipo 'combo', no "la primera". El trigger de 0025 usa
  // offers.kind; tomar la primera hacia que una promo cualquiera se
  // tratara como el combo — y como ambos lados se equivocaban igual, los
  // totales coincidian y nadie lo notaba.
  const comboOffer = activeOffers(catalogs?.offers || []).find((o) => o.kind === 'combo');
  // Sin '|| 99': con una oferta de precio 0 el cliente caia al 99 y el
  // servidor usaba 0, y ahi si divergian el total mostrado y el cobrado.
  const comboPrice = comboOffer ? Number(comboOffer.price) : null;
  const comboApplied = Boolean(comboOffer && comboPrice !== null && hasCoffee && hasDessert);

  const subtotal = cart.reduce((sum, item) => sum + (item.customizations?.totalPrice || item.price) * item.qty, 0);

  // Find cheapest coffee + dessert for combo savings
  let comboSavings = 0;
  if (comboApplied) {
    const coffees = cart.filter(esCafe);
    const desserts = cart.filter(esPostre);
    const minCoffee = Math.min(...coffees.map(c => c.customizations?.totalPrice || c.price));
    // Igual que el cafe de la linea de arriba. Hoy no diverge porque solo
    // se personalizan bebidas, pero el servidor usa min(unit_price) sin
    // distinguir categoria: el dia que se personalice un postre, el ahorro
    // mostrado y el aplicado dejarian de coincidir.
    const minDessert = Math.min(...desserts.map(d => d.customizations?.totalPrice || d.price));
    if (minCoffee + minDessert > comboPrice) comboSavings = (minCoffee + minDessert) - comboPrice;
  }
  const total = subtotal - comboSavings;

  const placeOrder = async () => {
    if (saving) return;
    const nextErrors = validateOrder(customer);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const order = {
      id: uid(),
      items: cart,
      subtotal, comboSavings, total,
      linkedBookingId,
      customerName: customer.customerName.trim(),
      customerPhone: customer.customerPhone.trim(),
      source: linkedBookingId ? 'appointment' : 'public_menu',
      status: linkedBookingId ? 'pending_appointment' : 'received',
      targetReadyAt: linkedBooking ? targetReadyAt(linkedBooking) : '',
      operationalNotes: linkedBookingId ? 'Pedido ligado a cita. Preparar cerca de la hora objetivo.' : '',
      createdAt: new Date().toISOString()
    };
    // El carrito se vacia y se dice "enviado" SOLO si la base acepto el
    // pedido. Antes se vaciaba primero: si el guardado fallaba, el cliente
    // perdia su carrito y la barra nunca recibia el pedido.
    setSaving(true);
    setErrors({});
    const result = await setOrders([...orders, order]);
    setSaving(false);
    if (!result?.ok) {
      setErrors({ submit: 'No pudimos enviar tu pedido. Revisa tu conexión e inténtalo de nuevo.' });
      return;
    }
    trackEvent('coffee_order_created', {
      itemCount: cart.length,
      total,
      linkedBooking: Boolean(linkedBookingId),
    });
    setCart([]);
    setLinkedBookingId(null);
    showToast(linkedBookingId ? 'Pedido enviado. Estará listo 10 minutos antes de tu cita.' : 'Pedido enviado. Te avisamos cuando esté listo.');
    setPage('home');
  };

  if (cart.length === 0) {
    return (
      <section className="pub-hero">
        <div className="pub-wrap" style={{ maxWidth: 640 }}>
          <h1 className="pub-hero-title">Tu pedido está vacío</h1>
          <p className="pub-hero-lead">Elige algo en la cafetería y aparece aquí.</p>
          <Link to="/cafeteria" className="pub-btn pub-btn-primary">Ver la cafetería</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="pub-wrap" style={{ maxWidth: 640, padding: '32px var(--pub-gutter) 56px' }}>
      <Link to="/cafeteria" className="pub-link" style={{ fontWeight: 400 }}>Seguir viendo el menú</Link>
      <h1 className="pub-h2" style={{ margin: '12px 0 20px' }}>Tu pedido</h1>

      {linkedBooking && (
        <p className="pub-notice" style={{ marginBottom: 16 }}>
          Ligado a tu cita del {fullDayLabel(localDate(linkedBooking.date))} a las {linkedBooking.time}. Lo preparamos para que esté listo 10 minutos antes.
        </p>
      )}

      <section className="pub-board" aria-label="Productos">
        <ul className="pub-board-list">
          {cart.map((item) => (
            <li key={item.cartId} className="pub-board-item menu-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
              <div className="menu-item-text">
                <span className="pub-board-name" style={{ fontSize: 19 }}>{item.name}</span>
                <span className="pub-board-detail">
                  {/* Los extras se listan por su nombre: cada clinica define
                      los suyos. Se conserva la lectura de extraShot para los
                      pedidos viejos, guardados antes de los addons. */}
                  {item.customizations?.milk && `${item.customizations.milk}`}
                  {item.customizations?.flavor && ` · ${item.customizations.flavor}`}
                  {(item.customizations?.addons || []).map((a) => ` · ${a}`).join('')}
                  {!item.customizations?.addons?.length && item.customizations?.extraShot && ' · Shot extra'}
                  {!item.customizations?.milk && item.sub}
                </span>
              </div>
              <span className="pub-board-price" style={{ fontSize: 19 }}>{precio(item.customizations?.totalPrice || item.price)}</span>
              <button type="button" className="pub-icon-btn" style={{ color: 'var(--pub-board-text)' }}
                onClick={() => setCart(cart.filter((c) => c.cartId !== item.cartId))} aria-label={`Quitar ${item.name}`}>
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
        <div className="pub-board-foot">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{precio(subtotal)}</span></div>
          {comboApplied && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{comboOffer?.name || 'Combo café + postre'}</span><span>−{precio(comboSavings)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, color: 'var(--pub-board-text)' }}>
            <span>Total</span><span className="pub-board-price" style={{ fontSize: 28 }}>{precio(total)}</span>
          </div>
        </div>
      </section>

      {/* comboOffer en la condicion, no solo !comboApplied: sin oferta de
          combo, comboPrice es null y "estas cerca del combo" no dice nada. */}
      {comboOffer && !comboApplied && (hasCoffee || hasDessert) && (
        <p className="pub-notice" style={{ marginTop: 16 }}>
          Agrega un {hasCoffee ? 'postre' : 'café'} y se vuelve {comboOffer.name.toLowerCase()} por {precio(comboPrice)}.
        </p>
      )}

      <div className="bk-form" style={{ marginTop: 24 }}>
        <h2 className="pub-h3" style={{ margin: 0 }}>Para avisarte cuando esté listo</h2>
        <OrderField id="pedido-nombre" label="Nombre" value={customer.customerName} error={errors.customerName} autoComplete="name" onChange={(customerName) => {
          setCustomer({ ...customer, customerName });
          if (errors.customerName) setErrors({ ...errors, customerName: '' });
        }} />
        <OrderField id="pedido-telefono" label="WhatsApp" type="tel" placeholder="81 1234 5678" value={customer.customerPhone} error={errors.customerPhone} autoComplete="tel" onChange={(customerPhone) => {
          setCustomer({ ...customer, customerPhone });
          if (errors.customerPhone) setErrors({ ...errors, customerPhone: '' });
        }} />
      </div>

      {errors.submit && <p role="alert" className="pub-error" style={{ margin: '16px 0 0' }}>{errors.submit}</p>}

      <button type="button" className="pub-btn pub-btn-primary bk-submit" onClick={placeOrder} disabled={saving} aria-busy={saving}>
        {saving ? 'Enviando tu pedido…' : 'Enviar pedido'}
      </button>
    </div>
  );
}

function targetReadyAt(booking) {
  if (!booking?.date || !booking?.time) return '';
  const target = new Date(`${booking.date}T${booking.time}`);
  target.setMinutes(target.getMinutes() - 10);
  return target.toISOString();
}

function OrderField({ id, label, value, onChange, error, type = 'text', placeholder, autoComplete }) {
  return (
    <div className="pub-field">
      <label className="pub-label" htmlFor={id}>{label}</label>
      <input id={id} className="pub-input" type={type} inputMode={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined} spellCheck={type === 'email' ? false : undefined} value={value} placeholder={placeholder} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      {error && <span id={`${id}-error`} className="pub-error">{error}</span>}
    </div>
  );
}
