import React, { useEffect, useMemo, useState } from 'react';
import {
    Coffee, Calendar as CalendarIcon, Brain, Heart, Clock, User, Phone, Mail,
    ChevronRight, ChevronLeft, Plus, Minus, Check, X,
    ShoppingBag, Settings, BarChart3, Users, Sparkles,
    Bell, Trash2, ArrowRight, ArrowLeft,
    CheckCircle2, AlertCircle, MessageCircle, Cake,
    Home, Menu as MenuIcon, LogOut, TrendingUp, DollarSign,
    Zap, Gift, Send, RefreshCw, Filter, KeyRound, Milk, Wallet
} from 'lucide-react';
import { C } from '../theme';
import BrandMark from '../components/BrandMark';
import AdminDashboard from './AdminDashboard';
import AdminAppointments from './AdminAppointments';
import AdminOrders from './AdminOrders';
import AdminCatalog from './AdminCatalog';
import AdminAccess from './AdminAccess';
import AdminAccounting from './AdminAccounting';
import AdminSchedules from './AdminSchedules';
import { useAccountingData } from './useAccountingData';
import {
    canAccessAdminPage,
    canManageAppointments,
    canManageAccess,
    canViewAccounting,
    canManageSchedules,
    canManageBusinessSettings,
    canManageCafeCatalog,
    canManageClinicCatalog,
    canManageOrders,
    canViewDashboard,
    firstAllowedAdminPage,
    canRecordPayment
} from '../auth/permissions';

