// El KPI "Total citas activas" cuenta lo que sigue vivo en la agenda:
// confirmadas y solicitudes vigentes (misma regla de vencida que 0049).
import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminDashboard from '../../src/admin/AdminDashboard';
import { localISO } from '../../src/localDay.mjs';

vi.mock('../../src/monitoring', () => ({ reportError: vi.fn(), trackEvent: vi.fn() }));

it('Total citas activas cuenta confirmadas y solicitudes vigentes, no vencidas, canceladas ni completadas', () => {
  const enTresDias = new Date();
  enTresDias.setDate(enTresDias.getDate() + 3);
  const ahora = new Date().toISOString();
  const hace25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const base = { serviceId: 'sv', therapistId: 'tt', date: localISO(enTresDias), time: '10:00', name: 'Paciente' };
  const bookings = [
    { ...base, id: 'b1', status: 'confirmed', createdAt: ahora },
    { ...base, id: 'b2', status: 'requested', createdAt: ahora },
    { ...base, id: 'b3', status: 'requested', createdAt: hace25h },
    { ...base, id: 'b4', status: 'cancelled', createdAt: ahora },
    { ...base, id: 'b5', status: 'completed', createdAt: ahora },
  ];

  render(<AdminDashboard bookings={bookings} orders={[]} setPage={() => {}}
    catalogs={{ settings: {}, services: [], therapists: [], locations: [], schedules: [] }} />);

  expect(screen.getByText('Total citas activas').closest('button').textContent).toMatch(/Total citas activas\s*2(?!\d)/);
  expect(screen.getByText('Solicitudes por confirmar').closest('button').textContent).toMatch(/1(?!\d)/);
});
