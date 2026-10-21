import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AppProviders } from '../../src/context/AppContext';
import UserApp from '../../src/user/UserApp';
import AdminCatalog from '../../src/admin/AdminCatalog';
import { firstAllowedAdminPage, canAccessAdminPage } from '../../src/auth/permissions';
import { businessJsonLd } from '../../src/seo/jsonLd.mjs';

const catalogs = (enabled) => ({
  settings: { name: 'Consultorio Prueba', legalName: 'Consultorio Legal', cafeEnabled: enabled },
  services: [], therapists: [], specialties: [], schedules: [], locations: [], busy: [],
  menu: {}, offers: [], productOptions: [],
});
function mountPublic(path = '/', enabled = false) {
  return render(<MemoryRouter initialEntries={[path]}><AppProviders
    data={{ catalogs: catalogs(enabled), bookings: [], orders: [], setBookings: vi.fn(), setOrders: vi.fn(), dataLoading: false }}
    theme={{ theme: 'light', toggleTheme: vi.fn() }}><UserApp /></AppProviders></MemoryRouter>);
}
it('disabled clinic hides cafe navigation, cart and cafe home promotions', () => {
  mountPublic();
  expect(screen.getByRole('heading', { name: 'Un espacio para tu bienestar.' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Cafetería', exact: true })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Tu pedido' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Para quien acompaña' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Consultorio Prueba, inicio' })).toBeTruthy();
});
it.each(['/cafeteria', '/carrito', '/coffee'])('old cafe URL %s leads to therapy when disabled', async (path) => {
  mountPublic(path);
  expect(await screen.findByRole('heading', { name: 'Terapia con precio a la vista.' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Tu pedido' })).toBeNull();
});
it('existing clinics keep the cafe experience when enabled', () => {
  mountPublic('/', true);
  expect(screen.getByRole('heading', { name: 'Un cafecito y lo hablamos.' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Tu pedido' })).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'Cafetería', exact: true }).length).toBeGreaterThan(0);
});
it('disabling cafe keeps historical accounting and personal account routes', () => {
  expect(firstAllowedAdminPage('barista', false)).toBe('cuenta-seguridad');
  expect(firstAllowedAdminPage('admin_cafe', false)).toBe('general-accounting');
  expect(canAccessAdminPage('owner', 'cafe-orders', false)).toBe(false);
  expect(canAccessAdminPage('owner', 'general-accounting', false)).toBe(true);
  expect(canAccessAdminPage('owner', 'clinic-appointments', false)).toBe(true);
  expect(businessJsonLd({ settings: { cafeEnabled: false } })['@type']).toEqual(['MedicalClinic']);
});
it('owner can disable the module without dropping other settings and reloads catalogs', async () => {
  const user = userEvent.setup();
  const setSettings = vi.fn(async () => ({ ok: true }));
  const reload = vi.fn();
  const data = catalogs(true); data.settings.extraSetting = 'preserved';
  render(<AdminCatalog catalogs={data} catalogActions={{ setSettings, reload }} session={{ user: { role: 'owner' } }} initialTab="business" lockedTab />);
  await user.click(screen.getByRole('checkbox', { name: 'Cafetería activa' }));
  await user.click(screen.getByRole('button', { name: 'Guardar negocio' }));
  await waitFor(() => expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ cafeEnabled: false, extraSetting: 'preserved' })));
  expect(reload).toHaveBeenCalledOnce();
  expect(await screen.findByText('Guardado')).toBeTruthy();
});
it('failed settings save does not claim success or reload catalogs', async () => {
  const user = userEvent.setup();
  const reload = vi.fn();
  render(<AdminCatalog catalogs={catalogs(true)} catalogActions={{ setSettings: async () => ({ ok: false, error: new Error('Rejected') }), reload }}
    session={{ user: { role: 'owner' } }} initialTab="business" lockedTab />);
  await user.click(screen.getByRole('button', { name: 'Guardar negocio' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Rejected');
  expect(screen.queryByText('Guardado')).toBeNull();
  expect(reload).not.toHaveBeenCalled();
});
