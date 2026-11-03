// Pantallas sueltas, montadas con datos de ejemplo y usadas como persona.
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MenuPage from '../../src/user/MenuPage';
import MyBookings from '../../src/user/MyBookings';
import AdminAppointments from '../../src/admin/AdminAppointments';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import { localISO } from '../../src/localDay.mjs';

vi.mock('../../src/monitoring', () => ({ reportError: vi.fn(), trackEvent: vi.fn() }));

describe('Menú: personalizar un café', () => {
  const catalogs = {
    menu: { hot: { title: 'Bebidas calientes', items: [{ id: 'p1', name: 'Activación', sub: 'Espresso', price: 30, category: 'hot' }] } },
    productOptions: [
      { id: 'm1', kind: 'milk', name: 'Entera', priceDelta: 0, active: true },
      { id: 'm2', kind: 'milk', name: 'Avena', priceDelta: 10, active: true },
    ],
    offers: [],
  };

  it('abre un dialogo modal con nombre, manda los IDS de lo elegido y Escape lo cierra', async () => {
    const user = userEvent.setup();
    const addToCart = vi.fn();
    render(<MemoryRouter><MenuPage addToCart={addToCart} catalogs={catalogs} dataLoading={false} /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Personalizar Activación' }));
    const dialogo = screen.getByRole('dialog', { name: 'Activación' });
    expect(dialogo.hasAttribute('open')).toBe(true);

    await user.click(within(dialogo).getByRole('button', { name: /Avena/ }));
    expect(within(dialogo).getByRole('button', { name: /Agregar a mi pedido/ }).textContent).toContain('$40');
    await user.click(within(dialogo).getByRole('button', { name: /Agregar a mi pedido/ }));
    // El servidor valida por id: un nombre no se puede comprobar (0023).
    expect(addToCart).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), expect.objectContaining({ optionIds: ['m2'], totalPrice: 40 }));

    await user.click(screen.getByRole('button', { name: 'Personalizar Activación' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Mis citas', () => {
  it('solo muestra lo pedido desde este navegador y no ofrece cambios que no se guardan', () => {
    const bookings = [
      { id: 'mia', serviceId: 'sv', therapistId: 'tt', date: '2099-01-10', time: '10:00', name: 'Marta', forMinor: true, patientName: 'Leo', status: 'requested', createdAt: new Date().toISOString() },
      { id: 'ajena', serviceId: 'sv', therapistId: 'tt', date: '2099-01-11', time: '11:00', name: 'Otra Persona', status: 'confirmed' },
    ];
    render(
      <MemoryRouter>
        <MyBookings bookings={bookings} misCitas={['mia']} catalogs={{ services: [{ id: 'sv', name: 'Psicología infantil' }], therapists: [] }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Leo')).toBeTruthy();
    expect(screen.getByText('Por confirmar')).toBeTruthy();
    expect(screen.queryByText('Otra Persona')).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancelar|Reagendar/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Cambiar o cancelar por WhatsApp' })).toBeTruthy();
  });
});

describe('Agenda del admin: solicitudes', () => {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const catalogs = {
    services: [{ id: 'sv', name: 'Psicología infantil', duration: 50, price: 550 }],
    therapists: [{ id: 'tt', name: 'Ana López', services: ['sv'] }],
    schedules: [],
  };

  // La pantalla es controlada: el doble guarda lo que setBookings recibe.
  function Agenda({ inicial, onGuardar }) {
    const [bookings, setBookings] = useState(inicial);
    return (
      <AdminAppointments bookings={bookings} catalogs={catalogs}
        setBookings={(lista) => { onGuardar(lista); setBookings(lista); return Promise.resolve({ ok: true }); }} />
    );
  }

  it('confirmar una solicitud la pasa a confirmada, nombrando al menor y no a quien reservo', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<Agenda onGuardar={onGuardar} inicial={[{
      id: 'c1', serviceId: 'sv', therapistId: 'tt', date: localISO(manana), time: '10:00',
      name: 'Marta Pérez', forMinor: true, patientName: 'Leo Pérez', email: 'm@x.mx', phone: '8112345678',
      status: 'requested', createdAt: new Date().toISOString(),
    }]} />);

    await user.click(screen.getByRole('button', { name: /Por confirmar \(1\)/ }));
    expect(screen.getByText('Leo Pérez (con Marta Pérez)')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirmar la solicitud de Leo Pérez' }));
    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({ id: 'c1', status: 'confirmed' });
  });
});

// Fixture de las agendas de sucursal y reagendado: 60 min sin buffers
// da los horarios 09:00, 10:00, 11:00 y 12:00 (agenda.mjs).
const mananaCitas = new Date();
mananaCitas.setDate(mananaCitas.getDate() + 1);
const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ therapistId: 'tt', weekday, startTime: '09:00', endTime: '13:00', active: true }));
const catalogsUnaSucursal = {
  services: [{ id: 'sv', name: 'Psicología infantil', duration: 60, price: 550 }],
  therapists: [{ id: 'tt', name: 'Ana López', services: ['sv'] }],
  schedules: HORARIO,
  locations: [{ id: 'principal', name: 'Sucursal principal', active: true }],
};
const creadaAhora = new Date().toISOString();
const cita = (over) => ({
  id: 'c1', serviceId: 'sv', therapistId: 'tt', date: localISO(mananaCitas), time: '10:00',
  name: 'Marta Pérez', email: 'm@x.mx', phone: '8112345678', locationId: 'principal',
  status: 'requested', createdAt: creadaAhora, durationMinutes: 60, ...over,
});

// Doble controlado propio: no comparte catalogs con 'solicitudes'.
// `guardar` decide lo que responde el guardado (por defecto, ok).
function AgendaUnaSucursal({ inicial, onGuardar = () => {}, guardar = () => Promise.resolve({ ok: true }), ...props }) {
  const [bookings, setBookings] = useState(inicial);
  return (
    <AdminAppointments bookings={bookings} catalogs={catalogsUnaSucursal} {...props}
      setBookings={(lista) => { onGuardar(lista); setBookings(lista); return guardar(lista); }} />
  );
}

// Igual, pero deja cambiar las citas desde fuera (otra sesion, recarga).
function AgendaExterna({ inicial, onGuardar = () => {}, exponer }) {
  const [bookings, setBookings] = useState(inicial);
  exponer(setBookings);
  return (
    <AdminAppointments bookings={bookings} catalogs={catalogsUnaSucursal}
      setBookings={(lista) => { onGuardar(lista); setBookings(lista); return Promise.resolve({ ok: true }); }} />
  );
}

const ABRIR_MARTA = 'Abrir cita de Marta Pérez, 10:00';
// Abre el panel de la cita desde su fila y lo devuelve.
async function abrirPanel(user, nombre = ABRIR_MARTA) {
  await user.click(screen.getByRole('button', { name: nombre }));
  return screen.getByRole('dialog', { name: 'Cita de Marta Pérez' });
}

describe('Agenda: sucursal en cada cita', () => {
  it('con una sola sucursal, la fila nombra la sucursal de la cita', () => {
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} />);
    expect(screen.getByText(/Sucursal principal/)).toBeTruthy();
  });

  it('la linea de detalle lleva title con el texto completo por si se corta', () => {
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} />);
    const detalle = screen.getByText(/Sucursal principal/);
    expect(detalle.getAttribute('title')).toBe('Psicología infantil · Ana López · Sucursal principal · 8112345678');
    expect(detalle.classList.contains('cita-detalle')).toBe(true);
  });

  it('una cita sin sucursal no deja separador vacio y con una sola sucursal no hay filtro', () => {
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed', locationId: '' })]} />);
    expect(screen.getByText('Psicología infantil · Ana López · 8112345678')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Filtrar por sucursal' })).toBeNull();
  });
});

