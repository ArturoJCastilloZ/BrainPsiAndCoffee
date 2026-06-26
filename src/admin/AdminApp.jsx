import React, { useEffect, useMemo, useState } from 'react';
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
import BrandMark from '../components/BrandMark';
import AdminDashboard from './AdminDashboard';
import AdminAppointments from './AdminAppointments';
import AdminOrders from './AdminOrders';
import AdminCatalog from './AdminCatalog';
import {
    canAccessAdminPage,
    canManageAppointments,
    canManageBusinessSettings,
    canManageCafeCatalog,
    canManageClinicCatalog,
    canManageOrders,
    canViewDashboard,
    firstAllowedAdminPage
} from '../auth/permissions';

export default function AdminApp({ bookings, setBookings, orders, setOrders, switchToUser, logout, session, theme, toggleTheme, catalogs, catalogActions }) {
    const role = session?.user?.role;
    const [page, setPage] = useState(firstAllowedAdminPage(role) || 'cafe-orders');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const sidebarWidth = sidebarCollapsed ? 78 : 240;
    const isDark = theme === 'dark';
    const navSections = useMemo(() => ([
        {
            label: 'Administración general',
            items: [
                canViewDashboard(role) && { id: 'general-dashboard', label: 'Dashboard', icon: BarChart3 },
                canManageBusinessSettings(role) && { id: 'general-business', label: 'Negocio', icon: Settings },
            ].filter(Boolean)
        },
        {
            label: 'Cafetería',
            items: [
                canManageOrders(role) && { id: 'cafe-orders', label: 'Pedidos café', icon: Coffee },
                canManageCafeCatalog(role) && { id: 'cafe-products', label: 'Menú / productos', icon: Cake },
                canManageCafeCatalog(role) && { id: 'cafe-offers', label: 'Promociones', icon: Gift },
            ].filter(Boolean)
        },
        {
            label: 'Consultorio',
            items: [
                canManageAppointments(role) && { id: 'clinic-appointments', label: 'Citas', icon: CalendarIcon },
                canManageClinicCatalog(role) && { id: 'clinic-services', label: 'Servicios', icon: Brain },
                canManageClinicCatalog(role) && { id: 'clinic-therapists', label: 'Doctores', icon: Users },
                canManageClinicCatalog(role) && { id: 'clinic-specialties', label: 'Especialidades', icon: Sparkles },
            ].filter(Boolean)
        }
    ].filter((section) => section.items.length)), [role]);
    const navItems = useMemo(() => navSections.flatMap((section) => section.items), [navSections]);

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
            overflow: 'hidden',
            '--admin-bg': isDark ? '#0F1410' : '#F5EFE6',
            '--admin-sidebar': isDark ? '#0A0F09' : '#FFFDF8',
            '--admin-surface': isDark ? '#1A2118' : '#FFFFFF',
            '--admin-surface-soft': isDark ? '#10170F' : '#F8F1E7',
            '--admin-border': isDark ? '#2A332A' : '#E8D9C5',
            '--admin-border-soft': isDark ? '#1A2118' : '#EFE2D1',
            '--admin-text': isDark ? C.cream : C.brown,
            '--admin-muted': isDark ? '#7A8C77' : C.brownMid,
            '--admin-subtle': isDark ? '#5A6B57' : C.brownLight,
            '--admin-row-text': isDark ? '#9AAA97' : C.brownMid,
            '--admin-accent-text': isDark ? C.sageLight : C.sageDark,
            '--admin-on-accent': '#1E1B18'
        }}>
            <style>{`
        .admin-card { background: var(--admin-surface); border: 1px solid var(--admin-border); }
        .admin-input { background: var(--admin-surface); border: 1px solid var(--admin-border); color: var(--admin-text); }
        .admin-input::placeholder { color: var(--admin-subtle); }
      `}</style>

            <div style={{ display: 'flex', height: '100vh', minWidth: 0 }}>
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
                <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--admin-sidebar)', padding: '16px 20px', borderBottom: '1px solid var(--admin-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="md:hidden">
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

                {/* Main */}
                <main style={{ flex: 1, minWidth: 0, height: '100vh', overflow: 'auto', padding: '24px', paddingBottom: 100, boxSizing: 'border-box' }}>
                    <div style={{ minWidth: 900 }}>
                        {page === 'general-dashboard' && canViewDashboard(role) && <AdminDashboard bookings={bookings} orders={orders} setPage={setPage} catalogs={catalogs} />}
                        {page === 'general-business' && canManageBusinessSettings(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="business" lockedTab heading="Negocio" description="Administra información general del negocio, contacto, redes, mapa y horarios." />}
                        {page === 'cafe-orders' && canManageOrders(role) && <AdminOrders orders={orders} setOrders={setOrders} catalogs={catalogs} session={session} />}
                        {page === 'cafe-products' && canManageCafeCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="products" lockedTab heading="Menú / productos" description="Administra productos, precios y disponibilidad básica del menú." />}
                        {page === 'cafe-offers' && canManageCafeCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="offers" lockedTab heading="Promociones" description="Administra ofertas y vigencia de promociones de cafetería." />}
                        {page === 'clinic-appointments' && canManageAppointments(role) && <AdminAppointments bookings={bookings} setBookings={setBookings} catalogs={catalogs} />}
                        {page === 'clinic-services' && canManageClinicCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="services" lockedTab heading="Servicios" description="Administra servicios del consultorio, duración, precio y público objetivo." />}
                        {page === 'clinic-therapists' && canManageClinicCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="therapists" lockedTab heading="Doctores" description="Administra profesionales, cédulas, especialidades y servicios habilitados." />}
                        {page === 'clinic-specialties' && canManageClinicCatalog(role) && <AdminCatalog catalogs={catalogs} catalogActions={catalogActions} session={session} initialTab="specialties" lockedTab heading="Especialidades" description="Administra especialidades disponibles para clasificar al equipo clínico." />}
                    </div>
                </main>

                {/* Mobile bottom nav */}
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--admin-sidebar)', borderTop: '1px solid var(--admin-border-soft)',
                    padding: '10px 16px 20px', display: 'flex', justifyContent: 'flex-start', gap: 8, zIndex: 40,
                    overflowX: 'auto'
                }} className="md:hidden">
                    {navItems.map(t => (
                        <button key={t.id} onClick={() => setPage(t.id)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            color: page === t.id ? 'var(--admin-accent-text)' : 'var(--admin-subtle)', padding: '4px 8px',
                            fontFamily: 'inherit',
                            minWidth: 72
                        }}>
                            <t.icon size={18} /> <span style={{ fontSize: 10, fontWeight: 600 }}>{t.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <style>{`
        @media (min-width: 768px) {
          aside.md\\:flex { display: flex !important; }
          .md\\:hidden { display: none !important; }
        }
        @media (max-width: 767px) {
          main { height: calc(100vh - 65px) !important; }
        }
      `}</style>
        </div>
    );
}

// ============ ADMIN DASHBOARD ============
