// Crear / restablecer contraseña con la verificacion en dos pasos activa.
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({
  faltaSegundoFactor: vi.fn(),
  verificarSegundoFactor: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock('../../src/auth/authService', () => ({ authService: auth }));

import SetPassword from '../../src/components/SetPassword';

const montar = (onComplete = vi.fn()) => render(
  <SetPassword session={{ user: { id: 'u1' } }} onComplete={onComplete} theme="dark" toggleTheme={vi.fn()} />,
);
const escribirClaves = async (user) => {
  const [clave, confirmar] = document.querySelectorAll('input[autocomplete="new-password"]');
  await user.type(clave, 'una-clave-larga');
  await user.type(confirmar, 'una-clave-larga');
};

describe('SetPassword', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('sin verificacion en dos pasos: guarda directo', async () => {
    const user = userEvent.setup();
    auth.faltaSegundoFactor.mockResolvedValue(false);
    auth.updatePassword.mockResolvedValue({});
    const listo = vi.fn();
    montar(listo);
    await escribirClaves(user);
    await user.click(screen.getByRole('button', { name: /Guardar contraseña/ }));
    expect(auth.verificarSegundoFactor).not.toHaveBeenCalled();
    expect(auth.updatePassword).toHaveBeenCalledWith('una-clave-larga');
    expect(listo).toHaveBeenCalled();
  });

  it('con ella activa: pide el codigo y lo verifica ANTES de guardar', async () => {
    const user = userEvent.setup();
    auth.faltaSegundoFactor.mockResolvedValue(true);
    auth.verificarSegundoFactor.mockResolvedValue({});
    auth.updatePassword.mockResolvedValue({});
    montar();
    const codigo = await screen.findByLabelText('CÓDIGO DE VERIFICACIÓN');
    await escribirClaves(user);
    const guardar = screen.getByRole('button', { name: /Guardar contraseña/ });
    expect(guardar.disabled).toBe(true);
    await user.type(codigo, '123 456');
    await user.click(guardar);
    expect(auth.verificarSegundoFactor).toHaveBeenCalledWith('123 456');
    expect(auth.verificarSegundoFactor.mock.invocationCallOrder[0]).toBeLessThan(auth.updatePassword.mock.invocationCallOrder[0]);
  });

  it('si Supabase dice que falta el segundo factor, aparece el campo del codigo', async () => {
    const user = userEvent.setup();
    auth.faltaSegundoFactor.mockResolvedValue(false);
    auth.updatePassword.mockRejectedValue(Object.assign(new Error('AAL2 session is required'), { code: 'FALTA_SEGUNDO_FACTOR' }));
    montar();
    await escribirClaves(user);
    await user.click(screen.getByRole('button', { name: /Guardar contraseña/ }));
    expect(await screen.findByLabelText('CÓDIGO DE VERIFICACIÓN')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/escribe el código de tu app/);
  });
});
