import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Building2, Coffee, Gift, Heart, Milk, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import { C } from '../theme';
import { safeUrl } from '../safeUrl.mjs';
import { uid } from '../utils.jsx';
import { isValidEmail, isValidMoney, isValidPositiveInteger } from '../validation';
import { canManageBusinessSettings, canManageCafeCatalog, canManageClinicCatalog } from '../auth/permissions';
import { useConfirm } from '../components/ConfirmDialog';
import FormModal from '../components/FormModal';

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
const emptyOffer = { name: '', desc: '', price: 99, kind: 'generic', active: true };
const emptyOption = { kind: 'flavor', name: '', priceDelta: 0, active: true };
const OPTION_TABS = [
  { id: 'milk', label: 'Leches', vacio: 'No hay tipos de leche. El cliente no verá esa opción.' },
  { id: 'flavor', label: 'Sabores', vacio: 'No hay sabores. El cliente no verá esa opción.' },
  { id: 'addon', label: 'Extras', vacio: 'No hay extras, como el shot adicional.' },
];
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
// A quien va dirigido un servicio. Lista corta y fija: antes era texto
// libre y cada quien escribia "Adultos / Niños", "adultos y niños" o
// "Niñ@s", y la pagina lo mostraba tal cual.
const SERVICE_AUDIENCES = ['Niños', 'Adolescentes', 'Adultos', 'Adultos / Niños', 'Parejas', 'Familias', 'Todas las edades'];

// Los errores del formulario se muestran DESPUES de intentar guardar, no
// mientras se escribe: un formulario nuevo no debe abrir en rojo. Lo
// comparten Field y SelectField sin pasar props por cada formulario.
const FormularioCtx = createContext({ intento: true, errores: {} });

const SERVICE_ICONS = [
  { id: 'heart', label: 'Corazon', icon: Heart },
  { id: 'brain', label: 'Cerebro', icon: Brain },
  { id: 'sparkles', label: 'Destellos', icon: Sparkles },
];

export default function AdminCatalog({ catalogs, catalogActions, session, initialTab, lockedTab = false, heading = 'Catálogos', description = 'Administra productos, servicios, ofertas, especialistas y precios.' }) {
  const role = session?.user?.role;
  const tabs = useMemo(() => [
    canManageCafeCatalog(role) && { id: 'products', label: 'Productos', icon: Coffee },
    canManageClinicCatalog(role) && { id: 'services', label: 'Servicios', icon: Brain },
    canManageClinicCatalog(role) && { id: 'therapists', label: 'Especialistas', icon: Users },
    canManageClinicCatalog(role) && { id: 'specialties', label: 'Especialidades', icon: Sparkles },
    canManageCafeCatalog(role) && { id: 'options', label: 'Personalización', icon: Milk },
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
            display: 'flex', alignItems: 'center', gap: 8, border: '1px solid ' + (tab === item.id ? 'var(--admin-accent)' : 'var(--admin-border)'),
            background: tab === item.id ? selectedPill.background : 'var(--admin-surface)', color: tab === item.id ? selectedPill.color : 'var(--admin-row-text)',
            padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700
          }}>
            <item.icon size={14} /> {item.label}
          </button>
        ))}
      </div>}

      {tab === 'products' && <ProductsManager menu={catalogs.menu} setMenu={catalogActions.setMenu} />}
      {tab === 'services' && <ListManager title="Servicios" items={catalogs.services} setItems={catalogActions.setServices} emptyItem={emptyService} renderForm={ServiceForm} summary={(item) => `${item.duration} min · $${item.price} · ${item.for}`} />}
      {tab === 'therapists' && <ListManager title="Especialistas" items={catalogs.therapists} setItems={catalogActions.setTherapists} emptyItem={emptyTherapist} renderForm={(props) => <TherapistForm {...props} services={catalogs.services} specialties={catalogs.specialties || []} />} summary={(item) => `${item.specialty || 'Sin especialidad'} · ${item.sessionDuration || 50} min · ${item.email || 'sin correo'} · Céd. ${item.cedula || 'pendiente'}${sinServicioActivo(item, catalogs.services) ? ' · Sin servicios activos: nadie puede agendarle' : ''}`} />}
      {tab === 'specialties' && <ListManager title="Especialidades" items={catalogs.specialties || []} setItems={catalogActions.setSpecialties} emptyItem={emptySpecialty} renderForm={SpecialtyForm} summary={(item) => item.active === false ? 'Inactiva' : 'Activa'} />}
      {tab === 'options' && <OptionsManager options={catalogs.productOptions || []} setOptions={catalogActions.setProductOptions} />}
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

