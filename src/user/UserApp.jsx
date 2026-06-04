import React, { useState } from 'react';
import {
  Coffee, Calendar as CalendarIcon, Brain, Heart, Clock, User, Phone, Mail,
  ChevronRight, ChevronLeft, Plus, Minus, Check, X,
  ShoppingBag, Settings, BarChart3, Users, Sparkles,
  Bell, Trash2, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, MessageCircle, Cake,
  Home, Menu as MenuIcon, LogOut, TrendingUp, DollarSign,
  Zap, Gift, Send, RefreshCw, Filter
} from 'lucide-react';
import { C } from '../theme';
import { uid } from '../utils.jsx';
import BrandMark from '../components/BrandMark';
import UserHome from './UserHome';
import AboutPage from './AboutPage';
import BookingFlow from './BookingFlow';
import MenuPage from './MenuPage';
import CartPage from './CartPage';
import MyBookings from './MyBookings';

export default function UserApp({ bookings, setBookings, orders, setOrders, theme, toggleTheme, catalogs }) {
  const [page, setPage] = useState('home');
  const [cart, setCart] = useState([]);
  const [linkedBookingId, setLinkedBookingId] = useState(null);
  const [toast, setToast] = useState(null);
  const onLightAccent = '#1E1B18';

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const addToCart = (item, customizations = {}) => {
    setCart([...cart, { ...item, qty: 1, customizations, cartId: uid() }]);
    showToast(`${item.name} agregado al carrito`);
  };

  const removeFromCart = (cartId) => setCart(cart.filter(i => i.cartId !== cartId));

  return (
    <div style={{ paddingBottom: 96 }}>
      {/* Top Bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: theme === 'dark' ? 'rgba(16, 19, 15, 0.9)' : 'rgba(254, 252, 246, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.sagePale}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setPage('home')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
            <BrandMark size={36} />
            <div style={{ textAlign: 'left' }}>
              <div className="font-display" style={{ fontSize: 18, fontWeight: 700, color: theme === 'dark' ? C.cream : C.brown, lineHeight: 1 }}>Brainpsi</div>
              <div className="font-display" style={{ fontSize: 12, color: theme === 'dark' ? C.sageLight : C.brownMid, lineHeight: 1.4, fontStyle: 'italic' }}>Coffee</div>
            </div>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setPage('cart')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
              <ShoppingBag size={22} color={C.brown} strokeWidth={1.6} />
              {cart.length > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, background: C.rust, color: 'white', borderRadius: 999, fontSize: 10, fontWeight: 700, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cart.length}</span>
              )}
            </button>
            <button onClick={toggleTheme} title="Tema" style={{ background: 'none', border: `1px solid ${C.sagePale}`, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, color: theme === 'dark' ? C.sageLight : C.brownMid }}>
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
          </div>
        </div>
      </header>

      {/* Pages */}
      <div className="animate-fade-in" key={page}>
        {page === 'home' && <UserHome setPage={setPage} bookings={bookings} catalogs={catalogs} theme={theme} />}
        {page === 'about' && <AboutPage />}
        {page === 'book' && <BookingFlow setPage={setPage} bookings={bookings} setBookings={setBookings} addToCart={addToCart} setLinkedBookingId={setLinkedBookingId} showToast={showToast} catalogs={catalogs} />}
        {page === 'menu' && <MenuPage addToCart={addToCart} catalogs={catalogs} theme={theme} />}
        {page === 'cart' && <CartPage cart={cart} setCart={setCart} orders={orders} setOrders={setOrders} setPage={setPage} linkedBookingId={linkedBookingId} setLinkedBookingId={setLinkedBookingId} bookings={bookings} showToast={showToast} catalogs={catalogs} />}
        {page === 'mybookings' && <MyBookings bookings={bookings} setBookings={setBookings} setPage={setPage} showToast={showToast} catalogs={catalogs} />}
      </div>

      {/* Bottom Nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: theme === 'dark' ? 'rgba(16, 19, 15, 0.96)' : 'rgba(254, 252, 246, 0.95)', backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${C.sagePale}`,
        padding: '8px 16px 12px'
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', justifyContent: 'space-around' }}>
          {[
            { id: 'home', icon: Home, label: 'Inicio' },
            { id: 'book', icon: CalendarIcon, label: 'Reservar' },
            { id: 'menu', icon: Coffee, label: 'Cafetería' },
            { id: 'mybookings', icon: User, label: 'Mis citas' },
          ].map(t => (
            <button key={t.id} onClick={() => setPage(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '5px 12px',
              color: page === t.id ? C.sageDark : C.brownLight,
              transition: 'color 0.2s'
            }}>
              <t.icon size={19} strokeWidth={page === t.id ? 2 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: page === t.id ? 600 : 500 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Toast */}
      {toast && (
        <div className="animate-slide-in" style={{
          position: 'fixed', top: 80, right: 20, zIndex: 100,
          background: toast.type === 'success' ? C.sageDark : C.rust,
          color: toast.type === 'success' ? onLightAccent : 'white', padding: '12px 18px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          maxWidth: 'calc(100vw - 40px)'
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span style={{ fontSize: 14, fontWeight: 500 }}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ============ BRAND MARK ============