describe('Agenda: reagendar una solicitud', () => {
  it('una cita confirmada abre su panel con Fecha y Horario editables', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} />);
    const dialogo = await abrirPanel(user);
    expect(within(dialogo).getByRole('combobox', { name: 'Fecha' })).toBeTruthy();
    expect(within(dialogo).getByRole('combobox', { name: 'Horario' })).toBeTruthy();
  });

  it('una solicitud vencida se confirma o rechaza sin editar fecha ni horario', async () => {
    const user = userEvent.setup();
    const hace25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    render(<AgendaUnaSucursal inicial={[cita({ createdAt: hace25h })]} />);
    // La cita sale en Proximas (futura, no cancelada): lo que falte no es por filtro.
    expect(screen.getByText('Marta Pérez')).toBeTruthy();
    // Como hoy: la fila de una vencida conserva Confirmar.
    expect(screen.getByRole('button', { name: 'Confirmar la solicitud de Marta Pérez' })).toBeTruthy();

    const dialogo = await abrirPanel(user);
    expect(within(dialogo).getByText('Vencida')).toBeTruthy();
    expect(within(dialogo).queryByRole('combobox', { name: 'Fecha' })).toBeNull();
    expect(within(dialogo).queryByRole('combobox', { name: 'Horario' })).toBeNull();
    expect(within(dialogo).getByRole('button', { name: 'Confirmar' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Rechazar' })).toBeTruthy();
  });

  it('reagendar una solicitud guarda la nueva hora y la deja por confirmar', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);

    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({
      id: 'c1', status: 'requested', date: localISO(mananaCitas), time: '11:00', createdAt: creadaAhora,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('el especialista tambien puede reagendar su solicitud', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} lockedTherapistId="tt" embedded />);
    expect(screen.getByRole('button', { name: 'Confirmar la solicitud de Marta Pérez' })).toBeTruthy();
    const dialogo = await abrirPanel(user);
    expect(within(dialogo).getByRole('combobox', { name: 'Fecha' })).toBeTruthy();
    expect(within(dialogo).getByRole('combobox', { name: 'Horario' })).toBeTruthy();
    expect(within(dialogo).queryByRole('combobox', { name: /Especialista/ })).toBeNull();
  });
});

