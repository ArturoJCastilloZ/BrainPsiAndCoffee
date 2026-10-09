// Verificacion en dos pasos (0039), con Supabase Auth simulado.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({
  factoresVerificados: vi.fn(),
  iniciarAltaSegundoFactor: vi.fn(),
  verificarSegundoFactor: vi.fn(),
  desactivarSegundoFactor: vi.fn(),
}));
const api = vi.hoisted(() => ({ clinicalMfaRequired: vi.fn(), setClinicalMfa: vi.fn() }));
vi.mock('../../src/auth/authService', () => ({ authService: auth }));
vi.mock('../../src/api/supabaseData', () => api);

import SecurityPanel from '../../src/components/SecurityPanel';

describe('Seguridad', () => {
  it('alta: muestra el QR y el secreto, y verifica con ESE factor', async () => {
    const user = userEvent.setup();
    auth.factoresVerificados.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'f1' }]);
    auth.iniciarAltaSegundoFactor.mockResolvedValue({ factorId: 'f-nuevo', qr: 'data:image/svg+xml;base64,PHN2Zy8+', secreto: 'JBSWY3DPEHPK3PXP' });
    auth.verificarSegundoFactor.mockResolvedValue({});
    render(<SecurityPanel session={{ aal: 'aal1', user: { role: 'doctor' } }} />);

    await user.click(await screen.findByRole('button', { name: 'Empezar' }));
    expect(screen.getByRole('img', { name: /Código QR/ }).getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();

    await user.type(screen.getByLabelText('Código de 6 dígitos'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(auth.verificarSegundoFactor).toHaveBeenCalledWith('123 456', 'f-nuevo');
    expect(await screen.findByText('Verificación en dos pasos: activa')).toBeTruthy();
  });

  it('el dueño no puede exigirla a la clinica sin haberse verificado el mismo', async () => {
    auth.factoresVerificados.mockResolvedValue([{ id: 'f1' }]);
    api.clinicalMfaRequired.mockResolvedValue(false);
    render(<SecurityPanel session={{ aal: 'aal1', user: { role: 'super_admin' } }} puedeExigir />);
    const boton = await screen.findByRole('button', { name: 'Exigirla a la clínica' });
    expect(boton.disabled).toBe(true);
    expect(screen.getByText(/así no te quedas fuera/)).toBeTruthy();
  });

  it('verificado, el dueño la exige', async () => {
    const user = userEvent.setup();
    auth.factoresVerificados.mockResolvedValue([{ id: 'f1' }]);
    api.clinicalMfaRequired.mockResolvedValue(false);
    api.setClinicalMfa.mockResolvedValue(undefined);
    render(<SecurityPanel session={{ aal: 'aal2', user: { role: 'super_admin' } }} puedeExigir />);
    await user.click(await screen.findByRole('button', { name: 'Exigirla a la clínica' }));
    expect(api.setClinicalMfa).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('button', { name: 'Dejar de exigirla' })).toBeTruthy();
  });

  it('exigida y sin verificar: pide el codigo y solo ofrece cerrar sesion como salida', async () => {
    auth.factoresVerificados.mockResolvedValue([{ id: 'f1' }]);
    const onLogout = vi.fn();
    render(<SecurityPanel session={{ aal: 'aal1', user: { role: 'doctor' } }} modo="exigido" onLogout={onLogout} />);
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  });
});
