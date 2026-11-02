// El login vive dentro de SessionScope (App.jsx). Entrar con contraseña
// crea la sesion aal1 y cambia la clave del scope: React remonta Login.
// El paso del codigo y el aviso de "sin permisos" tienen que sobrevivir a
// ese remontaje; antes se perdian y habia que escribir la contraseña dos
// veces para llegar al codigo.
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(), signOut: vi.fn(), getSession: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(), onAuthStateChange: vi.fn(),
  listFactors: vi.fn(), challengeAndVerify: vi.fn(),
}));
vi.mock('../../src/api/supabaseClient', () => {
  const client = { auth: { ...mocks, mfa: mocks } };
  return {
    conCliente: async () => client, getSupabase: async () => client,
    peekSupabase: () => client, hasSupabaseConfig: true,
    necesitaClienteAlArrancar: () => false,
  };
});
import { authService } from '../../src/auth/authService';
import { useAuthSession } from '../../src/auth/useAuth';
import SessionScope from '../../src/auth/SessionScope';
import Login from '../../src/components/Login';
import { setActiveTenant } from '../../src/api/tenant';

const fixture = (memberships) => ({
  user: { id: 'fixture', email: 'fixture@example.invalid', app_metadata: { memberships }, user_metadata: {} },
  access_token: 'fixture',
});
const useSession = (session) => {
  mocks.signInWithPassword.mockResolvedValue({ data: { session } });
  mocks.getSession.mockResolvedValue({ data: { session } });
};

function Harness({ onLogin }) {
  const session = useAuthSession();
  return (
    <SessionScope session={session}>
      <Login onLogin={onLogin} onCancel={() => {}} theme="light" toggleTheme={() => {}} />
    </SessionScope>
  );
}

const entrar = async (user) => {
  await user.type(screen.getByLabelText('Correo o nombre'), 'fixture@example.invalid');
  await user.type(screen.getByLabelText('Contraseña'), 'fixture');
  await user.click(screen.getByRole('button', { name: /Entrar al admin/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActiveTenant(null);
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
});
afterEach(async () => { await authService.logout(); });

it('con verificación en dos pasos pide el código al primer intento', async () => {
  const user = userEvent.setup();
  useSession(fixture({ clinic_a: 'owner' }));
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  expect(await screen.findByLabelText('Código')).toBeTruthy();
  expect(mocks.signInWithPassword).toHaveBeenCalledOnce();
});

it('el aviso de sin permisos sigue visible después de cerrar la sesión a medias', async () => {
  const user = userEvent.setup();
  useSession(fixture({ clinic_a: 'user' }));
  // signOut es una llamada de red: React alcanza a pintar la sesion
  // intermedia (y remontar) antes de que vuelva a null.
  mocks.signOut.mockImplementation(() => new Promise((r) => setTimeout(r, 30)));
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  expect(await screen.findByText(/no tiene permisos/)).toBeTruthy();
});

it('"Usar otra cuenta" vuelve al formulario de contraseña', async () => {
  const user = userEvent.setup();
  useSession(fixture({ clinic_a: 'owner' }));
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  await user.click(await screen.findByRole('button', { name: /Usar otra cuenta/ }));
  expect(await screen.findByLabelText('Correo o nombre')).toBeTruthy();
  expect(screen.queryByLabelText('Código')).toBeNull();
});