describe('Agenda: panel de la cita', () => {
  const pasadoManana = new Date();
  pasadoManana.setDate(pasadoManana.getDate() + 2);

  it('la fila expone un solo boton para abrir la cita, sin interactivos anidados', () => {
    render(<AgendaUnaSucursal inicial={[cita()]} />);
    const abrir = screen.getAllByRole('button', { name: /^Abrir cita de/ });
    expect(abrir).toHaveLength(1);
    // El estado llega al lector por aria-describedby, con texto.
    expect(screen.getByRole('button', { name: ABRIR_MARTA, description: 'Por confirmar' })).toBe(abrir[0]);
    expect(abrir[0].getAttribute('aria-haspopup')).toBe('dialog');
    expect(document.querySelectorAll('button button, button a, a button, [role=button] button')).toHaveLength(0);
  });

  it('Enter y Espacio en el boton abren el panel con el foco en el titulo', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} />);

    screen.getByRole('button', { name: ABRIR_MARTA }).focus();
    await user.keyboard('{Enter}');
    let dialogo = screen.getByRole('dialog', { name: 'Cita de Marta Pérez' });
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.tagName).toBe('H2');
    expect(dialogo.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: ABRIR_MARTA }));

    await user.keyboard(' ');
    dialogo = screen.getByRole('dialog', { name: 'Cita de Marta Pérez' });
    expect(document.activeElement.tagName).toBe('H2');
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it('el panel muestra servicio, especialista, sucursal, telefono y correo completos', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed', notes: 'Prefiere horario de mañana.' })]} />);
    const dialogo = await abrirPanel(user);
    for (const [termino, valor] of [
      ['Servicio', 'Psicología infantil'], ['Especialista', 'Ana López'], ['Sucursal', 'Sucursal principal'],
      ['Teléfono', '8112345678'], ['Correo', 'm@x.mx'],
    ]) {
      const dt = within(dialogo).getByText(termino);
      expect(dt.tagName).toBe('DT');
      expect(dt.nextElementSibling.textContent).toBe(valor);
      expect(dt.nextElementSibling.hasAttribute('title')).toBe(false);
    }
    expect(within(dialogo).getByText('Prefiere horario de mañana.')).toBeTruthy();
  });

  it('marcar completada guarda el estado y devuelve el foco al boton de la fila', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);
    await user.click(within(dialogo).getByRole('button', { name: 'Marcar completada' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({ id: 'c1', status: 'completed' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: ABRIR_MARTA }));
  });

  it('cancelar cita pide confirmacion dentro del panel y Esc solo cierra la confirmacion', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    const confirmar = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar cita' }));
    expect(within(dialogo).getByRole('group', { name: /^¿Cancelar la cita de Marta Pérez, .* a las 10:00\? El horario quedará libre\.$/ })).toBeTruthy();
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Conservar cita' }));

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Cita de Marta Pérez' })).toBe(dialogo);
    expect(within(dialogo).queryByRole('group', { name: /^¿Cancelar/ })).toBeNull();
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Cancelar cita' }));
    expect(onGuardar).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar cita' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Sí, cancelar cita' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({ id: 'c1', status: 'cancelled' });
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('rechazar una solicitud pide confirmacion y la cancela', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);

    await user.click(within(dialogo).getByRole('button', { name: 'Rechazar' }));
    expect(within(dialogo).getByRole('group', { name: /^¿Rechazar la solicitud de Marta Pérez, .* a las 10:00\? El horario quedará libre\.$/ })).toBeTruthy();
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Conservar solicitud' }));
    expect(onGuardar).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole('button', { name: 'Sí, rechazar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({ id: 'c1', status: 'cancelled' });
  });

  it('confirmar desde el panel con otro horario guarda fecha, hora y estado en una sola escritura', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar.mock.calls[0][0][0]).toMatchObject({
      id: 'c1', status: 'confirmed', date: localISO(mananaCitas), time: '11:00', createdAt: creadaAhora,
    });
  });

  it('guardar sin horario marca el campo invalido y lleva el foco ahi', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Fecha' }), localISO(pasadoManana));
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    const horario = within(dialogo).getByRole('combobox', { name: 'Horario', description: 'Elige un horario.' });
    expect(horario.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(horario);
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('cambiar la fecha reinicia el horario y lo anuncia', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} />);
    const dialogo = await abrirPanel(user);
    expect(within(dialogo).getByRole('status').textContent).toBe('');
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Fecha' }), localISO(pasadoManana));

    expect(within(dialogo).getByRole('combobox', { name: 'Horario' }).value).toBe('');
    expect(within(dialogo).getByRole('status').textContent).toBe('Horario reiniciado: elige un horario.');
  });

  it('si el guardado falla el panel sigue abierto con el borrador y un aviso', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} guardar={() => Promise.resolve({ ok: false })} />);
    const dialogo = await abrirPanel(user);
    // La region de alerta ya esta montada y vacia: solo cambia su texto.
    const alerta = within(dialogo).getByRole('alert');
    expect(alerta.textContent).toBe('');

    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(alerta.textContent).toBe('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'));
    expect(screen.getByRole('dialog', { name: 'Cita de Marta Pérez' })).toBe(dialogo);
    expect(within(dialogo).getByRole('combobox', { name: 'Horario' }).value).toBe('11:00');
    // El foco no se queda en un boton que estuvo deshabilitado: va al aviso.
    expect(document.activeElement).toBe(alerta);
  });

  it('mientras guarda los botones se deshabilitan y dicen Guardando', async () => {
    const user = userEvent.setup();
    let resolver;
    render(<AgendaUnaSucursal inicial={[cita()]} guardar={() => new Promise((r) => { resolver = r; })} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    expect(within(dialogo).getByRole('button', { name: 'Guardando…' }).disabled).toBe(true);
    expect(within(dialogo).getByRole('button', { name: 'Rechazar' }).disabled).toBe(true);
    expect(within(dialogo).getByRole('button', { name: 'Cerrar' }).disabled).toBe(true);
    within(dialogo).getByRole('heading', { name: 'Cita de Marta Pérez' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Cita de Marta Pérez' })).toBe(dialogo);

    await act(async () => { resolver({ ok: true }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Esc con cambios sin guardar pregunta antes de descartar; sin cambios cierra', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');

    await user.keyboard('{Escape}');
    expect(within(dialogo).getByRole('group', { name: 'Cambiaste la fecha o el horario y no lo guardaste.' })).toBeTruthy();
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Seguir editando' }));

    await user.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }));
    expect(document.activeElement).toBe(within(dialogo).getByRole('combobox', { name: 'Fecha' }));
    expect(within(dialogo).getByRole('combobox', { name: 'Horario' }).value).toBe('11:00');

    await user.keyboard('{Escape}');
    await user.click(within(dialogo).getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: ABRIR_MARTA }));
    expect(onGuardar).not.toHaveBeenCalled();

    await abrirPanel(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('una cita completada o cancelada se abre solo para lectura', async () => {
    const user = userEvent.setup();
    const casos = [
      { status: 'completed', texto: 'Esta cita ya está completada; no se puede editar.' },
      { status: 'cancelled', texto: 'Esta cita está cancelada; no se puede editar.' },
    ];
    for (const { status, texto } of casos) {
      const { unmount } = render(<AgendaUnaSucursal inicial={[cita({ status })]} />);
      // Las canceladas no salen en Proximas.
      if (status === 'cancelled') await user.click(screen.getByRole('button', { name: 'Canceladas' }));
      const dialogo = await abrirPanel(user);
      expect(within(dialogo).getByText(texto)).toBeTruthy();
      expect(within(dialogo).queryAllByRole('combobox')).toHaveLength(0);
      expect(within(dialogo).getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent)).toEqual(['Cerrar']);
      unmount();
    }
  });

  it('al cancelar una cita que sale de la lista el foco cae en la lista', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} />);
    const dialogo = await abrirPanel(user);
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar cita' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Sí, cancelar cita' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: ABRIR_MARTA })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Lista de citas' }));
  });

  it('clic en el fondo del panel lo cierra', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} />);
    const dialogo = await abrirPanel(user);
    fireEvent.mouseDown(dialogo);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Agenda: panel de la cita, errores y cierre', () => {
  const pasadoManana = new Date();
  pasadoManana.setDate(pasadoManana.getDate() + 2);
  const OCUPADO = 'Ese horario ya no está disponible. Selecciona otro horario.';
  // Otra cita confirmada del mismo especialista a las 10:00: ocupa el horario.
  const otra = cita({ id: 'c2', name: 'Luis Treviño', email: 'l@x.mx', status: 'confirmed' });

  it('si guardar lanza un error el panel lo muestra y no deja la promesa sin manejar', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} guardar={() => Promise.reject(new Error('sin red'))} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    const alerta = within(dialogo).getByRole('alert');
    await waitFor(() => expect(alerta.textContent).toBe('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'));
    expect(screen.getByRole('dialog', { name: 'Cita de Marta Pérez' })).toBe(dialogo);
    expect(document.activeElement).toBe(alerta);
  });

  it('un horario ocupado se liga al select de Horario, recibe el foco y se limpia al cambiar Fecha u Horario', async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      for (const cambio of ['Horario', 'Fecha']) {
        const user = userEvent.setup();
        const onGuardar = vi.fn();
        let setLista;
        const { unmount } = render(<AgendaExterna inicial={[cita()]} onGuardar={onGuardar} exponer={(f) => { setLista = f; }} />);
        const dialogo = await abrirPanel(user);
        await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');
        // Mientras tanto, otra cita toma las 11:00.
        act(() => setLista([cita(), cita({ id: 'c2', name: 'Luis Treviño', time: '11:00', status: 'confirmed' })]));
        await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

        const horario = within(dialogo).getByRole('combobox', { name: 'Horario', description: OCUPADO });
        expect(horario.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(horario);
        expect(scroll).toHaveBeenCalled();
        expect(scroll.mock.contexts.at(-1).textContent).toBe(OCUPADO);
        expect(within(dialogo).getByRole('alert').textContent).toBe('');
        expect(onGuardar).not.toHaveBeenCalled();

        if (cambio === 'Horario') await user.selectOptions(horario, '12:00');
        else await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Fecha' }), localISO(pasadoManana));
        expect(horario.hasAttribute('aria-invalid')).toBe(false);
        expect(within(dialogo).queryByText(OCUPADO)).toBeNull();
        unmount();
      }
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('confirmar una solicitud vencida valida que el horario siga libre', async () => {
    const user = userEvent.setup();
    const hace25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const onGuardar = vi.fn();
    const { unmount } = render(<AgendaUnaSucursal inicial={[cita({ createdAt: hace25h }), otra]} onGuardar={onGuardar} />);
    let dialogo = await abrirPanel(user);
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    const alerta = within(dialogo).getByRole('alert');
    expect(alerta.textContent).toBe(OCUPADO);
    expect(document.activeElement).toBe(alerta);
    expect(onGuardar).not.toHaveBeenCalled();
    unmount();

    // Con el horario libre, confirmar la vencida funciona como hoy.
    render(<AgendaUnaSucursal inicial={[cita({ createdAt: hace25h })]} onGuardar={onGuardar} />);
    dialogo = await abrirPanel(user);
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({ id: 'c1', status: 'confirmed' });
  });
});

