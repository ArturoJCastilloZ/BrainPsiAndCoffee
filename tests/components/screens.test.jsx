// Pantallas sueltas, montadas con datos de ejemplo y usadas como persona.
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
function AgendaUnaSucursal({ inicial, onGuardar = () => {}, ...props }) {
  const [bookings, setBookings] = useState(inicial);
  return (
    <AdminAppointments bookings={bookings} catalogs={catalogsUnaSucursal} {...props}
      setBookings={(lista) => { onGuardar(lista); setBookings(lista); return Promise.resolve({ ok: true }); }} />
  );
}

describe('Agenda: sucursal en cada cita', () => {
  it('con una sola sucursal, la fila nombra la sucursal de la cita', () => {
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} />);
    expect(screen.getByText(/Sucursal principal/)).toBeTruthy();
  });

  it('una cita sin sucursal no deja separador vacio y con una sola sucursal no hay filtro', () => {
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed', locationId: '' })]} />);
    expect(screen.getByText('Psicología infantil · Ana López · 8112345678')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Filtrar por sucursal' })).toBeNull();
  });
});

describe('Agenda: reagendar una solicitud', () => {
  it('una cita confirmada sigue ofreciendo Reagendar', () => {
    render(<AgendaUnaSucursal inicial={[cita({ status: 'confirmed' })]} />);
    expect(screen.getByRole('button', { name: 'Reagendar la cita de Marta Pérez' })).toBeTruthy();
  });

  it('una solicitud vencida no ofrece Reagendar', () => {
    const hace25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    render(<AgendaUnaSucursal inicial={[cita({ createdAt: hace25h })]} />);
    // La cita sale en Proximas (futura, no cancelada): la ausencia del boton no es por filtro.
    expect(screen.getByText('Marta Pérez')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reagendar/ })).toBeNull();
  });

  it('reagendar una solicitud guarda la nueva hora y la deja por confirmar', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<AgendaUnaSucursal inicial={[cita()]} onGuardar={onGuardar} />);

    await user.click(screen.getByRole('button', { name: 'Reagendar la cita de Marta Pérez' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'HORARIO' }), '11:00');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar.mock.calls.at(-1)[0][0]).toMatchObject({
      id: 'c1', status: 'requested', date: localISO(mananaCitas), time: '11:00', createdAt: creadaAhora,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('el especialista tambien puede reagendar su solicitud', () => {
    render(<AgendaUnaSucursal inicial={[cita()]} lockedTherapistId="tt" embedded />);
    expect(screen.getByRole('button', { name: 'Reagendar la cita de Marta Pérez' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar la solicitud de Marta Pérez' })).toBeTruthy();
  });
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