// Leches, sabores y extras. Los tres son lo mismo —modificadores— y se
// distinguen por 'kind', asi que comparten pantalla en vez de tener tres.
function OptionsManager({ options, setOptions }) {
  const [kind, setKind] = useState('flavor');
  const actual = OPTION_TABS.find((t) => t.id === kind) || OPTION_TABS[0];
  const delTipo = options.filter((o) => o.kind === kind);

  // Se reemplazan solo los de ESTE tipo y se conservan los demas: el
  // guardado manda la lista completa, y filtrar sin reponer el resto
  // borraria los sabores al editar las leches.
  const setItems = (items) => setOptions([
    ...options.filter((o) => o.kind !== kind),
    ...items.map((item) => ({ ...item, kind })),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {OPTION_TABS.map(item => (
          <button key={item.id} onClick={() => setKind(item.id)} style={{
            border: '1px solid ' + (kind === item.id ? C.caramel : 'var(--admin-border)'),
            background: kind === item.id ? C.caramel : 'var(--admin-surface-soft)',
            color: kind === item.id ? selectedPill.color : 'var(--admin-row-text)',
            padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit'
          }}>{item.label}</button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Lo que el cliente puede elegir al pedir un café. El precio se suma al del producto;
        déjalo en 0 si no cobra. {delTipo.length === 0 && actual.vacio}
      </p>
      <ListManager
        title={`Personalización · ${actual.label}`}
        items={delTipo}
        setItems={setItems}
        emptyItem={{ ...emptyOption, kind }}
        renderForm={OptionForm}
        summary={(item) => (Number(item.priceDelta) > 0 ? `+$${item.priceDelta}` : 'Sin costo')}
      />
    </div>
  );
}

function OptionForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="NOMBRE" campo="name" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
    <Field label="PRECIO EXTRA" campo="priceDelta" type="number" value={draft.priceDelta} inputMode="decimal" step="0.5"
           onChange={priceDelta => setDraft({ ...draft, priceDelta })} required min={0} />
  </FormGrid>;
}

function ListManager({ title, items, setItems, emptyItem, renderForm: Form, summary }) {
  const { confirmar, dialogo } = useConfirm();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyItem);
  const [intento, setIntento] = useState(false);
  const formRef = useRef(null);

  const startNew = () => {
    setEditing('new');
    setIntento(false);
    setDraft({ ...emptyItem, id: uid() });
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setIntento(false);
    setDraft({ active: true, ...item });
  };

  const errores = erroresDeBorrador(draft);
  const save = () => {
    // El boton SIEMPRE se puede presionar. Antes se apagaba si algo no
    // cumplia —un correo mal escrito, un color sin elegir— y no decia
    // que, asi que parecia que el boton no servia. Ahora dice que falta,
    // junto a cada campo, y lleva el cursor al primero.
    if (Object.keys(errores).length) {
      setIntento(true);
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const clean = {
      ...draft,
      ...(('icon' in draft || 'for' in draft) ? { icon: draft.icon || 'heart' } : {}),
      ...('sessionDuration' in draft ? { color: draft.color || C.sageDark } : {}),
      price: Number(draft.price || 0),
      duration: draft.duration ? Number(draft.duration) : draft.duration,
      sessionDuration: draft.sessionDuration ? Number(draft.sessionDuration) : draft.sessionDuration,
    };
    if (editing === 'new') setItems([...items, clean]);
    else setItems(items.map(item => item.id === clean.id ? clean : item));
    setEditing(null);
    setIntento(false);
  };

  const remove = async (id) => {
    const item = items.find(row => row.id === id);
    if (!(await confirmar({
      titulo: 'Eliminar registro',
      mensaje: `Se va a eliminar "${item?.name || 'este registro'}". Esta acción no se puede deshacer.`,
      aceptar: 'Eliminar',
      destructivo: true,
    }))) return;
    setItems(items.filter(item => item.id !== id));
  };
  const toggleActive = (item) => setItems(items.map(row => row.id === item.id ? { ...row, active: row.active === false } : row));

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
      {dialogo}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, color: 'var(--admin-text)', fontSize: 15 }}>{title}</h2>
        <button onClick={startNew} style={{ background: selectedPill.background, color: selectedPill.color, border: 'none', borderRadius: 999, padding: '8px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {editing && (
        <FormModal
          titulo={`${editing === 'new' ? 'Nuevo' : 'Editar'} · ${title}`}
          onCerrar={() => { setEditing(null); setIntento(false); }}
          pie={(
            <>
              {intento && Object.keys(errores).length > 0 && (
                <div role="alert" style={{ ...requiredHint, marginBottom: 12 }}>
                  Para guardar, corrige: {Object.values(errores).join(' ')}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => { setEditing(null); setIntento(false); }} style={adminButton('ghost')}><X size={14} /> Cancelar</button>
                <button type="button" onClick={save} style={adminButton('primary')}>Guardar</button>
              </div>
            </>
          )}
        >
          <FormularioCtx.Provider value={{ intento, errores }}>
            <div ref={formRef}><Form draft={draft} setDraft={setDraft} /></div>
          </FormularioCtx.Provider>
        </FormModal>
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

// campo: la clave del borrador, para mostrar SU mensaje (erroresDeBorrador)
// en vez de un "Campo requerido" generico. align-content:start: si el
// vecino de fila muestra un error, este no se estira ni se descuadra.
function Field({ label, value, onChange, type = 'text', placeholder, required = false, min, step, className = '', aviso = '', campo, inputMode, autoComplete, spellCheck }) {
  const { intento, errores } = useContext(FormularioCtx);
  const vacio = String(value ?? '').trim().length === 0;
  const error = intento ? ((campo && errores[campo]) || (required && vacio ? 'Campo requerido' : '')) : '';
  const mensaje = error || aviso;
  return (
    <label className={className} style={{ display: 'grid', gap: 6, minWidth: 0, alignContent: 'start' }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      <input value={value ?? ''} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} required={required} min={min} step={step}
        inputMode={inputMode} autoComplete={autoComplete} spellCheck={spellCheck} aria-invalid={Boolean(error)}
        className="admin-input" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit', borderColor: mensaje ? C.rust : undefined }} />
      {mensaje && <span style={requiredHint}>{mensaje}</span>}
    </label>
  );
}

// El saneador de ContactPage no pinta el enlace si la URL no es segura, y
// sin este aviso el admin guardaria y veria DESAPARECER el enlace sin que
// nada le diga por que. La validacion de entrada no es el control de
// seguridad —ese vive en el sumidero— pero sin ella el arreglo deja al
// usuario a oscuras.
const avisoUrl = (valor) => (
  String(valor || '').trim() && !safeUrl(valor)
    ? 'Tiene que ser una direccion http:// o https:// completa. Si no, el enlace no se publica.'
    : ''
);

function ProductForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="NOMBRE" campo="name" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
    <Field label="DESCRIPCIÓN" value={draft.sub} onChange={sub => setDraft({ ...draft, sub })} />
    <Field label="PRECIO" campo="price" type="number" inputMode="decimal" step="0.5" value={draft.price} onChange={price => setDraft({ ...draft, price })} required min={0} />
  </FormGrid>;
}

function ServiceForm({ draft, setDraft }) {
  return <>
    {/* auto-fit con min(100%, …): en el celular se apila en una columna
        en vez de desbordar. alignItems start: un error bajo un campo ya no
        empuja hacia abajo a sus vecinos de fila. */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '14px 12px', alignItems: 'start' }}>
      <Field label="SERVICIO" campo="name" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
      <SelectField label="DIRIGIDO A" campo="for" value={draft.for} onChange={value => setDraft({ ...draft, for: value })} required>
        <option value="">Elige a quién…</option>
        {/* Un valor de antes que no esta en la lista se conserva, para no
            borrarlo al editar. */}
        {[...SERVICE_AUDIENCES, ...(draft.for && !SERVICE_AUDIENCES.includes(draft.for) ? [draft.for] : [])].map((a) => <option key={a} value={a}>{a}</option>)}
      </SelectField>
      <Field label="DURACIÓN (MIN)" campo="duration" type="number" inputMode="numeric" step="5" value={draft.duration} onChange={duration => setDraft({ ...draft, duration })} required min={5} />
      <Field label="PRECIO" campo="price" type="number" inputMode="decimal" step="1" value={draft.price} onChange={price => setDraft({ ...draft, price })} required min={0} />
      <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1', alignContent: 'start' }}>
        <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>DESCRIPCIÓN</span>
        <input value={draft.desc || ''} onChange={e => setDraft({ ...draft, desc: e.target.value })} className="admin-input" style={{ padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit' }} />
      </label>
      <div style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
        <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>ICONO</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SERVICE_ICONS.map(item => {
            const Icon = item.icon;
            const selected = (draft.icon || 'heart') === item.id;
            return (
              <button key={item.id} type="button" aria-pressed={selected} onClick={() => setDraft({ ...draft, icon: item.id })} style={{
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

function SelectField({ label, value, onChange, children, required = false, className = '', ayuda = null, campo }) {
  const { intento, errores } = useContext(FormularioCtx);
  const vacio = String(value ?? '').trim().length === 0;
  const error = intento ? ((campo && errores[campo]) || (required && vacio ? 'Campo requerido' : '')) : '';
  return (
    <label className={className} style={{ display: 'grid', gap: 6, minWidth: 0, alignContent: 'start' }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} required={required} aria-invalid={Boolean(error)} className="admin-input" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit', borderColor: error ? C.rust : undefined }}>
        {children}
      </select>
      {ayuda && <span style={campoAyuda}>{ayuda}</span>}
      {error && <span style={requiredHint}>{error}</span>}
    </label>
  );
}

function TherapistForm({ draft, setDraft, services, specialties }) {
  const activeSpecialties = (specialties || []).filter(item => item.active !== false);

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
      <Field className="therapist-form-name" label="NOMBRE" campo="name" value={draft.name} onChange={name => setDraft({ ...draft, name })} required autoComplete="off" />
      <Field className="therapist-form-email" label="CORREO DE ACCESO" campo="email" type="email" value={draft.email} onChange={email => setDraft({ ...draft, email })} required autoComplete="off" spellCheck={false} />
      <Field className="therapist-form-cedula" label="CÉDULA" campo="cedula" value={draft.cedula} onChange={cedula => setDraft({ ...draft, cedula })} required autoComplete="off" spellCheck={false} />
      <SelectField
        className="therapist-form-specialty"
        label="ESPECIALIDAD QUE VE EL PACIENTE"
        ayuda="Solo se muestra: aparece bajo su nombre al agendar, junto a la cédula."
        campo="specialty"
        value={draft.specialty || ''}
        onChange={specialty => setDraft({ ...draft, specialty })}
        required
      >
        <option value="">Selecciona especialidad</option>
        {activeSpecialties.map(specialty => <option key={specialty.id} value={specialty.name}>{specialty.name}</option>)}
        {/* La que ya tenia y ya no esta activa se muestra tal cual: si no,
            el campo se veia vacio aunque tuviera valor. */}
        {draft.specialty && !activeSpecialties.some((sp) => sp.name === draft.specialty) && (
          <option value={draft.specialty}>{draft.specialty} (inactiva)</option>
        )}
      </SelectField>
      {/* Sin "|| 50": el campo muestra lo que de verdad hay. Antes, al
          borrarlo seguia diciendo 50 y el guardado fallaba sin decir por que. */}
      <Field className="therapist-form-duration" label="DURACIÓN SESIÓN (MIN)" campo="sessionDuration" type="number" inputMode="numeric" step="5" value={draft.sessionDuration ?? ''} onChange={sessionDuration => setDraft({ ...draft, sessionDuration })} required min={5} />
    </div>
    <div style={{ marginTop: 12 }}>
      <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>COLOR</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {THERAPIST_COLORS.map(color => {
          const selected = (draft.color || C.sageDark) === color.value;
          return (
            <button key={color.value} type="button" aria-pressed={selected} onClick={() => setDraft({ ...draft, color: color.value })} style={{
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
      <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 2 }}>SERVICIOS HABILITADOS</div>
      {/* El par se confunde: el de arriba se muestra, este DECIDE. Sin
          decirlo, un servicio sin marcar deja al doctor fuera de la
          agenda sin que nada lo avise. */}
      <div style={{ ...campoAyuda, marginBottom: 8 }}>
        Decide para qué servicios se le puede agendar, a ti y al paciente. Si uno no está marcado, no aparece como opción.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {services.map(service => {
          const checked = draft.services?.includes(service.id);
          // Un servicio desactivado no aparece en la web: marcarlo no le da
          // citas a nadie. Asi quedo una especialista ligada solo a dos
          // servicios del catalogo viejo, sin que nada lo dijera.
          const apagado = service.active === false;
          return (
            <button key={service.id} type="button" aria-pressed={Boolean(checked)} onClick={() => setDraft({ ...draft, services: checked ? draft.services.filter(id => id !== service.id) : [...(draft.services || []), service.id] })} style={{
              border: `1px solid ${checked ? selectedPill.border : 'var(--admin-border)'}`,
              background: checked ? selectedPill.background : 'var(--admin-surface)',
              color: checked ? selectedPill.color : 'var(--admin-row-text)',
              borderRadius: 999,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit'
            }}>{service.name}{apagado ? ' (desactivado)' : ''}</button>
          );
        })}
      </div>
      <ErrorDe campo="services" />
      {(draft.services || []).length > 0 && sinServicioActivo(draft, services) && (
        <span style={{ ...requiredHint, display: 'block', marginTop: 6 }}>
          Solo tiene servicios desactivados: en la web nadie puede agendarle. Marca al menos uno activo.
        </span>
      )}
    </div>
  </>;
}

function SpecialtyForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="ESPECIALIDAD" campo="name" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
  </FormGrid>;
}

function OfferForm({ draft, setDraft }) {
  return <FormGrid>
    <Field label="OFERTA" campo="name" value={draft.name} onChange={name => setDraft({ ...draft, name })} required />
    <Field label="PRECIO" campo="price" type="number" inputMode="decimal" step="1" value={draft.price} onChange={price => setDraft({ ...draft, price })} required min={0} />
    <Field label="INICIA" type="date" value={draft.startsAt || ''} onChange={startsAt => setDraft({ ...draft, startsAt })} />
    <Field label="TERMINA" campo="endsAt" type="date" value={draft.endsAt || ''} onChange={endsAt => setDraft({ ...draft, endsAt })} />
    <Field label="DESCRIPCIÓN" value={draft.desc} onChange={desc => setDraft({ ...draft, desc })} />
    {/* Cual de las promociones DESCUENTA. Antes se tomaba "la primera
        activa", asi que una promo informativa cualquiera acababa
        descontando contra su precio en todos los pedidos con cafe y
        postre. Ahora es una eleccion, no un accidente de orden. */}
    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>TIPO</span>
      <select className="admin-input" value={draft.kind || 'generic'}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit' }}>
        <option value="generic">Informativa — se muestra, no descuenta</option>
        <option value="combo">Combo café + postre — descuenta del total</option>
      </select>
    </label>
  </FormGrid>;
}

function BusinessSettings({ settings, setSettings }) {
  const [draft, setDraft] = useState({
    ...settings,
    hoursText: (settings?.hours || []).join('\n'),
  });
  const [saved, setSaved] = useState(false);
  const [intento, setIntento] = useState(false);
  const update = (key, value) => {
    setSaved(false);
    setDraft({ ...draft, [key]: value });
  };
  // Los dos nombres son obligatorios: el aviso de privacidad y el pie de
  // pagina los usan. Antes estaban marcados como requeridos pero se
  // guardaba con ellos vacios.
  const errores = {
    ...(String(draft.name || '').trim() ? {} : { name: 'Escribe el nombre comercial.' }),
    ...(String(draft.legalName || '').trim() ? {} : { legalName: 'Escribe la razón o nombre legal.' }),
    ...(String(draft.email || '').trim() && !isValidEmail(draft.email) ? { email: 'Revisa el correo: no parece válido.' } : {}),
  };
  const save = () => {
    if (Object.keys(errores).length) { setIntento(true); return; }
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
      reviewUrl: draft.reviewUrl || '',
      hours: String(draft.hoursText || '').split('\n').map((line) => line.trim()).filter(Boolean),
    };
    setSettings(next);
    setSaved(true);
  };

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
      <h2 style={{ margin: '0 0 14px', color: 'var(--admin-text)', fontSize: 15 }}>Informacion del negocio</h2>
      <FormularioCtx.Provider value={{ intento, errores }}>
      <FormGrid>
        <Field label="NOMBRE COMERCIAL" campo="name" value={draft.name} onChange={value => update('name', value)} required />
        <Field label="RAZÓN / NOMBRE LEGAL" campo="legalName" value={draft.legalName} onChange={value => update('legalName', value)} required />
        <Field label="CIUDAD" value={draft.city} onChange={value => update('city', value)} />
        <Field label="DIRECCIÓN" value={draft.address} onChange={value => update('address', value)} />
        <Field label="TELÉFONO" type="tel" inputMode="tel" placeholder="81 1234 5678" value={draft.phone} onChange={value => update('phone', value)} />
        <Field label="WHATSAPP (CON 52)" type="tel" inputMode="tel" placeholder="528112345678" value={draft.whatsapp} onChange={value => update('whatsapp', value)} />
        <Field label="CORREO" campo="email" type="email" spellCheck={false} value={draft.email} onChange={value => update('email', value)} />
        <Field label="INSTAGRAM (ENLACE)" type="url" inputMode="url" spellCheck={false} placeholder="https://instagram.com/…" value={draft.instagram} onChange={value => update('instagram', value)} aviso={avisoUrl(draft.instagram)} />
        <Field label="GOOGLE MAPS (ENLACE)" type="url" inputMode="url" spellCheck={false} placeholder="https://maps.app.goo.gl/…" value={draft.mapsUrl} onChange={value => update('mapsUrl', value)} aviso={avisoUrl(draft.mapsUrl)} />
        <Field label="ENLACE PARA RESEÑAS" type="url" inputMode="url" spellCheck={false} value={draft.reviewUrl} onChange={value => update('reviewUrl', value)}
          placeholder='Google → "Pedir reseñas"' aviso={avisoUrl(draft.reviewUrl)} />
      </FormGrid>
      </FormularioCtx.Provider>
      <label style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>HORARIOS, UNO POR LINEA</span>
        <textarea value={draft.hoursText || ''} onChange={event => update('hoursText', event.target.value)} rows={4} className="admin-input" style={{ padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit', resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 14 }}>
        {saved && <span style={{ color: 'var(--admin-accent-text)', fontSize: 12, fontWeight: 800 }}>Guardado</span>}
        {intento && Object.keys(errores).length > 0 && <span role="alert" style={requiredHint}>Corrige los campos marcados.</span>}
        <button type="button" onClick={save} style={adminButton('primary')}>Guardar negocio</button>
      </div>
    </div>
  );
}

function offerWindowLabel(item) {
  if (!item.startsAt && !item.endsAt) return '';
  return ` · ${item.startsAt || 'sin inicio'} a ${item.endsAt || 'sin fin'}`;
}

function FormGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px 10px', alignItems: 'start' }}>{children}</div>;
}

// El error de un campo que no es un input (servicios, color).
function ErrorDe({ campo }) {
  const { intento, errores } = useContext(FormularioCtx);
  return intento && errores[campo] ? <span style={{ ...requiredHint, display: 'block', marginTop: 6 }}>{errores[campo]}</span> : null;
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

const campoAyuda = { color: 'var(--admin-muted)', fontSize: 11, lineHeight: 1.45, fontWeight: 400, letterSpacing: 0 };

const requiredHint = { color: C.rustText, fontSize: 12.5, fontWeight: 700 };

// true si el especialista no atiende NINGUN servicio activo del catalogo.
const sinServicioActivo = (therapist, services = []) => {
  const activos = new Set(services.filter((sv) => sv.active !== false).map((sv) => sv.id));
  return !(therapist.services || []).some((id) => activos.has(id));
};

// Que le falta a un borrador para poder guardarse, campo por campo y en
// palabras. Vacio = se puede guardar. Aplica los mismos valores por
// defecto que la pantalla MUESTRA (icono, color): antes la pantalla
// mostraba "Corazón" o "Verde" elegidos y la validacion los exigia
// vacios, y el boton se apagaba sin razon a la vista.
export function erroresDeBorrador(draft) {
  const hasText = (value) => String(value ?? '').trim().length > 0;
  const e = {};

  if ('sessionDuration' in draft || 'cedula' in draft) {
    if (!hasText(draft.name)) e.name = 'Escribe el nombre.';
    if (!hasText(draft.email)) e.email = 'Escribe el correo de acceso.';
    else if (!isValidEmail(draft.email)) e.email = 'Revisa el correo: no parece válido.';
    if (!hasText(draft.cedula)) e.cedula = 'Escribe la cédula profesional.';
    if (!hasText(draft.specialty)) e.specialty = 'Elige la especialidad.';
    if (!isValidPositiveInteger(draft.sessionDuration)) e.sessionDuration = 'La duración debe ser un número entero de minutos.';
    if (!(draft.services || []).length) e.services = 'Marca al menos un servicio que atiende.';
    return e;
  }

  if ('duration' in draft && 'for' in draft) {
    if (!hasText(draft.name)) e.name = 'Escribe el nombre del servicio.';
    if (!hasText(draft.for)) e.for = 'Elige a quién va dirigido.';
    if (!isValidPositiveInteger(draft.duration)) e.duration = 'La duración debe ser un número entero de minutos.';
    if (!isValidMoney(draft.price)) e.price = 'El precio debe ser 0 o más.';
    return e;
  }

  if ('priceDelta' in draft) {
    if (!hasText(draft.name)) e.name = 'Escribe el nombre.';
    if (!isValidMoney(draft.priceDelta)) e.priceDelta = 'El precio extra debe ser 0 o más (0 = sin costo).';
    return e;
  }

  if ('price' in draft) {
    if (!hasText(draft.name)) e.name = 'Escribe el nombre.';
    if (!isValidMoney(draft.price)) e.price = 'El precio debe ser 0 o más.';
    if (draft.startsAt && draft.endsAt && draft.startsAt > draft.endsAt) e.endsAt = 'La fecha de término es antes de la de inicio.';
    return e;
  }

  if (!hasText(draft.name)) e.name = 'Escribe el nombre.';
  return e;
}
