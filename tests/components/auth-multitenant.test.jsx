import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(), signOut: vi.fn(), getSession: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(), onAuthStateChange: vi.fn(),
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
import { getSelectedTenant, setActiveTenant } from '../../src/api/tenant';

const fixture = (memberships, userMetadata = {}) => ({
  user: { id: 'fixture', email: 'fixture@example.invalid',
    app_metadata: { memberships }, user_metadata: userMetadata },
  access_token: 'fixture',
});
const login = () => authService.login({ username: 'fixture@example.invalid', password: 'fixture' });
const useSession = (session) => {
  mocks.signInWithPassword.mockResolvedValue({ data: { session } });
  mocks.getSession.mockResolvedValue({ data: { session } });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActiveTenant(null);
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
});
afterEach(async () => { await authService.logout(); });

it('permite elegir clínica sin asignar un rol y lo deriva al seleccionar', async () => {
  useSession(fixture({ clinic_a: 'owner', clinic_b: 'doctor' }));
  const session = await login();
  expect(session.user).toMatchObject({ role: 'user', tenantId: null });
  expect(mocks.signOut).not.toHaveBeenCalled();
  setActiveTenant('clinic_b');
  expect((await authService.reloadSession()).user).toMatchObject({ role: 'doctor', tenantId: 'clinic_b' });
  setActiveTenant('clinic_a');
  expect((await authService.reloadSession()).user).toMatchObject({ role: 'super_admin', tenantId: 'clinic_a' });
});

it('entra directamente con una sola clínica', async () => {
  useSession(fixture({ clinic_a: 'admin_consultorio' }));
  expect((await login()).user).toMatchObject({ role: 'admin_consultorio', tenantId: 'clinic_a' });
});

it('descarta una clínica guardada revocada antes de permitir elegir', async () => {
  setActiveTenant('revoked');
  useSession(fixture({ clinic_a: 'doctor', clinic_b: 'owner' }));
  expect((await login()).user).toMatchObject({ role: 'user', tenantId: null });
  expect(getSelectedTenant()).toBeNull();
});

it('no toma el rol de otra clínica cuando ya hay una elegida', async () => {
  setActiveTenant('clinic_a');
  useSession(fixture({ clinic_a: 'user', clinic_b: 'owner' }));
  await expect(login()).rejects.toThrow('no tiene permisos');
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(authService.session$.value).toBeNull();
});

it.each([{}, { clinic_a: 'user', clinic_b: 'unknown' }])('rechaza membresías sin acceso e ignora roles editables %j', async (memberships) => {
  useSession(fixture(memberships, { role: 'owner', memberships: { forged: 'owner' } }));
  await expect(login()).rejects.toThrow('no tiene permisos');
  expect(mocks.signOut).toHaveBeenCalledOnce();
});

it('mantiene el paso de segundo factor para cuentas con varias clínicas', async () => {
  useSession(fixture({ clinic_a: 'doctor', clinic_b: 'owner' }));
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
  expect(await login()).toMatchObject({ requiereSegundoFactor: true, user: { role: 'user', tenantId: null } });
});