describe('Agenda: panel de la cita, Esc nunca descarta un borrador', () => {
  it('el panel intercepta Esc y ninguna secuencia de Esc cierra con cambios sin guardar', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');

    // Chrome ignora preventDefault de 'cancel' sin activacion de usuario:
    // el panel corta Esc en el keydown, antes de que llegue al navegador.
    expect(fireEvent.keyDown(within(dialogo).getByRole('combobox', { name: 'Fecha' }), { key: 'Escape' })).toBe(false);
    for (let i = 0; i < 4; i += 1) {
      await user.keyboard('{Escape}');
      expect(screen.getByRole('dialog', { name: 'Cita de Marta Pérez' })).toBe(dialogo);
    }
    expect(within(dialogo).getByRole('combobox', { name: 'Horario' }).value).toBe('11:00');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('si el navegador cierra el panel con cambios sin guardar, lo reabre con el borrador y pregunta', async () => {
    const user = userEvent.setup();
    render(<AgendaUnaSucursal inicial={[cita()]} />);
    const dialogo = await abrirPanel(user);
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00');

    act(() => dialogo.close());
    expect(screen.getByRole('dialog', { name: 'Cita de Marta Pérez' })).toBe(dialogo);
    expect(dialogo.hasAttribute('open')).toBe(true);
    expect(within(dialogo).getByRole('group', { name: 'Cambiaste la fecha o el horario y no lo guardaste.' })).toBeTruthy();
    expect(within(dialogo).getByRole('combobox', { name: 'Horario' }).value).toBe('11:00');
  });
});

describe('Agenda: la cita abierta desaparece', () => {
  it('el panel se cierra, el foco cae en el encabezado del dia y no se reabre solo', async () => {
    const user = userEvent.setup();
    let setLista;
    const luis = cita({ id: 'c2', name: 'Luis Treviño', time: '11:00', status: 'confirmed' });
    render(<AgendaExterna inicial={[cita(), luis]} exponer={(f) => { setLista = f; }} />);
    await abrirPanel(user);

    act(() => setLista([luis]));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^Mañana · / }));

    act(() => setLista([cita(), luis]));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('si la lista queda vacia el foco cae en la lista', async () => {
    const user = userEvent.setup();
    let setLista;
    render(<AgendaExterna inicial={[cita()]} exponer={(f) => { setLista = f; }} />);
    await abrirPanel(user);

    act(() => setLista([]));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Lista de citas' }));
  });
});

