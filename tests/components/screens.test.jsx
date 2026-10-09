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
