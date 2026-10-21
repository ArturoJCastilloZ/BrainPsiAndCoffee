import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminDashboard, { pasosDeAlta } from '../../src/admin/AdminDashboard';

it('requires only real clinic setup data before marking onboarding complete', () => {
  const initial = pasosDeAlta({ settings: { name: 'Consultorio Aurora', legalName: 'Aurora Legal' }, services: [], therapists: [], locations: [], schedules: [] });
  expect(initial.completos).toBe(1);
  expect(initial.pasos.find((paso) => paso.id === 'schedules').completo).toBe(false);

  const ready = pasosDeAlta({
    settings: { name: 'Consultorio Aurora', legalName: 'Aurora Legal' },
    locations: [{ id: 'loc-1', active: true }],
    services: [{ id: 'service-1', active: true }],
    therapists: [{ id: 'therapist-1', active: true, services: ['service-1'] }],
    schedules: [{ therapistId: 'therapist-1', active: true }],
  });
  expect(ready.completos).toBe(5);
});

it('does not count inactive or disconnected data as a ready clinic', () => {
  const result = pasosDeAlta({
    settings: { name: 'Consultorio Aurora', legalName: 'Aurora Legal' },
    locations: [{ id: 'loc-1', active: false }],
    services: [{ id: 'service-1', active: true }],
    therapists: [{ id: 'therapist-1', active: true, services: ['service-old'] }],
    schedules: [{ therapistId: 'therapist-old', active: true }],
  });
  expect(result.pasos.find((paso) => paso.id === 'locations').completo).toBe(false);
  expect(result.pasos.find((paso) => paso.id === 'therapists').completo).toBe(false);
  expect(result.pasos.find((paso) => paso.id === 'schedules').completo).toBe(false);
});

it('shows the guided setup to every account that reaches the dashboard', () => {
  render(<AdminDashboard bookings={[]} orders={[]} setPage={() => {}} catalogs={{ settings: {}, services: [], therapists: [], locations: [], schedules: [] }} />);
  expect(screen.getByRole('heading', { name: 'Pon tu consultorio en marcha' })).toBeTruthy();
});
