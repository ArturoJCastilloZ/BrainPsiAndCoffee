import React, { useEffect, useMemo, useState } from 'react';
import { Brain, Building2, Coffee, Gift, Heart, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import { C } from '../theme';
import { uid } from '../utils.jsx';
import { SPECIALTIES } from '../data';
import { isValidEmail, isValidMoney, isValidPositiveInteger } from '../validation';
import { canManageBusinessSettings, canManageCafeCatalog, canManageClinicCatalog } from '../auth/permissions';

const PRODUCT_TABS = [
  { id: 'hot', label: 'Calientes' },
  { id: 'cold', label: 'Frías' },
  { id: 'drinks', label: 'Bebidas' },
  { id: 'desserts', label: 'Postres' },
];

const emptyService = { name: '', desc: '', duration: 50, price: 600, icon: 'heart', for: 'Adultos', active: true };
const emptyTherapist = { name: '', email: '', cedula: '', specialty: '', sessionDuration: 50, services: [], color: C.sageDark, active: true };
const emptySpecialty = { name: '', active: true };
const emptyProduct = { name: '', sub: '', price: 45, active: true };
const emptyOffer = { name: '', desc: '', price: 99, active: true };
const THERAPIST_COLORS = [
  { label: 'Verde', value: C.sageDark },
  { label: 'Caramelo', value: C.caramel },
  { label: 'Terracota', value: C.rust },
  { label: 'Cafe', value: C.brownMid },
  { label: 'Verde claro', value: C.sageLight },
];
const selectedPill = {
  background: '#E8D9C5',
  color: '#1E1B18',
  border: '#E8D9C5',
};
const SERVICE_ICONS = [
  { id: 'heart', label: 'Corazon', icon: Heart },
  { id: 'brain', label: 'Cerebro', icon: Brain },
  { id: 'sparkles', label: 'Destellos', icon: Sparkles },
];

export default function AdminCatalog({ catalogs, catalogActions, session, initialTab, lockedTab = false, heading = 'Catálogos', description = 'Administra productos, servicios, ofertas, doctores y precios.' }) {
  const role = session?.user?.role;
  const tabs = useMemo(() => [
    canManageCafeCatalog(role) && { id: 'products', label: 'Productos', icon: Coffee },
    canManageClinicCatalog(role) && { id: 'services', label: 'Servicios', icon: Brain },
    canManageClinicCatalog(role) && { id: 'therapists', label: 'Doctores', icon: Users },
    canManageClinicCatalog(role) && { id: 'specialties', label: 'Especialidades', icon: Sparkles },
    canManageCafeCatalog(role) && { id: 'offers', label: 'Ofertas', icon: Gift },
    canManageBusinessSettings(role) && { id: 'business', label: 'Negocio', icon: Building2 },
  ].filter(Boolean), [role]);
  const [tab, setTab] = useState(initialTab || tabs[0]?.id || 'products');

  useEffect(() => {
    const nextTab = initialTab || tabs[0]?.id || '';
    if (!tabs.some((item) => item.id === tab)) setTab(nextTab);
    else if (initialTab && tab !== initialTab) setTab(initialTab);
  }, [initialTab, tab, tabs]);

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{heading}</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 20 }}>{description}</p>

      {!lockedTab && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {tabs.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, border: '1px solid ' + (tab === item.id ? C.sageDark : 'var(--admin-border)'),
            background: tab === item.id ? selectedPill.background : 'var(--admin-surface)', color: tab === item.id ? selectedPill.color : 'var(--admin-row-text)',
            padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700
          }}>
            <item.icon size={14} /> {item.label}
          </button>
        ))}
      </div>}

      {tab === 'products' && <ProductsManager menu={catalogs.menu} setMenu={catalogActions.setMenu} />}
      {tab === 'services' && <ListManager title="Servicios" items={catalogs.services} setItems={catalogActions.setServices} emptyItem={emptyService} renderForm={ServiceForm} summary={(item) => `${item.duration} min · $${item.price} · ${item.for}`} />}
      {tab === 'therapists' && <ListManager title="Doctores" items={catalogs.therapists} setItems={catalogActions.setTherapists} emptyItem={emptyTherapist} renderForm={(props) => <TherapistForm {...props} services={catalogs.services} specialties={catalogs.specialties || SPECIALTIES} />} summary={(item) => `${item.specialty || 'Sin especialidad'} · ${item.sessionDuration || 50} min · ${item.email || 'sin correo'} · Céd. ${item.cedula || 'pendiente'}`} />}
      {tab === 'specialties' && <ListManager title="Especialidades" items={catalogs.specialties || SPECIALTIES} setItems={catalogActions.setSpecialties} emptyItem={emptySpecialty} renderForm={SpecialtyForm} summary={(item) => item.active === false ? 'Inactiva' : 'Activa'} />}
      {tab === 'offers' && <ListManager title="Ofertas" items={catalogs.offers} setItems={catalogActions.setOffers} emptyItem={emptyOffer} renderForm={OfferForm} summary={(item) => `$${item.price} · ${item.desc}${offerWindowLabel(item)}`} />}
      {tab === 'business' && <BusinessSettings settings={catalogs.settings} setSettings={catalogActions.setSettings} />}
    </div>
  );
}

