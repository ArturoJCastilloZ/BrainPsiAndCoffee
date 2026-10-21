import React, { useState } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import SessionScope from '../../src/auth/SessionScope';
import { useSupabaseCrud } from '../../src/hooks/useSupabaseCrud';

const api = vi.hoisted(() => ({
  loadCatalogs: vi.fn(), loadAppointments: vi.fn(), loadOrders: vi.fn(),
  saveAppointments: vi.fn(), saveMenu: vi.fn(), saveOffers: vi.fn(),
  saveProductOptions: vi.fn(), saveOrders: vi.fn(), saveSpecialties: vi.fn(),
  saveSettings: vi.fn(), saveServices: vi.fn(), saveTherapists: vi.fn(), saveLocations: vi.fn(),
}));
vi.mock('../../src/api/supabaseData', () => api);
vi.mock('../../src/api/supabaseClient', () => ({ hasSupabaseConfig: true, getSupabase: async () => null }));

const session = (tenantId = 'a', id = 'doctor') => ({
  user: { id, tenantId, role: 'doctor', therapistId: 'shared-id' }, aal: 'aal1',
});
const catalogs = (name) => ({ services: [{ id: name }], specialties: [], therapists: [], offers: [] });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function Workspace({ session }) {
  const data = useSupabaseCrud(session);
  const [draft, setDraft] = useState('');
  return <>
    <input aria-label="Borrador" value={draft} onChange={(e) => setDraft(e.target.value)} />
    <output data-testid="data">{JSON.stringify({ services: data.catalogs.services, bookings: data.bookings, loading: data.loading })}</output>
  </>;
}
const tree = (current) => <SessionScope session={current}><Workspace session={current} /></SessionScope>;
beforeEach(() => {
  vi.resetAllMocks();
  api.loadCatalogs.mockResolvedValue(catalogs('a'));
  api.loadAppointments.mockResolvedValue([{ id: 'patient-a' }]);
  api.loadOrders.mockResolvedValue([]);
});

it('limpia datos y borradores al cambiar de clínica con el mismo rol', async () => {
  const view = render(tree(session()));
  await screen.findByText(/patient-a/);
  fireEvent.change(screen.getByLabelText('Borrador'), { target: { value: 'Nota clínica A' } });
  const pending = deferred();
  api.loadCatalogs.mockReturnValueOnce(pending.promise);
  api.loadAppointments.mockResolvedValue([{ id: 'patient-b' }]);
  view.rerender(tree(session('b')));
  expect(screen.getByTestId('data').textContent).not.toMatch(/patient-a|"id":"a"/);
  expect(screen.getByLabelText('Borrador').value).toBe('');
  await act(async () => pending.resolve(catalogs('b')));
  await screen.findByText(/patient-b/);
  expect(api.loadCatalogs).toHaveBeenCalledTimes(2);
});

it('descarta una respuesta de citas de la clínica anterior que llega tarde', async () => {
  const pending = deferred();
  api.loadAppointments.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([{ id: 'patient-b' }]);
  const view = render(tree(session()));
  await waitFor(() => expect(api.loadAppointments).toHaveBeenCalledOnce());
  api.loadCatalogs.mockResolvedValue(catalogs('b'));
  view.rerender(tree(session('b')));
  await screen.findByText(/patient-b/);
  await act(async () => pending.resolve([{ id: 'late-patient-a' }]));
  expect(screen.getByTestId('data').textContent).toMatch(/patient-b/);
  expect(screen.getByTestId('data').textContent).not.toMatch(/late-patient-a/);
});

it('un catálogo tardío no inicia consultas privadas con el contexto nuevo', async () => {
  const pending = deferred();
  api.loadCatalogs.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(catalogs('b'));
  const view = render(tree(session()));
  view.rerender(tree(session('b')));
  await waitFor(() => expect(api.loadAppointments).toHaveBeenCalledOnce());
  await act(async () => pending.resolve(catalogs('late-a')));
  expect(api.loadAppointments).toHaveBeenCalledOnce();
  expect(screen.getByTestId('data').textContent).not.toMatch(/late-a/);
});

it('refrescar token y actividad conserva borrador y no recarga datos', async () => {
  const current = session();
  const view = render(tree(current));
  await screen.findByText(/patient-a/);
  fireEvent.change(screen.getByLabelText('Borrador'), { target: { value: 'En edición' } });
  view.rerender(tree({ ...current, user: { ...current.user }, accessToken: 'renewed', expiresAt: Date.now() }));
  expect(screen.getByLabelText('Borrador').value).toBe('En edición');
  expect(api.loadCatalogs).toHaveBeenCalledOnce();
});

it.each(['cuenta', 'rol', 'especialista', 'aal', 'contraseña', 'logout'])('reinicia memoria al cambiar %s', async (change) => {
  const view = render(tree(session()));
  await screen.findByText(/patient-a/);
  fireEvent.change(screen.getByLabelText('Borrador'), { target: { value: 'Privado' } });
  const next = session();
  if (change === 'cuenta') next.user.id = 'other-user';
  if (change === 'rol') next.user.role = 'admin_consultorio';
  if (change === 'especialista') next.user.therapistId = 'other';
  if (change === 'aal') next.aal = 'aal2';
  if (change === 'contraseña') next.user.mustChangePassword = true;
  api.loadCatalogs.mockReturnValueOnce(new Promise(() => {}));
  view.rerender(tree(change === 'logout' ? null : next));
  expect(screen.getByLabelText('Borrador').value).toBe('');
  expect(screen.getByTestId('data').textContent).not.toMatch(/patient-a/);
});
