import React, { useState } from 'react';
import { Brain, Coffee, Gift, Plus, Trash2, Users, X } from 'lucide-react';
import { C } from '../theme';
import { uid } from '../utils.jsx';

const PRODUCT_TABS = [
  { id: 'hot', label: 'Calientes' },
  { id: 'cold', label: 'Frías' },
  { id: 'drinks', label: 'Bebidas' },
  { id: 'desserts', label: 'Postres' },
];

const emptyService = { name: '', desc: '', duration: 50, price: 600, icon: 'heart', for: 'Adultos', active: true };
const emptyTherapist = { name: '', cedula: '', specialty: '', services: [], color: C.sageDark, active: true };
const emptyProduct = { name: '', sub: '', price: 45, active: true };
const emptyOffer = { name: '', desc: '', price: 99, active: true };

export default function AdminCatalog({ catalogs, catalogActions }) {
  const [tab, setTab] = useState('products');
  const tabs = [
    { id: 'products', label: 'Productos', icon: Coffee },
    { id: 'services', label: 'Servicios', icon: Brain },
    { id: 'therapists', label: 'Doctores', icon: Users },
    { id: 'offers', label: 'Ofertas', icon: Gift },
  ];

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Catálogos</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 20 }}>Administra productos, servicios, ofertas, doctores y precios.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {tabs.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, border: '1px solid ' + (tab === item.id ? C.sageDark : 'var(--admin-border)'),
            background: tab === item.id ? C.sageDark : 'var(--admin-surface)', color: tab === item.id ? 'var(--admin-on-accent)' : 'var(--admin-row-text)',
            padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700
          }}>
            <item.icon size={14} /> {item.label}
          </button>
        ))}
      </div>

      {tab === 'products' && <ProductsManager menu={catalogs.menu} setMenu={catalogActions.setMenu} />}
      {tab === 'services' && <ListManager title="Servicios" items={catalogs.services} setItems={catalogActions.setServices} emptyItem={emptyService} renderForm={ServiceForm} summary={(item) => `${item.duration} min · $${item.price} · ${item.for}`} />}
      {tab === 'therapists' && <ListManager title="Doctores" items={catalogs.therapists} setItems={catalogActions.setTherapists} emptyItem={emptyTherapist} renderForm={(props) => <TherapistForm {...props} services={catalogs.services} />} summary={(item) => `${item.specialty || 'Sin especialidad'} · Céd. ${item.cedula || 'pendiente'}`} />}
      {tab === 'offers' && <ListManager title="Ofertas" items={catalogs.offers} setItems={catalogActions.setOffers} emptyItem={emptyOffer} renderForm={OfferForm} summary={(item) => `$${item.price} · ${item.desc}`} />}
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
            color: category === item.id ? C.brown : 'var(--admin-row-text)',
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
    const clean = { ...draft, price: Number(draft.price || 0), duration: draft.duration ? Number(draft.duration) : draft.duration };
    if (editing === 'new') setItems([...items, clean]);
    else setItems(items.map(item => item.id === clean.id ? clean : item));
    setEditing(null);
  };

  const remove = (id) => setItems(items.filter(item => item.id !== id));
  const toggleActive = (item) => setItems(items.map(row => row.id === item.id ? { ...row, active: row.active === false } : row));

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, color: 'var(--admin-text)', fontSize: 15 }}>{title}</h2>
        <button onClick={startNew} style={{ background: C.sageDark, color: 'var(--admin-on-accent)', border: 'none', borderRadius: 999, padding: '8px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {editing && (
        <div style={{ background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <Form draft={draft} setDraft={setDraft} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditing(null)} style={adminButton('ghost')}><X size={14} /> Cancelar</button>
            <button onClick={save} style={adminButton('primary')}>Guardar</button>
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

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} className="admin-input" style={{ padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
    </label>
  );
}

function ProductForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="NOMBRE" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
    <Field label="DESCRIPCIÓN" value={draft.sub} onChange={sub => setDraft({ ...draft, sub })} />
    <Field label="PRECIO" type="number" value={draft.price} onChange={price => setDraft({ ...draft, price })} />
  </FormGrid>;
}

function ServiceForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="SERVICIO" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
    <Field label="DIRIGIDO A" value={draft.for} onChange={value => setDraft({ ...draft, for: value })} />
    <Field label="DURACIÓN" type="number" value={draft.duration} onChange={duration => setDraft({ ...draft, duration })} />
    <Field label="PRECIO" type="number" value={draft.price} onChange={price => setDraft({ ...draft, price })} />
    <Field label="ICONO" value={draft.icon} onChange={icon => setDraft({ ...draft, icon })} placeholder="heart, brain o sparkles" />
    <Field label="DESCRIPCIÓN" value={draft.desc} onChange={desc => setDraft({ ...draft, desc })} />
  </FormGrid>;
}

function TherapistForm({ draft, setDraft, services }) {
  return <>
    <FormGrid>
      <Field label="NOMBRE" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
      <Field label="CÉDULA" value={draft.cedula} onChange={cedula => setDraft({ ...draft, cedula })} />
      <Field label="ESPECIALIDAD" value={draft.specialty} onChange={specialty => setDraft({ ...draft, specialty })} />
      <Field label="COLOR" value={draft.color} onChange={color => setDraft({ ...draft, color })} />
    </FormGrid>
    <div style={{ marginTop: 12 }}>
      <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>SERVICIOS HABILITADOS</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {services.map(service => {
          const checked = draft.services?.includes(service.id);
          return (
            <button key={service.id} onClick={() => setDraft({ ...draft, services: checked ? draft.services.filter(id => id !== service.id) : [...(draft.services || []), service.id] })} style={{
              border: `1px solid ${checked ? C.sageDark : 'var(--admin-border)'}`,
              background: checked ? C.sageDark : 'var(--admin-surface)',
              color: checked ? 'var(--admin-on-accent)' : 'var(--admin-row-text)',
              borderRadius: 999,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit'
            }}>{service.name}</button>
          );
        })}
      </div>
    </div>
  </>;
}

function OfferForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="OFERTA" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
    <Field label="PRECIO" type="number" value={draft.price} onChange={price => setDraft({ ...draft, price })} />
    <Field label="DESCRIPCIÓN" value={draft.desc} onChange={desc => setDraft({ ...draft, desc })} />
  </FormGrid>;
}

function FormGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>{children}</div>;
}

function adminButton(kind) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: kind === 'primary' ? C.sageDark : 'transparent',
    color: kind === 'primary' ? 'var(--admin-on-accent)' : 'var(--admin-accent-text)',
    border: '1px solid ' + (kind === 'primary' ? C.sageDark : 'var(--admin-border)'),
    padding: '7px 10px',
    borderRadius: 9,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700
  };
}
