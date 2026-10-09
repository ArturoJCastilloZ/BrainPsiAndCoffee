// El menu del panel muestra a cada rol solo lo suyo.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProviders } from '../../src/context/AppContext';

vi.mock('../../src/api/supabaseData', () => new Proxy({}, {
  get: () => vi.fn(async () => []),
}));
vi.mock('../../src/components/useMfaExigida', () => ({ useMfaExigida: () => false }));

import AdminApp from '../../src/admin/AdminApp';

const montar = (role) => render(
  <AppProviders
    data={{
      session: { aal: 'aal1', user: { role, name: 'Prueba', tenantId: 't1' } },
      bookings: [], setBookings: vi.fn(), orders: [], setOrders: vi.fn(),
      catalogs: { services: [], therapists: [], specialties: [], schedules: [], menu: {}, offers: [], productOptions: [], settings: {} },
      catalogActions: { reload: vi.fn() }, dataLoading: false, reload: vi.fn(),
    }}
    theme={{ theme: 'light', isDark: false, toggleTheme: vi.fn() }}>
    <AdminApp switchToUser={vi.fn()} logout={vi.fn()} />
  </AppProviders>,
);

describe('Menu del panel', () => {
  it('el barista ve Cafeteria y Mi cuenta, no "Administracion general"', () => {
    montar('barista');
    expect(screen.queryByText(/Administración general/i)).toBeNull();
    expect(screen.getAllByText('Mi cuenta').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Seguridad/, hidden: true }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Derechos ARCO/, hidden: true })).toBeNull();
  });

  it('el dueño ve Administracion general con ARCO, y Seguridad en Mi cuenta', () => {
    montar('owner');
    expect(screen.getAllByText(/Administración general/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Derechos ARCO/, hidden: true }).length).toBeGreaterThan(0);
  });
});
