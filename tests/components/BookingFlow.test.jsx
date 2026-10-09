// La reserva publica, usada como la usaria una mamá: con teclado y clics,
// leyendo lo que la pantalla anuncia. Sin red: setBookings es un doble que
// responde como la base.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BookingFlow from '../../src/user/BookingFlow';
import { localISO } from '../../src/localDay.mjs';

const manana = new Date();
manana.setDate(manana.getDate() + 1);
const FECHA = localISO(manana);

const catalogs = {
  services: [{ id: 'sv', name: 'Psicología infantil', duration: 50, price: 550, active: true, for: 'Niños', desc: 'Primera sesión' }],
  therapists: [{
    id: 'tt', name: 'Ana López', specialty: 'Psicología infantil', active: true, services: ['sv'],
    bufferBefore: 0, bufferAfter: 10, slotInterval: 0, minimumNotice: 0,
  }],
  // Atiende todos los dias de 9 a 13: 9:00, 10:00, 11:00, 12:00.
  schedules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ therapistId: 'tt', weekday, startTime: '09:00', endTime: '13:00', active: true })),
  busy: [],
  offers: [],
  settings: null,
};

const montar = ({ ruta = `/reservar?servicio=sv&fecha=${FECHA}&hora=10:00`, setBookings, busy = [] } = {}) => {
  const props = {
    setPage: vi.fn(),
    bookings: [],
    setBookings: setBookings || vi.fn(async (lista) => ({ ok: true, value: lista })),
    setLinkedBookingId: vi.fn(),
    catalogs: { ...catalogs, busy },
    dataLoading: false,
  };
  render(<MemoryRouter initialEntries={[ruta]}><BookingFlow {...props} /></MemoryRouter>);
  return props;
};

const llenarDatos = async (user, { menor = false } = {}) => {
  if (menor) {
    await user.click(screen.getByRole('button', { name: 'Para mi hijo o hija' }));
    await user.type(screen.getByLabelText('Nombre de la niña o el niño'), 'Leo Pérez');
  }
  await user.type(screen.getByLabelText(menor ? 'Tu nombre completo' : 'Nombre completo'), 'Marta Pérez');
  await user.type(screen.getByLabelText('Correo electrónico'), 'marta@ejemplo.mx');
  await user.type(screen.getByLabelText('WhatsApp'), '81 1234 5678');
  await user.click(screen.getByRole('checkbox', { name: /Acepto que me contacten/ }));
};

describe('BookingFlow', () => {
  it('el atajo de la portada llega con dia y hora puestos y deja continuar', async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Elige día y hora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '10:00 horas' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Tus datos' })).toBeTruthy();
  });

  it('una hora que ya se ocupo no deja continuar, y lo dice', () => {
    montar({ busy: [{ therapistId: 'tt', date: FECHA, time: '10:00', durationMinutes: 50, status: 'confirmed' }] });
    expect(screen.getByText(/Las 10:00 ya no está libre/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /10:00 horas, ocupado/ }).disabled).toBe(true);
  });

  it('sin datos: errores junto a cada campo y el foco en el primero', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Para mi hijo o hija' }));
    await user.click(screen.getByRole('button', { name: 'Revisar mi solicitud' }));

    const nino = screen.getByLabelText('Nombre de la niña o el niño');
    expect(document.activeElement).toBe(nino);
    expect(nino.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Escribe el nombre de la niña o el niño.')).toBeTruthy();
    expect(screen.getByText('Escribe tu correo.')).toBeTruthy();
    // Sigue en el mismo paso: nada se envio.
    expect(screen.getByRole('heading', { level: 1, name: 'Tus datos' })).toBeTruthy();
  });

  it('para un menor manda su nombre y al adulto como quien reserva, como solicitud', async () => {
    const user = userEvent.setup();
    const props = montar();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await llenarDatos(user, { menor: true });
    await user.click(screen.getByRole('button', { name: 'Revisar mi solicitud' }));

    const resumen = screen.getByRole('heading', { level: 2, name: 'Psicología infantil' }).closest('div');
    expect(within(resumen).getByText('Leo Pérez')).toBeTruthy();
    expect(within(resumen).getByText('Marta Pérez')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    const [lista] = props.setBookings.mock.calls[0];
    expect(lista.at(-1)).toMatchObject({
      forMinor: true, patientName: 'Leo Pérez', name: 'Marta Pérez',
      therapistId: 'tt', date: FECHA, time: '10:00', status: 'requested',
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Solicitud enviada' })).toBeTruthy();
    expect(props.setLinkedBookingId).toHaveBeenCalled();
  });

  it('si otra persona tomo el horario, regresa al paso de la hora y lo explica', async () => {
    const user = userEvent.setup();
    montar({ setBookings: vi.fn(async () => ({ ok: false, error: { code: '23P01' } })) });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await llenarDatos(user);
    await user.click(screen.getByRole('button', { name: 'Revisar mi solicitud' }));
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Elige día y hora' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/se acaba de ocupar/);
  });

  it('un tope de la reserva publica muestra el mensaje de la base', async () => {
    const user = userEvent.setup();
    const mensaje = 'Ya tienes dos solicitudes por confirmar. Espera a que te confirmemos o escríbenos por WhatsApp.';
    montar({ setBookings: vi.fn(async () => ({ ok: false, error: { code: 'P0429', message: mensaje } })) });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await llenarDatos(user);
    await user.click(screen.getByRole('button', { name: 'Revisar mi solicitud' }));
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(screen.getByRole('alert').textContent).toBe(mensaje);
  });
});
