import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, FileText, LogOut, Plus, Save, Settings, Trash2, User, X } from 'lucide-react';
import { C } from '../theme';
import BrandMark from '../components/BrandMark';
import AdminAppointments from '../admin/AdminAppointments';
import { deleteClinicalNote, loadClinicalNotes, loadPatients, saveClinicalNote } from '../api/supabaseData';

export default function DoctorApp({ bookings, setBookings, catalogs, session, logout, theme, toggleTheme }) {
  const isDark = theme === 'dark';
  const therapistId = session?.user?.therapistId;
  const therapist = catalogs.therapists.find((item) => item.id === therapistId);
  const [page, setPage] = useState('appointments');
  const [patients, setPatients] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [notesError, setNotesError] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const doctorBookings = useMemo(
    () => bookings.filter((booking) => booking.therapistId === therapistId),
    [bookings, therapistId]
  );
  const visiblePatients = useMemo(() => {
    const byId = new Map();
    patients.forEach((patient) => byId.set(patient.id, patient));
    doctorBookings.forEach((booking) => {
      if (!booking.patientId) return;
      if (!byId.has(booking.patientId)) {
        byId.set(booking.patientId, {
          id: booking.patientId,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          active: true,
        });
      }
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [doctorBookings, patients]);

  useEffect(() => {
    if (!visiblePatients.length || selectedPatientId) return;
    setSelectedPatientId(visiblePatients[0].id);
  }, [selectedPatientId, visiblePatients]);

  useEffect(() => {
    let cancelled = false;
    const loadClinicalData = async () => {
      setNotesLoading(true);
      setNotesError('');
      try {
        const [nextPatients, nextNotes] = await Promise.all([
          loadPatients(),
          loadClinicalNotes(),
        ]);
        if (cancelled) return;
        setPatients(nextPatients);
        setClinicalNotes(nextNotes);
      } catch (error) {
        if (!cancelled) setNotesError(error.message || 'No se pudo cargar la información clínica.');
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    };

    loadClinicalData();
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadClinicalData = async () => {
    setNotesLoading(true);
    setNotesError('');
    try {
      const [nextPatients, nextNotes] = await Promise.all([
        loadPatients(),
        loadClinicalNotes(),
      ]);
      setPatients(nextPatients);
      setClinicalNotes(nextNotes);
    } catch (error) {
      setNotesError(error.message || 'No se pudo actualizar la información clínica.');
    } finally {
      setNotesLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--admin-bg)',
      color: 'var(--admin-text)',
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
      <header style={{
        background: 'var(--admin-sidebar)',
        borderBottom: '1px solid var(--admin-border-soft)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BrandMark size={36} />
          <div>
            <div className="font-display" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{therapist?.name || session.user.name}</div>
            <div style={{ color: 'var(--admin-accent-text)', fontSize: 10, letterSpacing: 1, fontWeight: 800 }}>PANEL DOCTOR</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleTheme} style={topButtonStyle}>
            <Settings size={14} /> Modo {theme === 'dark' ? 'claro' : 'oscuro'}
          </button>
          <button onClick={logout} style={{ ...topButtonStyle, color: C.rust }}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </header>
      <main style={{ padding: 24, maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {page === 'appointments' ? <CalendarIcon size={20} color="var(--admin-accent-text)" /> : <User size={20} color="var(--admin-accent-text)" />}
            <div>
              <h1 className="font-display" style={{ margin: 0, color: 'var(--admin-text)', fontSize: 30 }}>
                {page === 'appointments' ? 'Mis citas' : 'Pacientes y notas'}
              </h1>
              <p style={{ margin: '2px 0 0', color: 'var(--admin-muted)', fontSize: 13 }}>
                {page === 'appointments'
                  ? 'Solo puedes administrar las citas asignadas a tu usuario.'
                  : 'Las notas clínicas solo son visibles para el doctor autorizado.'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'appointments', label: 'Citas', icon: CalendarIcon },
              { id: 'patients', label: 'Pacientes', icon: User },
            ].map((item) => (
              <button key={item.id} onClick={() => setPage(item.id)} style={{
                ...topButtonStyle,
                background: page === item.id ? 'var(--admin-surface)' : 'transparent',
                color: page === item.id ? 'var(--admin-text)' : 'var(--admin-accent-text)',
              }}>
                <item.icon size={14} /> {item.label}
              </button>
            ))}
          </div>
        </div>
        {page === 'appointments' && (
          <AdminAppointments bookings={bookings} setBookings={setBookings} catalogs={catalogs} lockedTherapistId={therapistId} />
        )}
        {page === 'patients' && (
          <DoctorPatients
            appointments={doctorBookings}
            patients={visiblePatients}
            selectedPatientId={selectedPatientId}
            setSelectedPatientId={setSelectedPatientId}
            notes={clinicalNotes}
            session={session}
            therapistId={therapistId}
            loading={notesLoading}
            error={notesError}
            reload={reloadClinicalData}
            setNotes={setClinicalNotes}
            setError={setNotesError}
          />
        )}
      </main>
    </div>
  );
}

const topButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: 'transparent',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-accent-text)',
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700
};

function DoctorPatients({
  appointments,
  patients,
  selectedPatientId,
  setSelectedPatientId,
  notes,
  session,
  therapistId,
  loading,
  error,
  reload,
  setNotes,
  setError,
}) {
  const patient = patients.find((item) => item.id === selectedPatientId);
  const patientAppointments = appointments
    .filter((appointment) => appointment.patientId === selectedPatientId)
    .sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
  const patientNotes = notes
    .filter((note) => note.patientId === selectedPatientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!patients.length) {
    return (
      <div className="admin-card" style={{ borderRadius: 16, padding: 34, textAlign: 'center' }}>
        <User size={32} color="var(--admin-subtle)" style={{ marginBottom: 10 }} />
        <p style={{ color: 'var(--admin-muted)', margin: 0, fontSize: 13 }}>
          Aún no hay pacientes vinculados a tus citas. Si ya existen citas, vuelve a ejecutar el schema de Supabase para generar `patient_id`.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.35fr) minmax(420px, 1fr)', gap: 16 }}>
      <aside className="admin-card" style={{ borderRadius: 16, padding: 14, alignSelf: 'start' }}>
        <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, margin: '0 0 10px 4px' }}>PACIENTES</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {patients.map((item) => (
            <button key={item.id} onClick={() => setSelectedPatientId(item.id)} style={{
              border: `1px solid ${selectedPatientId === item.id ? C.sageDark : 'var(--admin-border)'}`,
              background: selectedPatientId === item.id ? 'var(--admin-surface-soft)' : 'transparent',
              color: 'var(--admin-text)',
              borderRadius: 12,
              padding: 12,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div>
              <div style={{ color: 'var(--admin-muted)', fontSize: 11, marginTop: 2 }}>{item.email}</div>
            </button>
          ))}
        </div>
      </aside>

      <section style={{ display: 'grid', gap: 14 }}>
        {error && (
          <div style={{ background: C.rustAlpha20, border: `1px solid ${C.rustAlpha40}`, color: C.rust, borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 700 }}>
            {error}
          </div>
        )}
        <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h2 className="font-display" style={{ margin: 0, fontSize: 24, color: 'var(--admin-text)' }}>{patient?.name}</h2>
              <div style={{ color: 'var(--admin-muted)', fontSize: 12, marginTop: 4 }}>{patient?.email} · {patient?.phone}</div>
            </div>
            <button onClick={reload} disabled={loading} style={smallButtonStyle}>
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <Stat label="Citas" value={patientAppointments.length} />
            <Stat label="Notas clínicas" value={patientNotes.length} />
            <Stat label="Última cita" value={patientAppointments[0] ? `${patientAppointments[0].date} ${patientAppointments[0].time}` : 'Sin historial'} />
          </div>
        </div>

        <ClinicalNoteEditor
          patient={patient}
          appointments={patientAppointments}
          session={session}
          therapistId={therapistId}
          setNotes={setNotes}
          setError={setError}
        />

        <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--admin-text)', fontSize: 14 }}>Historial de notas</h3>
          {patientNotes.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--admin-muted)', fontSize: 13 }}>No hay notas clínicas para este paciente.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {patientNotes.map((note) => (
                <ClinicalNoteCard key={note.id} note={note} appointments={patientAppointments} session={session} setNotes={setNotes} setError={setError} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ClinicalNoteEditor({ patient, appointments, session, therapistId, setNotes, setError }) {
  const [appointmentId, setAppointmentId] = useState('');
  const [content, setContent] = useState('');
  const canSave = Boolean(patient?.id && appointmentId && content.trim().length > 0 && content.trim().length <= 5000);

  useEffect(() => {
    setAppointmentId(appointments[0]?.id || '');
    setContent('');
  }, [appointments, patient?.id]);

  const save = async () => {
    if (!canSave) return;
    setError('');
    try {
      const saved = await saveClinicalNote({
        appointmentId,
        patientId: patient.id,
        therapistId,
        content,
      }, session);
      setNotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setContent('');
    } catch (error) {
      setError(error.message || 'No se pudo guardar la nota clínica.');
    }
  };

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 18 }}>
      <h3 style={{ margin: '0 0 12px', color: 'var(--admin-text)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={16} /> Nueva nota clínica
      </h3>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabel}>CITA RELACIONADA</span>
          <select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} className="admin-input" style={fieldInput}>
            <option value="">Selecciona cita</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>{appointment.date} {appointment.time}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabel}>NOTA</span>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={5000} className="admin-input" style={{ ...fieldInput, resize: 'vertical' }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ color: content.length > 5000 ? C.rust : 'var(--admin-muted)', fontSize: 11 }}>{content.length}/5000</span>
          <button onClick={save} disabled={!canSave} style={{ ...smallButtonStyle, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Plus size={14} /> Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}

function ClinicalNoteCard({ note, appointments, session, setNotes, setError }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const appointment = appointments.find((item) => item.id === note.appointmentId);

  const save = async () => {
    setError('');
    try {
      const saved = await saveClinicalNote({ ...note, content }, session);
      setNotes((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditing(false);
    } catch (error) {
      setError(error.message || 'No se pudo editar la nota clínica.');
    }
  };

  const remove = async () => {
    setError('');
    try {
      await deleteClinicalNote(note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (error) {
      setError(error.message || 'No se pudo eliminar la nota clínica.');
    }
  };

  return (
    <article style={{ border: '1px solid var(--admin-border)', borderRadius: 12, padding: 14, background: 'var(--admin-surface-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ color: 'var(--admin-muted)', fontSize: 11 }}>
          {appointment ? `${appointment.date} ${appointment.time}` : 'Cita relacionada'} · {new Date(note.createdAt).toLocaleDateString('es-MX')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button onClick={save} style={iconButtonStyle} title="Guardar"><Save size={14} /></button>
              <button onClick={() => { setEditing(false); setContent(note.content); }} style={iconButtonStyle} title="Cancelar"><X size={14} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={iconButtonStyle} title="Editar"><FileText size={14} /></button>
              <button onClick={remove} style={{ ...iconButtonStyle, color: C.rust }} title="Eliminar"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={5000} className="admin-input" style={{ ...fieldInput, resize: 'vertical' }} />
      ) : (
        <p style={{ whiteSpace: 'pre-wrap', color: 'var(--admin-row-text)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{note.content}</p>
      )}
    </article>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 12 }}>
      <div style={{ color: 'var(--admin-muted)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{label.toUpperCase()}</div>
      <div style={{ color: 'var(--admin-text)', fontSize: 16, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const fieldLabel = { color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 };
const fieldInput = { width: '100%', minHeight: 40, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit' };
const smallButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: C.sageDark,
  border: 'none',
  color: 'var(--admin-on-accent)',
  borderRadius: 10,
  padding: '9px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 800,
};
const iconButtonStyle = {
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-accent-text)',
  borderRadius: 8,
  padding: 6,
  cursor: 'pointer',
};