export default function AdminApp({ bookings, setBookings, orders, setOrders, switchToUser, logout, session, theme, toggleTheme, catalogs, catalogActions }) {
    const role = session?.user?.role;
    const [page, setPage] = useState(firstAllowedAdminPage(role) || 'cafe-orders');
    // Los cobros viven aqui y no en cada pantalla: citas, pedidos y el
    // panel tienen que ver el MISMO saldo. Ver useAccountingData.
    const contabilidad = useAccountingData(role);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const sidebarWidth = sidebarCollapsed ? 78 : 240;
    const navSections = useMemo(() => ([
        {
            contexto: 'general', corto: 'General',
            label: 'Administración general',
            items: [
                canViewDashboard(role) && { id: 'general-dashboard', label: 'Dashboard', icon: BarChart3 },
                canManageBusinessSettings(role) && { id: 'general-business', label: 'Negocio', icon: Settings },
                canViewAccounting(role) && { id: 'general-accounting', label: 'Contabilidad', icon: Wallet },
                canManageAccess(role) && { id: 'general-access', label: 'Accesos', icon: KeyRound },
            ].filter(Boolean)
        },
        {
            contexto: 'cafe', corto: 'Cafetería',
            label: 'Cafetería',
            items: [
                canManageOrders(role) && { id: 'cafe-orders', label: 'Pedidos café', icon: Coffee },
                canManageCafeCatalog(role) && { id: 'cafe-products', label: 'Menú / productos', icon: Cake },
                canManageCafeCatalog(role) && { id: 'cafe-options', label: 'Personalización', icon: Milk },
                canManageCafeCatalog(role) && { id: 'cafe-offers', label: 'Promociones', icon: Gift },
            ].filter(Boolean)
        },
        {
            contexto: 'clinic', corto: 'Consultorio',
            label: 'Consultorio',
            items: [
                canManageAppointments(role) && { id: 'clinic-appointments', label: 'Citas', icon: CalendarIcon },
                canManageClinicCatalog(role) && { id: 'clinic-services', label: 'Servicios', icon: Brain },
                canManageClinicCatalog(role) && { id: 'clinic-therapists', label: 'Doctores', icon: Users },
                canManageClinicCatalog(role) && { id: 'clinic-specialties', label: 'Especialidades', icon: Sparkles },
                canManageSchedules(role) && { id: 'clinic-schedules', label: 'Horarios', icon: Clock },
            ].filter(Boolean)
        }
    ].filter((section) => section.items.length)), [role]);
    const navItems = useMemo(() => navSections.flatMap((section) => section.items), [navSections]);

    // M3 · Los dos ejes de la navegacion son distintos y estaban mezclados:
    // CONTEXTO (en que negocio estoy) y SECCION (que pantalla veo). La barra
    // inferior los aplanaba en una sola lista de 13 destinos que, a 72px con
    // gap 8, median 1064px dentro de una barra de 375: habia que DESPLAZAR la
    // navegacion para encontrar un destino.
    //
    // El contexto NO es estado nuevo: los ids de pagina ya lo codifican
    // ('general-', 'cafe-', 'clinic-'). Derivarlo no puede desincronizarse;
    // un useState paralelo si.
    const contextoActivo = useMemo(() => {
        const prefijo = String(page).split('-')[0];
        return navSections.some((s) => s.contexto === prefijo) ? prefijo : navSections[0]?.contexto;
    }, [navSections, page]);
    const seccionActiva = useMemo(
        () => navSections.find((s) => s.contexto === contextoActivo) || navSections[0],
        [contextoActivo, navSections],
    );

    useEffect(() => {
        if (!canAccessAdminPage(role, page)) {
            setPage(firstAllowedAdminPage(role) || 'cafe-orders');
        }
    }, [page, role]);

    return (
        <div style={{
            background: 'var(--admin-bg)',
            height: '100vh',
            color: 'var(--admin-text)',
            overflow: 'hidden'
            // Los tokens --admin-* y las clases .admin-card/.admin-input viven
            // en la hoja global de App.jsx. Estaban aqui Y en DoctorApp.jsx,
            // identicos byte a byte, asi que cada arreglo habia que hacerlo dos
            // veces. Ver "TOKENS DEL ADMIN" en App.jsx.
        }}>
            <div className="admin-shell">
                {/* Sidebar */}
                <aside style={{
                    width: sidebarWidth, background: 'var(--admin-sidebar)', borderRight: '1px solid var(--admin-border-soft)',
                    padding: '24px 16px', display: 'none', flexDirection: 'column',
                    height: '100vh', boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0,
                    transition: 'width 0.2s ease'
                }} className="md:flex">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: sidebarCollapsed ? 0 : '0 8px', flexShrink: 0, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
                        <BrandMark size={32} />
                        {!sidebarCollapsed && <div>
                            <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', lineHeight: 1 }}>Brainpsi</div>
                            <div style={{ fontSize: 10, color: 'var(--admin-accent-text)', letterSpacing: 1, fontWeight: 600 }}>ADMIN</div>
                        </div>}
                    </div>

                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                        gap: 10, background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', color: 'var(--admin-accent-text)',
                        padding: sidebarCollapsed ? '10px' : '9px 12px', borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, marginBottom: 16
                    }}>
                        {!sidebarCollapsed && <span>Menú</span>}
                        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>

                    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
                        {navSections.map(section => (
                            <div key={section.label} style={{ display: 'grid', gap: 4, marginBottom: sidebarCollapsed ? 4 : 12 }}>
                                {!sidebarCollapsed && (
                                    <div style={{ color: 'var(--admin-subtle)', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: '8px 12px 3px' }}>
                                        {section.label}
                                    </div>
                                )}
                                {section.items.map(t => (
                                    <button key={t.id} onClick={() => setPage(t.id)} title={t.label} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                                        background: page === t.id ? 'var(--admin-surface)' : 'transparent',
                                        border: page === t.id ? `1px solid ${C.sageDark}` : '1px solid transparent',
                                        padding: sidebarCollapsed ? '12px' : '12px 14px', borderRadius: 10,
                                        cursor: 'pointer', color: page === t.id ? 'var(--admin-text)' : 'var(--admin-muted)',
                                        fontSize: 13, fontWeight: page === t.id ? 700 : 500, textAlign: 'left', width: '100%',
                                        fontFamily: 'inherit', boxShadow: page === t.id ? `inset 3px 0 0 ${C.caramel}` : 'none'
                                    }}>
                                        <t.icon size={16} strokeWidth={page === t.id ? 2 : 1.6} /> {!sidebarCollapsed && t.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </nav>

                    <div style={{ flexShrink: 0, paddingTop: 14, marginTop: 14, borderTop: '1px solid var(--admin-border-soft)', display: 'grid', gap: 10 }}>
                        <button onClick={switchToUser} title="Volver a app" style={{
                            display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 10,
                            background: 'transparent', border: '1px solid var(--admin-border)', padding: '10px 14px', borderRadius: 10,
                            cursor: 'pointer', color: 'var(--admin-accent-text)', fontSize: 12, fontWeight: 500, fontFamily: 'inherit'
                        }}>
                            <LogOut size={14} /> {!sidebarCollapsed && 'Volver a app'}
                        </button>
                        <button onClick={toggleTheme} title={`Modo ${theme === 'dark' ? 'claro' : 'oscuro'}`} style={{
                            display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 10,
                            background: 'transparent', border: '1px solid var(--admin-border)', padding: '10px 14px', borderRadius: 10,
                            cursor: 'pointer', color: 'var(--admin-accent-text)', fontSize: 12, fontWeight: 500, fontFamily: 'inherit'
                        }}>
                            <Settings size={14} /> {!sidebarCollapsed && <>Modo {theme === 'dark' ? 'claro' : 'oscuro'}</>}
                        </button>
                        <button onClick={logout} title="Cerrar sesión" style={{
                            display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 10,
                            background: 'transparent', border: '1px solid var(--admin-border)', padding: '10px 14px', borderRadius: 10,
                            cursor: 'pointer', color: C.rust, fontSize: 12, fontWeight: 500, fontFamily: 'inherit'
                        }}>
                            <X size={14} /> {!sidebarCollapsed && 'Cerrar sesión'}
                        </button>
                    </div>
                </aside>

                {/* Mobile top nav */}
                <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--admin-sidebar)', padding: '16px 20px 12px', borderBottom: '1px solid var(--admin-border-soft)', display: 'grid', gap: 12 }} className="md:hidden">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BrandMark size={32} />
                        <div>
                            <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', lineHeight: 1 }}>Admin</div>
                            <div style={{ fontSize: 10, color: 'var(--admin-accent-text)', letterSpacing: 1, fontWeight: 600 }}>BRAINPSI</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={toggleTheme} style={{ background: 'transparent', border: '1px solid var(--admin-border)', padding: '6px 12px', borderRadius: 999, color: 'var(--admin-accent-text)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{theme === 'dark' ? 'Claro' : 'Oscuro'}</button>
                        <button onClick={switchToUser} style={{ background: 'transparent', border: '1px solid var(--admin-border)', padding: '6px 12px', borderRadius: 999, color: 'var(--admin-accent-text)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>App</button>
                    </div>
                  </div>

                  {/* Eje de CONTEXTO. Una sola pieza que dice en que negocio
                      estas, en vez de tres destinos sueltos que se ven igual
                      que los demas. Con un solo contexto no se pinta: un
                      selector de una opcion no selecciona nada. */}
                  {navSections.length > 1 && (
                    <nav aria-label="Area del negocio" className="admin-contexto">
                      {navSections.map((seccion) => {
                        const activa = seccion.contexto === contextoActivo;
                        return (
                          <button
                            key={seccion.contexto}
                            onClick={() => setPage(seccion.items[0].id)}
                            aria-current={activa ? 'true' : undefined}
                            className={activa ? 'es-activa' : undefined}
                          >
                            {seccion.corto}
                          </button>
                        );
                      })}
                    </nav>
                  )}
                </div>

                {/* Main */}
                <main className="admin-main">
                    {/* Aqui vivia minWidth:900. Envolvia las 13 pantallas y
                        forzaba 573px de scroll horizontal a 375 (padding 48 +
                        900 - 375). Peor que el scroll: con el contenedor
                        clavado en 900, NINGUNA de las 11 rejillas auto-fit del
                        admin podia plegarse, porque auto-fit resuelve contra
                        el ancho disponible y ese ancho nunca bajaba. Estaban
                        escritas para ser fluidas y no servian de nada. */}
                    <div>
                        {page === 'general-dashboard' && canViewDashboard(role) && <AdminDashboard bookings={bookings} orders={orders} setPage={setPage} catalogs={catalogs} />}
                        {page === 'general-accounting' && canViewAccounting(role) && <AdminAccounting bookings={bookings} orders={orders} catalogs={catalogs} session={session} contabilidad={contabilidad} />}
                        {page === 'general-access' && canManageAccess(role) && <AdminAccess />}
                        {page === 'general-business' && canManageBusinessSettings(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="business" lockedTab heading="Negocio" description="Administra información general del negocio, contacto, redes, mapa y horarios." />}
                        {page === 'cafe-orders' && canManageOrders(role) && <AdminOrders orders={orders} setOrders={setOrders} catalogs={catalogs} session={session} payments={contabilidad.datos.payments} canRecordPayments={canRecordPayment(role, 'pedido')} onRegistrarCobro={contabilidad.registrarCobro} />}
                        {page === 'cafe-products' && canManageCafeCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="products" lockedTab heading="Menú / productos" description="Administra productos, precios y disponibilidad básica del menú." />}
                        {page === 'cafe-options' && canManageCafeCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="options" lockedTab heading="Personalización" description="Tipos de leche, sabores y extras que el cliente puede elegir al pedir un café, con lo que suma cada uno al precio." />}
                        {page === 'cafe-offers' && canManageCafeCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="offers" lockedTab heading="Promociones" description="Administra ofertas y vigencia de promociones de cafetería." />}
                        {page === 'clinic-schedules' && canManageSchedules(role) && <AdminSchedules catalogs={catalogs} reload={catalogActions?.reload} />}
                        {page === 'clinic-appointments' && canManageAppointments(role) && <AdminAppointments bookings={bookings} setBookings={setBookings} catalogs={catalogs} payments={contabilidad.datos.payments} canRecordPayments={canRecordPayment(role, 'cita')} onRegistrarCobro={contabilidad.registrarCobro} />}
                        {page === 'clinic-services' && canManageClinicCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="services" lockedTab heading="Servicios" description="Administra servicios del consultorio, duración, precio y público objetivo." />}
                        {page === 'clinic-therapists' && canManageClinicCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="therapists" lockedTab heading="Doctores" description="Administra profesionales, cédulas, especialidades y servicios habilitados." />}
                        {page === 'clinic-specialties' && canManageClinicCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="specialties" lockedTab heading="Especialidades" description="Administra especialidades disponibles para clasificar al equipo clínico." />}
                    </div>
                </main>

                {/* Mobile bottom nav */}
                <nav aria-label={`Secciones de ${seccionActiva?.label || 'la administracion'}`}
                     className="admin-barra-inferior md:hidden">
                    {(seccionActiva?.items || []).map(t => (
                        <button key={t.id} onClick={() => setPage(t.id)}
                                aria-current={page === t.id ? 'page' : undefined}
                                className={page === t.id ? 'es-activo' : undefined}>
                            <t.icon size={18} aria-hidden="true" />
                            <span>{t.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <style>{`
        @media (min-width: 768px) {
          aside.md\\:flex { display: flex !important; }
          .md\\:hidden { display: none !important; }
        }
      `}</style>
        </div>
    );
}

// ============ ADMIN DASHBOARD ============
