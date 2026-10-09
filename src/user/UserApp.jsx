import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Brain, CalendarCheck, Coffee, Home, MessageCircle, Moon, ShoppingBag, Sun, X } from 'lucide-react';
import { uid } from '../utils.jsx';
import BrandMark from '../components/BrandMark';
import { businessFromSettings, BUSINESS_PLACEHOLDERS, hayWhatsapp, tieneDato, whatsappUrl } from '../businessInfo';
import { LEGACY_REDIRECTS, NAV_LINKS } from '../seo/routes.mjs';
import { useJsonLd } from '../seo/useRouteHead';
import { useAppData, useTheme } from '../context/AppContext';
import { businessJsonLd } from '../seo/jsonLd.mjs';
import UserHome from './UserHome';
import AboutPage from './AboutPage';
import BookingFlow from './BookingFlow';
import MenuPage from './MenuPage';
import CartPage from './CartPage';
import MyBookings from './MyBookings';
import TherapyPage from './TherapyPage';
import ContactPage from './ContactPage';
import PrivacyPage from './PrivacyPage';
import NotFoundPage from './NotFoundPage';
import ArcoPage from './ArcoPage';
import './public.css';

// Las pantallas del flujo (reserva, carrito) siguen pidiendo "la pagina
// X" por nombre; aqui se traduce a su URL. Antes la navegacion publica
// vivia en un useState: ninguna pantalla tenia URL propia, el boton
// "atras" sacaba del sitio y la analitica no veia el embudo.
export const PAGE_PATHS = {
  home: '/',
  therapy: '/terapia',
  menu: '/cafeteria',
  book: '/reservar',
  cart: '/carrito',
  mybookings: '/mis-citas',
  about: '/nosotros',
  contact: '/contacto',
  privacy: '/privacidad',
};

const TABS = [
  { path: '/', label: 'Inicio', icon: Home, end: true },
  { path: '/terapia', label: 'Terapia', icon: Brain },
  { path: '/cafeteria', label: 'Cafetería', icon: Coffee },
  { path: '/contacto', label: 'Contacto', icon: MessageCircle },
];

