// Accesos: alta por correo y reinicio de la verificacion en dos pasos.
// Panel: la exigencia de la clinica avisa, no bloquea.
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({
  listTenantMembers: vi.fn(),
  revokeTenantMember: vi.fn(),
  inviteStaff: vi.fn(),
  generateTempPassword: vi.fn(),
  resetStaffMfa: vi.fn(),
  setTenantMemberRole: vi.fn(),
}));
vi.mock('../../src/api/supabaseData', () => api);
vi.mock('../../src/api/supabaseClient', () => ({
  getSupabase: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
  }),
}));

import AdminAccess from '../../src/admin/AdminAccess';
import MfaAviso from '../../src/components/MfaAviso';

const miembros = [
  { userId: 'u0', email: 'dueno@ex.mx', role: 'owner', isSelf: true, invitedAt: null },
  { userId: 'u1', email: 'barista@ex.mx', role: 'barista', isSelf: false, invitedAt: null },
  { userId: 'u2', email: 'otra-duena@ex.mx', role: 'owner', isSelf: false, invitedAt: null },
];

describe('Accesos', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listTenantMembers.mockResolvedValue(miembros);
  });

  it('el alta nueva sale por correo por defecto y lo dice', async () => {
    const user = userEvent.setup();
    api.inviteStaff.mockResolvedValue({ estado: 'correo', email: 'nueva@ex.mx' });
    render(<AdminAccess />);
    await screen.findByText('barista@ex.mx');
    expect(screen.getByRole('radio', { name: /Le llega un correo/ }).checked).toBe(true);
    await user.type(screen.getByPlaceholderText('correo@ejemplo.mx'), 'nueva@ex.mx');
    await user.click(screen.getByRole('button', { name: /Asignar/ }));
    expect(api.inviteStaff).toHaveBeenCalledWith('nueva@ex.mx', 'admin_consultorio', null, 'correo');
    expect(await screen.findByText(/Le mandamos a nueva@ex.mx un correo/)).toBeTruthy();
  });

  it('reiniciar la verificacion: solo en personal que no es dueño ni uno mismo, y con confirmacion', async () => {
    const user = userEvent.setup();
    api.resetStaffMfa.mockResolvedValue({ estado: 'mfa_reiniciado', factores: 1 });
    render(<AdminAccess />);
    await screen.findByText('barista@ex.mx');
    const botones = screen.getAllByRole('button', { name: /Reiniciar verificación en dos pasos/ });
    expect(botones).toHaveLength(1);

    await user.click(botones[0]);
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Reiniciar' }));
    expect(api.resetStaffMfa).toHaveBeenCalledWith('barista@ex.mx');
    expect(await screen.findByText(/barista@ex.mx ya puede entrar con su contraseña/)).toBeTruthy();
  });
});

describe('Aviso de verificacion exigida', () => {
  it('avisa y lleva a activarla, sin bloquear', async () => {
    const user = userEvent.setup();
    const activar = vi.fn();
    render(<MfaAviso onActivar={activar} />);
    expect(screen.getByRole('status').textContent).toMatch(/Lo demás lo puedes usar normal/);
    await user.click(screen.getByRole('button', { name: 'Activarla' }));
    expect(activar).toHaveBeenCalled();
  });
});