function ProductsManager({ menu, setMenu }) {
  const [category, setCategory] = useState('hot');

  const setItems = (items) => setMenu({ ...menu, [category]: { ...menu[category], items } });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {PRODUCT_TABS.map(item => (
          <button key={item.id} onClick={() => setCategory(item.id)} style={{
            border: '1px solid ' + (category === item.id ? C.caramel : 'var(--admin-border)'),
            background: category === item.id ? C.caramel : 'var(--admin-surface-soft)',
            color: category === item.id ? selectedPill.color : 'var(--admin-row-text)',
            padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit'
          }}>{item.label}</button>
        ))}
      </div>
      <ListManager
        title={`Productos · ${menu[category]?.title || category}`}
        items={menu[category]?.items || []}
        setItems={setItems}
        emptyItem={emptyProduct}
        renderForm={ProductForm}
        summary={(item) => `${item.sub || 'Sin descripción'} · $${item.price}`}
      />
    </div>
  );
}

function ListManager({ title, items, setItems, emptyItem, renderForm: Form, summary }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyItem);

  const startNew = () => {
    setEditing('new');
    setDraft({ ...emptyItem, id: uid() });
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setDraft({ active: true, ...item });
  };

  const save = () => {
    if (!isDraftValid(draft)) return;
    const clean = { ...draft, price: Number(draft.price || 0), duration: draft.duration ? Number(draft.duration) : draft.duration, sessionDuration: draft.sessionDuration ? Number(draft.sessionDuration) : draft.sessionDuration };
    if (editing === 'new') setItems([...items, clean]);
    else setItems(items.map(item => item.id === clean.id ? clean : item));
    setEditing(null);
  };

  const remove = (id) => {
    const item = items.find(row => row.id === id);
    if (!window.confirm(`¿Eliminar "${item?.name || 'este registro'}"? Esta accion no se puede deshacer.`)) return;
    setItems(items.filter(item => item.id !== id));
  };
  const toggleActive = (item) => setItems(items.map(row => row.id === item.id ? { ...row, active: row.active === false } : row));
  const canSave = isDraftValid(draft);

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, color: 'var(--admin-text)', fontSize: 15 }}>{title}</h2>
        <button onClick={startNew} style={{ background: selectedPill.background, color: selectedPill.color, border: 'none', borderRadius: 999, padding: '8px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {editing && (
        <div style={{ background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <Form draft={draft} setDraft={setDraft} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditing(null)} style={adminButton('ghost')}><X size={14} /> Cancelar</button>
            <button onClick={save} disabled={!canSave} style={{ ...adminButton('primary'), opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}>Guardar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.length === 0 ? (
          <p style={{ color: 'var(--admin-muted)', fontSize: 13, margin: 0 }}>No hay registros todavía.</p>
        ) : items.map(item => (
          <div key={item.id} style={{ background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, opacity: item.active === false ? 0.5 : 1 }}>
              <div style={{ color: 'var(--admin-text)', fontSize: 14, fontWeight: 700 }}>{item.name}</div>
              <div style={{ color: 'var(--admin-muted)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary(item)}</div>
            </div>
            <button onClick={() => toggleActive(item)} style={adminButton(item.active === false ? 'primary' : 'ghost')}>{item.active === false ? 'Activar' : 'Inactivar'}</button>
            <button onClick={() => startEdit(item)} style={adminButton('ghost')}>Editar</button>
            <button onClick={() => remove(item.id)} style={{ ...adminButton('ghost'), color: C.rust }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, required = false, min, className = '' }) {
  const missing = required && String(value || '').trim().length === 0;
  return (
    <label className={className} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} required={required} min={min} className="admin-input" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit', borderColor: missing ? C.rust : undefined }} />
      {missing && <span style={requiredHint}>Campo requerido</span>}
    </label>
  );
}

function ProductForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="NOMBRE" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
    <Field label="DESCRIPCIÓN" value={draft.sub} onChange={sub => setDraft({ ...draft, sub })} />
    <Field label="PRECIO" type="number" value={draft.price} onChange={price => setDraft({ ...draft, price })} required min={0} />
  </FormGrid>;
}

function ServiceForm({ draft, setDraft }) {
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 2fr) minmax(160px, 1fr) minmax(120px, 0.8fr) minmax(120px, 0.8fr)', gap: '14px 12px', alignItems: 'end' }}>
      <Field label="SERVICIO" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
      <Field label="DIRIGIDO A" value={draft.for} onChange={value => setDraft({ ...draft, for: value })} required />
      <Field label="DURACIÓN" type="number" value={draft.duration} onChange={duration => setDraft({ ...draft, duration })} required min={1} />
      <Field label="PRECIO" type="number" value={draft.price} onChange={price => setDraft({ ...draft, price })} required min={0} />
      <label style={{ display: 'grid', gap: 6, gridColumn: 'span 2' }}>
        <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>DESCRIPCIÓN</span>
        <input value={draft.desc || ''} onChange={e => setDraft({ ...draft, desc: e.target.value })} className="admin-input" style={{ padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
      </label>
      <div style={{ display: 'grid', gap: 8, gridColumn: 'span 2' }}>
        <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>ICONO</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SERVICE_ICONS.map(item => {
            const Icon = item.icon;
            const selected = (draft.icon || 'heart') === item.id;
            return (
              <button key={item.id} type="button" onClick={() => setDraft({ ...draft, icon: item.id })} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              border: `1px solid ${selected ? selectedPill.border : 'var(--admin-border)'}`,
              background: selected ? selectedPill.background : 'var(--admin-surface)',
              color: selected ? selectedPill.color : 'var(--admin-row-text)',
                borderRadius: 999,
                padding: '8px 11px',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'inherit'
              }}>
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </>;
}

function SelectField({ label, value, onChange, children, required = false, className = '' }) {
  const missing = required && String(value || '').trim().length === 0;
  return (
    <label className={className} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      <select value={value || ''} onChange={e => onChange(e.target.value)} required={required} className="admin-input" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit', borderColor: missing ? C.rust : undefined }}>
        {children}
      </select>
      {missing && <span style={requiredHint}>Campo requerido</span>}
    </label>
  );
}

function TherapistForm({ draft, setDraft, services, specialties }) {
  const activeSpecialties = (specialties || SPECIALTIES).filter(item => item.active !== false);

  return <>
    <style>{`
      .therapist-form-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 14px 12px;
        align-items: start;
      }
      .therapist-form-name,
      .therapist-form-email,
      .therapist-form-cedula,
      .therapist-form-duration {
        grid-column: span 2;
      }
      .therapist-form-specialty {
        grid-column: span 4;
      }
      @media (max-width: 900px) {
        .therapist-form-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .therapist-form-grid > * {
          grid-column: span 1;
        }
      }
      @media (max-width: 620px) {
        .therapist-form-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `}</style>
    <div className="therapist-form-grid">
      <Field className="therapist-form-name" label="NOMBRE" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
      <Field className="therapist-form-email" label="CORREO DE ACCESO" type="email" value={draft.email} onChange={email => setDraft({ ...draft, email })} required />
      <Field className="therapist-form-cedula" label="CÉDULA" value={draft.cedula} onChange={cedula => setDraft({ ...draft, cedula })} required />
      <SelectField className="therapist-form-specialty" label="ESPECIALIDAD" value={draft.specialty || ''} onChange={specialty => setDraft({ ...draft, specialty })} required>
        <option value="">Selecciona especialidad</option>
        {activeSpecialties.map(specialty => <option key={specialty.id} value={specialty.name}>{specialty.name}</option>)}
      </SelectField>
      <Field className="therapist-form-duration" label="DURACIÓN SESIÓN (MIN)" type="number" value={draft.sessionDuration || 50} onChange={sessionDuration => setDraft({ ...draft, sessionDuration })} required min={1} />
    </div>
    <div style={{ marginTop: 12 }}>
      <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>COLOR</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {THERAPIST_COLORS.map(color => {
          const selected = (draft.color || C.sageDark) === color.value;
          return (
            <button key={color.value} type="button" onClick={() => setDraft({ ...draft, color: color.value })} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: `1px solid ${selected ? selectedPill.border : 'var(--admin-border)'}`,
              background: selected ? selectedPill.background : 'var(--admin-surface-soft)',
              color: selected ? selectedPill.color : 'var(--admin-row-text)',
              borderRadius: 999,
              padding: '7px 10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 700
            }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: color.value, border: '1px solid var(--admin-border)', display: 'inline-block' }} />
              {color.label}
            </button>
          );
        })}
      </div>
    </div>
    <div style={{ marginTop: 12 }}>
      <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>SERVICIOS HABILITADOS</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {services.map(service => {
          const checked = draft.services?.includes(service.id);
          return (
            <button key={service.id} onClick={() => setDraft({ ...draft, services: checked ? draft.services.filter(id => id !== service.id) : [...(draft.services || []), service.id] })} style={{
              border: `1px solid ${checked ? selectedPill.border : 'var(--admin-border)'}`,
              background: checked ? selectedPill.background : 'var(--admin-surface)',
              color: checked ? selectedPill.color : 'var(--admin-row-text)',
              borderRadius: 999,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit'
            }}>{service.name}</button>
          );
        })}
      </div>
      {!(draft.services || []).length && <span style={{ ...requiredHint, display: 'block', marginTop: 6 }}>Campo requerido</span>}
    </div>
  </>;
}

function SpecialtyForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="ESPECIALIDAD" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
  </FormGrid>;
}

function OfferForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="OFERTA" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
    <Field label="PRECIO" type="number" value={draft.price} onChange={price => setDraft({ ...draft, price })} required min={0} />
    <Field label="INICIA" type="date" value={draft.startsAt || ''} onChange={startsAt => setDraft({ ...draft, startsAt })} />
    <Field label="TERMINA" type="date" value={draft.endsAt || ''} onChange={endsAt => setDraft({ ...draft, endsAt })} />
    <Field label="DESCRIPCIÓN" value={draft.desc} onChange={desc => setDraft({ ...draft, desc })} />
  </FormGrid>;
}

function BusinessSettings({ settings, setSettings }) {
  const [draft, setDraft] = useState({
    ...settings,
    hoursText: (settings?.hours || []).join('\n'),
  });
  const [saved, setSaved] = useState(false);
  const update = (key, value) => {
    setSaved(false);
    setDraft({ ...draft, [key]: value });
  };
  const save = () => {
    const next = {
      name: draft.name || '',
      legalName: draft.legalName || '',
      city: draft.city || '',
      address: draft.address || '',
      phone: draft.phone || '',
      whatsapp: draft.whatsapp || '',
      email: draft.email || '',
      instagram: draft.instagram || '',
      mapsUrl: draft.mapsUrl || '',
      hours: String(draft.hoursText || '').split('\n').map((line) => line.trim()).filter(Boolean),
    };
    setSettings(next);
    setSaved(true);
  };

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
      <h2 style={{ margin: '0 0 14px', color: 'var(--admin-text)', fontSize: 15 }}>Informacion del negocio</h2>
      <FormGrid>
        <Field label="NOMBRE COMERCIAL" value={draft.name} onChange={value => update('name', value)} required />
        <Field label="RAZON/NOMBRE LEGAL" value={draft.legalName} onChange={value => update('legalName', value)} required />
        <Field label="CIUDAD" value={draft.city} onChange={value => update('city', value)} />
        <Field label="DIRECCION" value={draft.address} onChange={value => update('address', value)} />
        <Field label="TELEFONO" value={draft.phone} onChange={value => update('phone', value)} />
        <Field label="WHATSAPP CON PAIS" value={draft.whatsapp} onChange={value => update('whatsapp', value)} />
        <Field label="CORREO" type="email" value={draft.email} onChange={value => update('email', value)} />
        <Field label="INSTAGRAM URL" value={draft.instagram} onChange={value => update('instagram', value)} />
        <Field label="GOOGLE MAPS URL" value={draft.mapsUrl} onChange={value => update('mapsUrl', value)} />
      </FormGrid>
      <label style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>HORARIOS, UNO POR LINEA</span>
        <textarea value={draft.hoursText || ''} onChange={event => update('hoursText', event.target.value)} rows={4} className="admin-input" style={{ padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 14 }}>
        {saved && <span style={{ color: 'var(--admin-accent-text)', fontSize: 12, fontWeight: 800 }}>Guardado</span>}
        <button onClick={save} style={adminButton('primary')}>Guardar negocio</button>
      </div>
    </div>
  );
}

function offerWindowLabel(item) {
  if (!item.startsAt && !item.endsAt) return '';
  return ` · ${item.startsAt || 'sin inicio'} a ${item.endsAt || 'sin fin'}`;
}

function FormGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>{children}</div>;
}

