// El paso del login (contraseña o codigo) vive en authService y no en el
// estado de Login: cada cambio de sesion remonta Login via SessionScope.
// Estas pruebas cubren los caminos que ese arreglo no debe romper: entrar
// con codigo, equivocarse de codigo, cambiar de cuenta, el arranque en frio
// y los remontajes que no vienen del login (clinica elegida, contraseña
// temporal).
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(), signOut: vi.fn(), getSession: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  // Guarda el listener de cliente(): las pruebas de abajo lo disparan como
  // lo hace supabase-js (SIGNED_IN antes de que signInWithPassword vuelva).
  onAuthStateChange: vi.fn((cb) => { mocks.emitir = cb; return { data: { subscription: { unsubscribe() {} } } }; }),
  listFactors: vi.fn(), challengeAndVerify: vi.fn(),
  emitir: null,
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

// Token con solo el claim que lee la UI; la firma no se verifica en cliente.
const token = (aal) => `x.${btoa(JSON.stringify({ aal }))}.y`;
const fixture = (memberships, { aal = 'aal1', mustChangePassword = false } = {}) => ({
  user: {
    id: 'fixture', email: 'fixture@example.invalid', user_metadata: {},
    app_metadata: { memberships, ...(mustChangePassword ? { must_change_password: true } : {}) },
  },
  access_token: token(aal),
});
const useSession = (session) => {
  mocks.signInWithPassword.mockResolvedValue({ data: { session } });
  mocks.getSession.mockResolvedValue({ data: { session } });
};
const conSegundoFactor = () => {
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
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

const escribirCodigo = async (user, codigo) => {
  await user.type(await screen.findByLabelText('Código'), codigo);
  await user.click(screen.getByRole('button', { name: /Verificar y entrar/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActiveTenant(null);
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
  mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: 'factor', status: 'verified' }] } });
});
afterEach(async () => {
  await authService.logout();
  authService.limpiarAvisoLogin();
});

it('con el código correcto entra una sola vez en aal2 y deja el paso del código', async () => {
  const user = userEvent.setup();
  const onLogin = vi.fn();
  useSession(fixture({ clinic_a: 'owner' }));
  conSegundoFactor();
  render(<Harness onLogin={onLogin} />);
  await entrar(user);

  mocks.challengeAndVerify.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue({ data: { session: fixture({ clinic_a: 'owner' }, { aal: 'aal2' }) } });
  await escribirCodigo(user, '123456');

  await waitFor(() => expect(onLogin).toHaveBeenCalledOnce());
  expect(onLogin.mock.calls[0][0].aal).toBe('aal2');
  expect(authService.segundoFactorPendiente$.value).toBe(false);
  await waitFor(() => expect(screen.queryByLabelText('Código')).toBeNull());
});

it('un código equivocado se queda en el paso del código y muestra el error', async () => {
  const user = userEvent.setup();
  const onLogin = vi.fn();
  useSession(fixture({ clinic_a: 'owner' }));
  conSegundoFactor();
  render(<Harness onLogin={onLogin} />);
  await entrar(user);

  mocks.challengeAndVerify.mockResolvedValue({ error: new Error('invalid') });
  await escribirCodigo(user, '000000');

  expect(await screen.findByText(/El código no es válido/)).toBeTruthy();
  expect(screen.getByLabelText('Código')).toBeTruthy();
  expect(onLogin).not.toHaveBeenCalled();
});

it('tras "Usar otra cuenta", una cuenta sin código entra directo', async () => {
  const user = userEvent.setup();
  const onLogin = vi.fn();
  useSession(fixture({ clinic_a: 'owner' }));
  conSegundoFactor();
  render(<Harness onLogin={onLogin} />);
  await entrar(user);
  await user.click(await screen.findByRole('button', { name: /Usar otra cuenta/ }));
  await screen.findByLabelText('Correo o nombre');

  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
  await entrar(user);

  await waitFor(() => expect(onLogin).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText('Código')).toBeNull();
});

it('un montaje en frío con sesión aal1 guardada muestra el formulario (el paso no se persiste)', async () => {
  // Limite conocido: el paso vive en memoria a proposito. Al recargar con
  // una sesion aal1 guardada no se sabe si falta el codigo hasta volver a
  // entrar; se pide la contraseña otra vez en vez de inventar el paso.
  authService.setSession(fixture({ clinic_a: 'owner' }));
  render(<Harness onLogin={vi.fn()} />);
  expect(screen.getByLabelText('Correo o nombre')).toBeTruthy();
  expect(screen.queryByLabelText('Código')).toBeNull();
});

it('multiclínica con código: elegir clínica remonta Login y sigue pidiendo el código', async () => {
  const user = userEvent.setup();
  useSession(fixture({ clinic_a: 'owner', clinic_b: 'owner' }));
  conSegundoFactor();
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  await screen.findByLabelText('Código');
  expect(authService.session$.value.user.tenantId).toBeNull();

  setActiveTenant('clinic_a');
  await act(async () => { await authService.reloadSession(); });

  expect(authService.session$.value.user.tenantId).toBe('clinic_a');
  expect(await screen.findByLabelText('Código')).toBeTruthy();
});

it('con contraseña temporal y código pendiente no pierde el paso del código', async () => {
  const user = userEvent.setup();
  useSession(fixture({ clinic_a: 'owner' }, { mustChangePassword: true }));
  conSegundoFactor();
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);

  expect(await screen.findByLabelText('Código')).toBeTruthy();
  expect(authService.session$.value.user.mustChangePassword).toBe(true);
  expect(mocks.signInWithPassword).toHaveBeenCalledOnce();
});

// supabase-js (GoTrueClient.signInWithPassword) guarda la sesion y avisa
// SIGNED_IN a los suscriptores ANTES de regresar: SessionScope remonta Login
// antes de que login() pregunte el nivel. El AAL tarda un macrotask para que
// React alcance a pintar ese remontaje en medio.
const loginRealista = (session) => {
  mocks.signInWithPassword.mockImplementation(async () => {
    await mocks.emitir('SIGNED_IN', session);
    return { data: { session } };
  });
  mocks.getSession.mockResolvedValue({ data: { session } });
  mocks.getAuthenticatorAssuranceLevel.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 20));
    return { data: { currentLevel: 'aal1', nextLevel: 'aal2' } };
  });
};

it('con el aviso SIGNED_IN antes de saber el nivel, el primer intento pide el código', async () => {
  const user = userEvent.setup();
  loginRealista(fixture({ clinic_a: 'owner' }));
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  expect(await screen.findByLabelText('Código')).toBeTruthy();
  expect(mocks.signInWithPassword).toHaveBeenCalledOnce();
});

it('un SIGNED_OUT del listener con el código pendiente vuelve al formulario', async () => {
  const user = userEvent.setup();
  useSession(fixture({ clinic_a: 'owner' }));
  conSegundoFactor();
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  await screen.findByLabelText('Código');

  await act(async () => { await mocks.emitir('SIGNED_OUT', null); });

  expect(await screen.findByLabelText('Correo o nombre')).toBeTruthy();
  expect(screen.queryByLabelText('Código')).toBeNull();
  expect(authService.segundoFactorPendiente$.value).toBe(false);
});

it('tras el primer intento el campo Código tiene el foco', async () => {
  const user = userEvent.setup();
  loginRealista(fixture({ clinic_a: 'owner' }));
  render(<Harness onLogin={vi.fn()} />);
  await entrar(user);
  const campo = await screen.findByLabelText('Código');
  await waitFor(() => expect(document.activeElement).toBe(campo));
});