export default function UserApp() {
  const { bookings, setBookings, orders, setOrders, catalogs, dataLoading } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [cart, setCart] = useState([]);
  const [linkedBookingId, setLinkedBookingId] = useState(null);
  // Las citas pedidas desde este navegador en esta visita: es lo unico
  // que "Mis citas" muestra (ver MyBookings.jsx).
  const [misCitas, setMisCitas] = useState([]);
  const registrarCita = useCallback((id) => {
    setLinkedBookingId(id);
    setMisCitas((prev) => [...prev, id]);
  }, []);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const mainRef = useRef(null);
  const business = businessFromSettings(catalogs?.settings);

  useJsonLd(businessJsonLd({
    settings: catalogs?.settings,
    defaults: BUSINESS_PLACEHOLDERS,
    services: catalogs?.services || [],
  }));

  // Al cambiar de pagina se vuelve arriba y el foco va al contenido: un
  // lector de pantalla anuncia la pagina nueva en vez de quedarse en el
  // enlace que se pulso.
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const setPage = useCallback((page) => navigate(PAGE_PATHS[page] || '/'), [navigate]);

  // `accion` ({ to, label }) agrega un enlace al aviso; con enlace dura
  // mas, para que de tiempo de leerlo y tocarlo.
  const showToast = useCallback((msg, type = 'success', accion = null) => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, type, accion });
    toastTimer.current = window.setTimeout(() => setToast(null), accion ? 7000 : 3500);
  }, []);

  // Agregar no saca a la persona del menu (puede querer algo mas), pero le
  // dice donde quedo y como pagar: antes solo cambiaba el numerito de la
  // bolsa y parecia que no habia pasado nada.
  const addToCart = (item, customizations = {}) => {
    setCart((prev) => [...prev, { ...item, qty: 1, customizations, cartId: uid() }]);
    showToast(`${item.name} se agregó a tu pedido.`, 'success', { to: '/carrito', label: 'Ver pedido y pagar' });
  };

  const comunes = { catalogs, setPage, showToast, dataLoading };
  const isDark = theme === 'dark';

  return (
    <div className="pub">
      <a className="pub-skip" href="#contenido">Saltar al contenido</a>

      <header className="pub-header">
        <div className="pub-wrap pub-header-row">
          <Link to="/" className="pub-brand" aria-label="Brainpsi Coffee, inicio">
            <BrandMark size={38} />
            <span>
              <span className="pub-brand-name">Brainpsi Coffee</span>
              <span className="pub-brand-sub">Psicología y café · Monterrey</span>
            </span>
          </Link>

          <nav className="pub-nav" aria-label="Principal">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.path} to={l.path} className="pub-nav-link">{l.label}</NavLink>
            ))}
          </nav>

          <div className="pub-header-actions">
            <NavLink to="/mis-citas" className="pub-icon-btn" aria-label="Mis citas" title="Mis citas">
              <CalendarCheck size={21} strokeWidth={1.7} />
            </NavLink>
            <NavLink to="/carrito" className="pub-icon-btn"
              aria-label={cart.length ? `Tu pedido, ${cart.length} ${cart.length === 1 ? 'producto' : 'productos'}` : 'Tu pedido'}
              title="Tu pedido">
              <ShoppingBag size={21} strokeWidth={1.7} />
              {cart.length > 0 && <span className="pub-badge" aria-hidden="true">{cart.length}</span>}
            </NavLink>
            <button type="button" className="pub-icon-btn" onClick={toggleTheme}
              aria-label={isDark ? 'Usar tema claro' : 'Usar tema oscuro'} title={isDark ? 'Tema claro' : 'Tema oscuro'}>
              {isDark ? <Sun size={20} strokeWidth={1.7} /> : <Moon size={20} strokeWidth={1.7} />}
            </button>
            <Link to="/reservar" className="pub-btn pub-btn-primary pub-btn-small pub-header-cta">Solicitar cita</Link>
          </div>
        </div>
      </header>

      <main id="contenido" ref={mainRef} tabIndex={-1} className="pub-main" style={{ outline: 'none' }}>
        <Routes>
          <Route index element={<UserHome {...comunes} theme={theme} />} />
          <Route path="terapia" element={<TherapyPage {...comunes} />} />
          <Route path="cafeteria" element={<MenuPage {...comunes} addToCart={addToCart} theme={theme} />} />
          <Route path="reservar" element={
            <BookingFlow {...comunes} bookings={bookings} setBookings={setBookings} addToCart={addToCart} setLinkedBookingId={registrarCita} />
          } />
          <Route path="carrito" element={
            <CartPage {...comunes} cart={cart} setCart={setCart} orders={orders} setOrders={setOrders} linkedBookingId={linkedBookingId} setLinkedBookingId={setLinkedBookingId} bookings={bookings} />
          } />
          <Route path="mis-citas" element={<MyBookings {...comunes} bookings={bookings} misCitas={misCitas} />} />
          <Route path="nosotros" element={<AboutPage {...comunes} />} />
          <Route path="contacto" element={<ContactPage settings={catalogs?.settings} />} />
          <Route path="privacidad" element={<PrivacyPage settings={catalogs?.settings} />} />
          <Route path="derechos-arco" element={<ArcoPage />} />
          {Object.entries(LEGACY_REDIRECTS).map(([vieja, nueva]) => (
            <Route key={vieja} path={vieja.slice(1)} element={<Navigate to={nueva} replace />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="pub-footer">
        <div className="pub-wrap">
          <div className="pub-footer-grid">
            <div>
              <h2>Brainpsi Coffee</h2>
              {tieneDato(business.address) && <p>{business.address}</p>}
              {tieneDato(business.city) && <p>{business.city}</p>}
              <ul aria-label="Horario">
                {business.hours.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </div>
            <div>
              <h2>El sitio</h2>
              <ul>
                <li><Link to="/terapia">Terapia y precios</Link></li>
                <li><Link to="/cafeteria">Cafetería</Link></li>
                <li><Link to="/reservar">Solicitar cita</Link></li>
                <li><Link to="/mis-citas">Mis citas</Link></li>
                <li><Link to="/privacidad">Aviso de privacidad</Link></li>
                <li><Link to="/derechos-arco">Derechos ARCO</Link></li>
              </ul>
            </div>
            <div>
              <h2>Escríbenos</h2>
              <ul>
                {hayWhatsapp(business) && <li><a href={whatsappUrl('Hola, quiero información de Brainpsi Coffee.', business)} target="_blank" rel="noreferrer">WhatsApp</a></li>}
                {tieneDato(business.email) && <li><a href={`mailto:${business.email}`}>{business.email}</a></li>}
                <li><Link to="/contacto">Cómo llegar</Link></li>
              </ul>
            </div>
          </div>
          {/* Este sitio no atiende crisis, y lo dice donde se ve en todas
              las paginas, no solo en la de terapia. */}
          <p className="pub-footer-crisis">
            Si tú o alguien cercano está en peligro, llama al <strong>911</strong>.
            {' '}Línea de la Vida, gratuita y 24 horas: <strong><a href="tel:8009112000">800 911 2000</a></strong>.
          </p>
        </div>
      </footer>

      <nav className="pub-tabbar" aria-label="Secciones">
        <ul>
          {TABS.map((t) => (
            <li key={t.path}>
              <NavLink to={t.path} end={t.end} className="pub-tab">
                <t.icon size={21} strokeWidth={1.7} aria-hidden="true" />
                <span>{t.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div aria-live="polite" role="status">
        {toast && (
          <div className={`pub-toast${toast.type === 'error' ? ' pub-toast-error' : ''}`}>
            <span>{toast.msg}</span>
            {toast.accion && (
              <Link to={toast.accion.to} className="pub-toast-action" onClick={() => setToast(null)}>{toast.accion.label}</Link>
            )}
            <button type="button" className="pub-toast-close" aria-label="Cerrar aviso" onClick={() => setToast(null)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