function adminButton(kind) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: kind === 'primary' ? selectedPill.background : 'transparent',
    color: kind === 'primary' ? selectedPill.color : 'var(--admin-accent-text)',
    border: '1px solid ' + (kind === 'primary' ? selectedPill.border : 'var(--admin-border)'),
    padding: '7px 10px',
    borderRadius: 9,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700
  };
}

const requiredHint = { color: C.rust, fontSize: 10, fontWeight: 800, letterSpacing: 0.4 };

function isDraftValid(draft) {
  const hasText = (value) => String(value || '').trim().length > 0;

  if ('sessionDuration' in draft) {
    return hasText(draft.name) &&
      isValidEmail(draft.email) &&
      hasText(draft.cedula) &&
      hasText(draft.specialty) &&
      isValidPositiveInteger(draft.sessionDuration) &&
      hasText(draft.color) &&
      (draft.services || []).length > 0;
  }

  if ('duration' in draft && 'for' in draft) {
    return hasText(draft.name) &&
      hasText(draft.for) &&
      hasText(draft.icon) &&
      isValidPositiveInteger(draft.duration) &&
      isValidMoney(draft.price);
  }

  if ('price' in draft) {
    const validDates = !draft.startsAt || !draft.endsAt || draft.startsAt <= draft.endsAt;
    return hasText(draft.name) && isValidMoney(draft.price) && validDates;
  }

  return hasText(draft.name);
}
