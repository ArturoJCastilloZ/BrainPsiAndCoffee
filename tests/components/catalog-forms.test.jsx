// Formularios del catalogo: el boton Guardar siempre se puede presionar y,
// si falta algo, dice QUE junto al campo.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminCatalog from '../../src/admin/AdminCatalog';

const base = { services: [], therapists: [], specialties: [{ id: 'sp', name: 'Psicología', active: true }], menu: {}, offers: [], productOptions: [], settings: {} };
const montar = (tab, catalogs = {}, acciones = {}) => {
  const setServices = vi.fn(async () => ({ ok: true }));
  const setTherapists = vi.fn(async () => ({ ok: true }));
  render(<AdminCatalog catalogs={{ ...base, ...catalogs }} catalogActions={{ setServices, setTherapists, ...acciones }}
    session={{ user: { role: 'owner' } }} initialTab={tab} lockedTab />);
  return { setServices, setTherapists };
};

describe('Servicios', () => {
  it('nuevo: no abre en rojo; al guardar vacio dice que falta y no guarda', async () => {
    const user = userEvent.setup();
    const { setServices } = montar('services');
    await user.click(screen.getByRole('button', { name: /Nuevo/ }));
    expect(screen.queryByText('Escribe el nombre del servicio.')).toBeNull();
    const guardar = screen.getByRole('button', { name: 'Guardar' });
    expect(guardar.disabled).toBe(false);
    await user.click(guardar);
    expect(screen.getAllByText(/Escribe el nombre del servicio\./).length).toBeGreaterThan(0);
    expect(setServices).not.toHaveBeenCalled();
    expect(document.activeElement.getAttribute('aria-invalid')).toBe('true');
  });

  it('"Dirigido a" es una lista, y con nombre se guarda con el icono por defecto', async () => {
    const user = userEvent.setup();
    const { setServices } = montar('services');
    await user.click(screen.getByRole('button', { name: /Nuevo/ }));
    await user.type(screen.getByLabelText('SERVICIO'), 'Entrega de resultados');
    await user.selectOptions(screen.getByLabelText('DIRIGIDO A'), 'Adultos / Niños');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(setServices).toHaveBeenCalledWith([expect.objectContaining({ name: 'Entrega de resultados', for: 'Adultos / Niños', icon: 'heart' })]);
  });

  it('un valor viejo fuera de la lista se conserva al editar', async () => {
    const user = userEvent.setup();
    montar('services', { services: [{ id: 's1', name: 'Terapia', for: 'Niñ@s', duration: 50, price: 500, icon: 'heart', active: true }] });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('DIRIGIDO A').value).toBe('Niñ@s');
  });
});

describe('Especialistas', () => {
  it('sin color guardado (se ve "Verde") se puede guardar; un correo mal escrito lo dice', async () => {
    const user = userEvent.setup();
    const ficha = { id: 't1', name: 'Ana', email: 'ana@ex', cedula: '123', specialty: 'Psicología', sessionDuration: 50, services: ['s1'], active: true };
    const { setTherapists } = montar('therapists', { services: [{ id: 's1', name: 'Terapia', active: true }], therapists: [ficha] });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getAllByText(/Revisa el correo/).length).toBeGreaterThan(0);
    expect(setTherapists).not.toHaveBeenCalled();
    const correo = screen.getByLabelText(/CORREO DE ACCESO/);
    await user.clear(correo);
    await user.type(correo, 'ana@ex.mx');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(setTherapists).toHaveBeenCalledWith([expect.objectContaining({ email: 'ana@ex.mx', color: expect.any(String) })]);
  });
});