describe('Agenda: el resultado de cada accion del panel se anuncia', () => {
  const pulsar = (nombre) => async (user, dialogo) => user.click(within(dialogo).getByRole('button', { name: nombre }));
  const casos = [
    { titulo: 'Confirmar', inicial: cita(), pasos: [pulsar('Confirmar')], texto: 'Cita confirmada.' },
    { titulo: 'Rechazar', inicial: cita(), pasos: [pulsar('Rechazar'), pulsar('Sí, rechazar')], texto: 'Solicitud rechazada.' },
    { titulo: 'Cancelar cita', inicial: cita({ status: 'confirmed' }), pasos: [pulsar('Cancelar cita'), pulsar('Sí, cancelar cita')], texto: 'Cita cancelada.' },
    { titulo: 'Marcar completada', inicial: cita({ status: 'confirmed' }), pasos: [pulsar('Marcar completada')], texto: 'Cita marcada como completada.' },
    {
      titulo: 'Guardar cambios', inicial: cita(), texto: 'Cambios guardados.',
      pasos: [
        async (user, dialogo) => user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Horario' }), '11:00'),
        pulsar('Guardar cambios'),
      ],
    },
  ];

  for (const { titulo, inicial, pasos, texto } of casos) {
    it(`${titulo} anuncia "${texto}" en una region fuera del panel`, async () => {
      const user = userEvent.setup();
      render(<AgendaUnaSucursal inicial={[inicial]} />);
      // Montada vacia antes de abrir el panel, y fuera de el.
      const anuncio = screen.getByRole('status');
      expect(anuncio.textContent).toBe('');
      const dialogo = await abrirPanel(user);
      expect(dialogo.contains(anuncio)).toBe(false);
      for (const paso of pasos) await paso(user, dialogo);

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(anuncio.textContent).toBe(texto);
    });
  }
});

describe('ErrorBoundary', () => {
  function Rompe({ rompe }) {
    if (rompe) throw new Error('fallo de render');
    return <p>Pantalla bien</p>;
  }

  it('un error de render no deja la pagina en blanco, y cambiar de ruta la recupera', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Rompe rompe /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toMatch(/Algo falló/);
    rerender(<ErrorBoundary resetKey="/b"><Rompe rompe={false} /></ErrorBoundary>);
    expect(screen.getByText('Pantalla bien')).toBeTruthy();
  });
});
