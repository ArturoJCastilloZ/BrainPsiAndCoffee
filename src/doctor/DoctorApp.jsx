import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar as CalendarIcon, Clock, FileText, Lock, LogOut, Plus, Save, Settings, User, X } from 'lucide-react';
import { C } from '../theme';
import { localDate } from '../utils.jsx';
import BrandMark from '../components/BrandMark';
import AdminAppointments from '../admin/AdminAppointments';
import AdminSchedules from '../admin/AdminSchedules';
import { useConfirm } from '../components/ConfirmDialog';
import {
  addNoteAddendum, createClinicalNote, ensureEncounter, loadClinicalNotes, logClinicalNoteAccess,
  loadPatients, signClinicalNote, updateClinicalNote,
} from '../api/supabaseData';

export default function DoctorApp({ bookings, setBookings, catalogs, session, logout, theme, toggleTheme, catalogActions}) {
  const therapistId = session?.user?.therapistId;
  const therapist = catalogs.therapists.find((item) => item.id === therapistId);
  const [page, setPage] = useState('appointments');
  const [patients, setPatients] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [notesError, setNotesError] = useState('');
  // Arranca en TRUE: al montar siempre se dispara una carga, asi que con
  // false habia un render donde se afirmaba "no hay pacientes" sin haber
  // preguntado todavia. Es la misma clase de mentira, mas corta.
  const [notesLoading, setNotesLoading] = useState(true);
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
    // Depende de las citas del doctor: el paciente lo crea el trigger al
    // guardar la cita, asi que una cita nueva puede traer un paciente que
    // esta lista todavia no conoce. Con [] se cargaba una sola vez al
    // montar y "Pacientes y notas" seguia vacio hasta recargar la pagina.
    //
    // Se observa la CANTIDAD y no el arreglo: bookings se recrea en cada
    // render y usarlo directo dispararia la consulta sin parar.
  }, [doctorBookings.length]);

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
      color: 'var(--admin-text)'
      // Los tokens --admin-* y las clases .admin-card/.admin-input viven en la
      // hoja global de App.jsx. Ver la nota equivalente en AdminApp.jsx.
    }}>
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
      <main style={{ padding: '0 24px 64px', maxWidth: 1120, margin: '0 auto' }}>
        {/* Un solo encabezado. Antes este bloque pintaba el titulo y luego
            la pantalla incrustada pintaba el suyo: dos titulos peleando el
            mismo rol, y por eso todo empezaba a mitad de pantalla. */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap',
          padding: '28px 0 16px',
          borderBottom: '1px solid var(--admin-border-soft)',
          marginBottom: 24,
        }}>
          <div>
            <h1 className="font-display" style={{
              margin: 0, color: 'var(--admin-text)',
              fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1,
            }}>
              {PAGINAS[page].titulo}
            </h1>
            <p style={{ margin: '6px 0 0', color: 'var(--admin-muted)', fontSize: 13, lineHeight: 1.5, maxWidth: '58ch' }}>
              {PAGINAS[page].descripcion}
            </p>
          </div>

          {/* Control segmentado: una sola pieza que dice donde estas,
              en vez de tres botones sueltos que se ven igual entre si. */}
          <nav aria-label="Secciones del panel" style={{
            display: 'inline-flex', gap: 2, padding: 3,
            background: 'var(--admin-surface-soft)',
            border: '1px solid var(--admin-border)',
            borderRadius: 12,
          }}>
            {ORDEN_PAGINAS.map((id) => {
              const activa = page === id;
              const Icono = PAGINAS[id].icono;
              return (
                <button
                  key={id}
                  onClick={() => setPage(id)}
                  aria-current={activa ? 'page' : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    minHeight: 36, padding: '0 14px', borderRadius: 9,
                    border: '1px solid transparent',
                    background: activa ? 'var(--admin-surface)' : 'transparent',
                    borderColor: activa ? 'var(--admin-border)' : 'transparent',
                    color: activa ? 'var(--admin-text)' : 'var(--admin-muted)',
                    fontFamily: 'inherit', fontSize: 13,
                    fontWeight: activa ? 700 : 500,
                    cursor: 'pointer', transition: 'color 150ms, background 150ms',
                  }}
                >
                  <Icono size={15} aria-hidden="true" /> {PAGINAS[id].pestana}
                </button>
              );
            })}
          </nav>
        </div>

        {page === 'appointments' && (
          <AdminAppointments bookings={bookings} setBookings={setBookings} catalogs={catalogs} lockedTherapistId={therapistId} embedded />
        )}
        {page === 'schedule' && (
          <AdminSchedules catalogs={catalogs} lockedTherapistId={therapistId} reload={catalogActions?.reload} embedded />
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

// El titulo, la frase y la pestaña de cada seccion en UN lugar. Antes
// estaban en tres ternarios encadenados dentro del JSX, que es donde se
// desincronizan.
const PAGINAS = {
  appointments: {
    titulo: 'Mis citas',
    pestana: 'Citas',
    icono: CalendarIcon,
    descripcion: 'Las citas asignadas a tu usuario. Puedes confirmarlas, reprogramarlas o cancelarlas.',
  },
  patients: {
    titulo: 'Pacientes y notas',
    pestana: 'Pacientes',
    icono: User,
    descripcion: 'El expediente de cada paciente. Las notas clínicas solo las ve el doctor autorizado, y cada lectura queda en la bitácora.',
  },
  schedule: {
    titulo: 'Mi horario',
    pestana: 'Horario',
    icono: Clock,
    descripcion: 'Tus días de trabajo y el descanso que dejas entre citas. Define los horarios que el paciente puede reservar.',
  },
};

const ORDEN_PAGINAS = ['appointments', 'patients', 'schedule'];

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
  // MEMOIZADAS a proposito, no por rendimiento.
  //
  // Construidas en cada render eran un arreglo NUEVO cada vez, y
  // ClinicalNoteEditor tiene un useEffect que depende de `appointments`:
  // identidad nueva -> efecto -> setContent('') -> render -> efecto...
  // React tiraba "Maximum update depth exceeded" en bucle y, peor, el
  // efecto BORRABA la nota en cada vuelta: no se podia escribir.
  const patientAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.patientId === selectedPatientId)
    .sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`)),
  [appointments, selectedPatientId]);

  const patientNotes = useMemo(() => notes
    .filter((note) => note.patientId === selectedPatientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  [notes, selectedPatientId]);

  // Abrir el expediente de un paciente es un ACCESO, y NOM-024 pide
  // auditarlo. Postgres no tiene triggers de SELECT: si la aplicacion no
  // lo pide, la lectura no deja rastro.
  //
  // Las dependencias son el id del paciente y la lista de ids de sus
  // notas, no el arreglo de notas: ese objeto se recrea en cada render y
  // dispararia el efecto —y una entrada de bitacora— con cada tecla.
  const notasVistas = patientNotes.map((note) => note.id).join(',');
  useEffect(() => {
    if (!selectedPatientId || !notasVistas) return;
    logClinicalNoteAccess(notasVistas.split(','))
      .catch((err) => setError(`Se mostró el expediente, pero no se pudo registrar el acceso en la bitácora. ${err.message || ''}`));
  }, [selectedPatientId, notasVistas, setError]);

  // Sin pacientes hay TRES situaciones distintas, y antes las tres se
  // veian igual: este bloque devolvia "Aun no hay pacientes vinculados"
  // ANTES de que se pintara el banner de error, que vive mas abajo y no
  // se alcanzaba nunca.
  //
  // "No hay pacientes" es una afirmacion sobre el EXPEDIENTE, no un
  // estado de pantalla. Si la carga fallo, el doctor leia que su lista
  // esta vacia cuando lo que pasa es que no se pudo consultar — y en un
  // contexto clinico confundir "no se pudo leer" con "no existe" es
  // exactamente el error que no se puede permitir.
  if (!patients.length) {
    return (
      <div className="admin-card" style={{ borderRadius: 16, padding: 34, textAlign: 'center' }}>
        {loading ? (
          <p style={{ color: 'var(--admin-muted)', margin: 0, fontSize: 13 }}>
            Cargando tus pacientes…
          </p>
        ) : error ? (
          <>
            <AlertTriangle size={32} color={C.rustText} style={{ marginBottom: 10 }} aria-hidden="true" />
            <p style={{ color: C.rustText, margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>
              No se pudo cargar tu lista de pacientes.
            </p>
            <p style={{ color: 'var(--admin-muted)', margin: '0 0 14px', fontSize: 12.5, lineHeight: 1.5 }}>
              Esto NO quiere decir que no tengas pacientes: quiere decir que no se pudo consultar. {error}
            </p>
            <button onClick={reload} style={{
              background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border-interactive)',
              color: 'var(--admin-text)', borderRadius: 999, padding: '8px 16px', minHeight: 40,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
            }}>
              Reintentar
            </button>
          </>
        ) : (
          <>
            <User size={32} color="var(--admin-subtle)" style={{ marginBottom: 10 }} aria-hidden="true" />
            <p style={{ color: 'var(--admin-muted)', margin: 0, fontSize: 13 }}>
              Aún no hay pacientes vinculados a tus citas. El paciente se crea al guardar la primera cita a su nombre.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="doctor-maestro-detalle">
      {/* Lista de navegacion, no una reja de tarjetas: son nombres que se
          recorren con la vista. Una tarjeta por paciente pesaba mas que el
          dato que llevaba dentro. */}
      <aside style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
        <div style={{
          color: 'var(--admin-muted)', fontSize: 12, fontWeight: 600,
          padding: '0 0 8px 12px',
        }}>
          {patients.length} {patients.length === 1 ? 'paciente' : 'pacientes'}
        </div>
        <div role="listbox" aria-label="Pacientes" style={{ display: 'grid', gap: 1 }}>
          {patients.map((item) => {
            const activo = selectedPatientId === item.id;
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={activo}
                onClick={() => setSelectedPatientId(item.id)}
                style={{
                  display: 'grid', gap: 2,
                  // La barra de la izquierda dice cual esta abierto sin
                  // encerrar cada nombre en su propia caja.
                  borderLeft: `2px solid ${activo ? C.sageLight : 'transparent'}`,
                  border: 'none', borderLeftWidth: 2, borderLeftStyle: 'solid',
                  borderLeftColor: activo ? C.sageLight : 'transparent',
                  background: activo ? 'var(--admin-surface)' : 'transparent',
                  color: 'var(--admin-text)',
                  borderRadius: '0 10px 10px 0',
                  padding: '10px 12px',
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 150ms',
                }}
              >
                <span style={{ fontWeight: activo ? 700 : 500, fontSize: 13.5 }}>{item.name}</span>
                <span style={{ color: 'var(--admin-muted)', fontSize: 11.5 }}>{item.email}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section style={{ display: 'grid', gap: 28, minWidth: 0 }}>
        {error && (
          <div style={{ background: C.rustAlpha20, border: `1px solid ${C.rustAlpha40}`, color: C.rust, borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 700 }}>
            {error}
          </div>
        )}
        {/* Sin tarjeta: el nombre del paciente ES el encabezado de esta
            columna, y meterlo en una caja lo bajaba al mismo rango visual
            que el resto. Las tres cifras van como una linea legible en vez
            de tres tarjetas que compiten con el contenido real. */}
        <header>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 className="font-display" style={{ margin: 0, fontSize: 26, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--admin-text)' }}>
                {patient?.name}
              </h2>
              <div style={{ color: 'var(--admin-muted)', fontSize: 12.5, marginTop: 5 }}>
                {[patient?.email, patient?.phone].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={reload} disabled={loading} style={ghostButtonStyle}>
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>

          <dl style={{
            display: 'flex', flexWrap: 'wrap', gap: '0 28px', margin: '16px 0 0',
            paddingTop: 14, borderTop: '1px solid var(--admin-border-soft)',
          }}>
            <Dato etiqueta="Citas" valor={patientAppointments.length} />
            <Dato etiqueta="Notas clínicas" valor={patientNotes.length} />
            <Dato
              etiqueta="Última cita"
              valor={patientAppointments[0]
                ? fechaLegible(patientAppointments[0].date, patientAppointments[0].time)
                : 'Sin historial'}
            />
          </dl>
        </header>

        <ClinicalNoteEditor
          patient={patient}
          appointments={patientAppointments}
          session={session}
          therapistId={therapistId}
          setNotes={setNotes}
          setError={setError}
        />

        <section>
          <h3 style={{
            margin: '0 0 12px', color: 'var(--admin-text)',
            fontSize: 15, fontWeight: 600,
          }}>
            Historial de notas
          </h3>
          {patientNotes.length === 0 ? (
            /* Un estado vacio dice que hacer, no solo que no hay nada. */
            <p style={{
              margin: 0, color: 'var(--admin-muted)', fontSize: 13, lineHeight: 1.6,
              padding: '16px 0', borderTop: '1px solid var(--admin-border-soft)',
            }}>
              Todavía no hay notas de este paciente. La primera queda como borrador: puedes
              corregirla hasta que la firmes.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {patientNotes.map((note) => (
                <ClinicalNoteCard key={note.id} note={note} session={session} setNotes={setNotes} setError={setError} />
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function ClinicalNoteEditor({ patient, appointments, session, therapistId, setNotes, setError }) {
  const [appointmentId, setAppointmentId] = useState('');
  const [content, setContent] = useState('');
  const canSave = Boolean(patient?.id && appointmentId && content.trim().length > 0 && content.trim().length <= 5000);

  // Depende del ID de la primera cita y del paciente, no del ARREGLO: un
  // arreglo recreado no debe vaciar lo que el doctor lleva escrito.
  const primeraCitaId = appointments[0]?.id || '';
  useEffect(() => {
    setAppointmentId(primeraCitaId);
    setContent('');
  }, [primeraCitaId, patient?.id]);

  const save = async () => {
    if (!canSave) return;
    setError('');
    try {
      // La nota cuelga del ENCUENTRO, no de la cita: primero se registra
      // que la consulta ocurrio. Si ya se documento antes, se reutiliza el
      // mismo encuentro en vez de crear uno nuevo.
      const encounterId = await ensureEncounter({
        appointmentId,
        patientId: patient.id,
        therapistId,
      });
      const saved = await createClinicalNote({
        encounterId,
        patientId: patient.id,
        content,
      }, session);
      setNotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setContent('');
    } catch (error) {
      setError(error.message || 'No se pudo guardar la nota clínica.');
    }
  };

  return (
    <div className="admin-card" style={{ borderRadius: 14, padding: 18 }}>
      <h3 style={{
        margin: '0 0 4px', color: 'var(--admin-text)', fontSize: 15, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <FileText size={16} aria-hidden="true" style={{ color: 'var(--admin-accent-text)' }} /> Nueva nota clínica
      </h3>
      <p style={{ margin: '0 0 14px', color: 'var(--admin-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
        Se guarda como borrador. Podrás corregirla hasta que la firmes.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabel}>Cita que se documenta</span>
          <select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} className="admin-input" style={fieldInput}>
            <option value="">Selecciona la cita</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                {fechaLegible(appointment.date, appointment.time)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabel}>Nota</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            maxLength={5000}
            placeholder="Lo observado en la sesión, el plan y los acuerdos."
            className="admin-input"
            style={{ ...fieldInput, resize: 'vertical', lineHeight: 1.6 }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ color: content.length > 4500 ? C.caramel : 'var(--admin-muted)', fontSize: 11.5 }}>
            {content.length.toLocaleString('es-MX')} / 5,000
          </span>
          <button onClick={save} disabled={!canSave} style={{ ...smallButtonStyle, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Plus size={14} aria-hidden="true" /> Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}

function ClinicalNoteCard({ note, session, setNotes, setError }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [addingAddendum, setAddingAddendum] = useState(false);
  const { confirmar, dialogo } = useConfirm();
  const [addendum, setAddendum] = useState('');

  const save = async () => {
    setError('');
    try {
      const saved = await updateClinicalNote(note.id, content);
      setNotes((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditing(false);
    } catch (error) {
      // El mensaje de la base dice cuando se firmo y que hacer en su
      // lugar. Sustituirlo por uno generico esconderia justo eso.
      setError(error.message || 'No se pudo editar la nota clínica.');
    }
  };

  // Firmar no se deshace: despues solo quedan los addenda. Por eso se
  // confirma, y el texto dice exactamente que implica.
  const sign = async () => {
    if (!(await confirmar({
      titulo: 'Firmar la nota',
      mensaje: 'Al firmar, la nota queda cerrada: no se podrá editar ni borrar. Solo podrás agregar correcciones como addendum.',
      aceptar: 'Firmar',
    }))) return;
    setError('');
    try {
      const saved = await signClinicalNote(note.id, session);
      setNotes((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (error) {
      setError(error.message || 'No se pudo firmar la nota clínica.');
    }
  };

  const addAddendum = async () => {
    const texto = addendum.trim();
    if (!texto) return;
    setError('');
    try {
      const creado = await addNoteAddendum(note.id, texto, session);
      setNotes((current) => current.map((item) => (
        item.id === note.id ? { ...item, addenda: [...(item.addenda || []), creado] } : item
      )));
      setAddendum('');
      setAddingAddendum(false);
    } catch (error) {
      setError(error.message || 'No se pudo agregar el addendum.');
    }
  };

  return (
    <article style={{ border: '1px solid var(--admin-border)', borderRadius: 12, padding: 14, background: 'var(--admin-surface-soft)' }}>
      {dialogo}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ color: 'var(--admin-muted)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          {new Date(note.createdAt).toLocaleDateString('es-MX')}
          {note.locked ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.sageDeep, fontWeight: 700 }}>
              <Lock size={11} /> Firmada {new Date(note.signedAt).toLocaleDateString('es-MX')}
            </span>
          ) : (
            <span style={{ color: C.caramel, fontWeight: 700 }}>Borrador</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Una nota firmada no ofrece editar ni borrar. Borrar no existe
              en el producto: NOM-004 exige conservar el expediente. */}
          {note.locked ? (
            <button onClick={() => setAddingAddendum((v) => !v)} style={iconButtonStyle} title="Agregar addendum">
              <Plus size={14} />
            </button>
          ) : editing ? (
            <>
              <button onClick={save} style={iconButtonStyle} title="Guardar"><Save size={14} /></button>
              <button onClick={() => { setEditing(false); setContent(note.content); }} style={iconButtonStyle} title="Cancelar"><X size={14} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={iconButtonStyle} title="Editar"><FileText size={14} /></button>
              <button onClick={sign} style={{ ...iconButtonStyle, color: C.sageDeep }} title="Firmar"><Lock size={14} /></button>
            </>
          )}
        </div>
      </div>

      {editing && !note.locked ? (
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={5000} className="admin-input" style={{ ...fieldInput, resize: 'vertical' }} />
      ) : (
        <p style={{ whiteSpace: 'pre-wrap', color: 'var(--admin-row-text)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{note.content}</p>
      )}

      {(note.addenda || []).map((a) => (
        <div key={a.id} style={{ marginTop: 10, paddingLeft: 10, borderLeft: `2px solid ${C.caramelLight}` }}>
          <div style={{ color: 'var(--admin-muted)', fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>
            ADDENDUM · {new Date(a.createdAt).toLocaleDateString('es-MX')}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--admin-row-text)', fontSize: 13, lineHeight: 1.55, margin: '4px 0 0' }}>{a.content}</p>
        </div>
      ))}

      {addingAddendum && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={addendum}
            onChange={(event) => setAddendum(event.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Corrección o nota adicional. Queda fechada y tampoco se podrá editar."
            className="admin-input"
            style={{ ...fieldInput, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={addAddendum} disabled={!addendum.trim()} style={smallButtonStyle}>Agregar addendum</button>
            <button onClick={() => { setAddingAddendum(false); setAddendum(''); }} style={iconButtonStyle}><X size={14} /></button>
          </div>
        </div>
      )}
    </article>
  );
}

// Etiqueta arriba en minusculas y dato abajo. Tres de estos en linea
// pesan menos que tres tarjetas y se leen igual de rapido.
function Dato({ etiqueta, valor }) {
  return (
    <div>
      <dt style={{ color: 'var(--admin-muted)', fontSize: 11.5, fontWeight: 500 }}>{etiqueta}</dt>
      <dd style={{ color: 'var(--admin-text)', fontSize: 15, fontWeight: 600, margin: '3px 0 0' }}>{valor}</dd>
    </div>
  );
}

// '2026-09-01 15:00' no es una fecha que alguien lea entre paciente y
// paciente. localDate evita el desfase de un dia del parseo UTC.
function fechaLegible(iso, hora) {
  if (!iso) return 'Sin historial';
  const d = localDate(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
  return hora ? `${d}, ${hora}` : d;
}

const fieldLabel = { color: 'var(--admin-muted)', fontSize: 12, fontWeight: 500 };
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
const ghostButtonStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  background: 'transparent', border: '1px solid var(--admin-border)',
  color: 'var(--admin-text)', borderRadius: 9,
  minHeight: 36, padding: '0 14px',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
};

const iconButtonStyle = {
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-accent-text)',
  borderRadius: 8,
  padding: 6,
  cursor: 'pointer',
};
