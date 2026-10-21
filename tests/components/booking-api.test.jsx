import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), authenticated: vi.fn() }));
vi.mock('../../src/api/supabaseClient', () => ({ conCliente: async () => mocks }));
vi.mock('../../src/api/shared', () => ({
  hasAuthSession: mocks.authenticated,
  deleteRemoved: vi.fn(),
  throwIfError: (result) => { if (result.error) throw result.error; },
}));
import { saveAppointments } from '../../src/api/appointments';
import { hashAviso, PRIVACY_NOTICE_VERSION } from '../../src/legal/avisoPrivacidad.mjs';
const booking = {
  id: 'fixture', name: 'Paciente', email: 'fixture@example.invalid', phone: '8112345678',
  serviceId: 'sv', therapistId: 'tt', date: '2026-11-10', time: '11:00',
  status: 'requested', privacyAccepted: true, durationMinutes: 50,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated.mockResolvedValue(false);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
it('guarda cita y consentimiento con una unica RPC y el hash del aviso mostrado', async () => {
  const result = await saveAppointments([booking], []);
  expect(result).toEqual([booking]);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_public_booking', expect.objectContaining({
    p_privacy_accepted: true, p_document_version: PRIVACY_NOTICE_VERSION,
    p_document_hash: await hashAviso(),
    p_appointments: [expect.objectContaining({ id: booking.id, customer_email: booking.email })],
  }));
  expect(mocks.from).not.toHaveBeenCalled();
});
it('no escribe si falta aceptacion explicita', async () => {
  await expect(saveAppointments([{ ...booking, privacyAccepted: false }], [])).rejects.toThrow('Acepta el aviso');
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});
it('propaga el fallo atomico sin intentar inserts de respaldo', async () => {
  const error = { code: '23514', message: 'No se pudo registrar consentimiento' };
  mocks.rpc.mockResolvedValue({ error });
  await expect(saveAppointments([booking], [])).rejects.toBe(error);
  expect(mocks.from).not.toHaveBeenCalled();
});
it('conserva el rechazo de cambios publicos de citas existentes', async () => {
  await expect(saveAppointments([{ ...booking, status: 'cancelled' }], [booking]))
    .rejects.toMatchObject({ code: 'PUBLIC_EDIT_NOT_ALLOWED' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
