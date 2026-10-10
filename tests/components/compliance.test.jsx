// Cumplimiento (0039): ARCO publica y del panel, y consentimiento informado.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  submitArcoRequest: vi.fn(),
  loadPatientConsents: vi.fn(),
  registerClinicalConsent: vi.fn(),
  revokeConsent: vi.fn(),
  loadArcoRequests: vi.fn(),
  updateArcoRequest: vi.fn(),
}));
vi.mock('../../src/api/supabaseData', () => api);

import ArcoPage from '../../src/user/ArcoPage';
import AdminArco from '../../src/admin/AdminArco';
import ConsentimientoClinico from '../../src/doctor/ConsentimientoClinico';

describe('ARCO publica', () => {
  it('sin datos: explica cada error y no envia nada', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ArcoPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(screen.getByText('Elige qué quieres hacer con tus datos.')).toBeTruthy();
    expect(screen.getByText('Escribe tu correo: ahí te respondemos.')).toBeTruthy();
    expect(api.submitArcoRequest).not.toHaveBeenCalled();
  });

  it('por un hijo: pide el nombre del titular y manda la relacion', async () => {
    const user = userEvent.setup();
    api.submitArcoRequest.mockResolvedValueOnce(undefined);
    render(<MemoryRouter><ArcoPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Rectificación/ }));
    await user.click(screen.getByRole('button', { name: 'Son de mi hijo o hija' }));
    await user.type(screen.getByLabelText('Nombre de la persona titular de los datos'), 'Leo Pérez');
    await user.type(screen.getByLabelText('Tu nombre completo'), 'Marta Pérez');
    await user.type(screen.getByLabelText('Correo electrónico'), 'marta@ejemplo.mx');
    await user.type(screen.getByLabelText('Cuéntanos qué necesitas'), 'Su fecha de nacimiento está mal escrita.');
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(api.submitArcoRequest).toHaveBeenCalledWith(expect.objectContaining({
      type: 'rectificacion', relationship: 'madre_padre_tutor', onBehalfOf: 'Leo Pérez', email: 'marta@ejemplo.mx',
    }));
    expect(screen.getByRole('heading', { name: 'Recibimos tu solicitud' })).toBeTruthy();
    expect(screen.getByText('marta@ejemplo.mx')).toBeTruthy();
  });

  it('un tope de la base se muestra tal cual', async () => {
    const user = userEvent.setup();
    api.submitArcoRequest.mockRejectedValueOnce({ code: 'P0429', message: 'Ya recibimos varias solicitudes tuyas este mes.' });
    render(<MemoryRouter><ArcoPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Acceso/ }));
    await user.type(screen.getByLabelText('Tu nombre completo'), 'Ana');
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@ejemplo.mx');
    await user.type(screen.getByLabelText('Cuéntanos qué necesitas'), 'Quiero saber qué datos tienen.');
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ya recibimos varias solicitudes tuyas este mes.');
  });
});

describe('ARCO en el panel', () => {
  const hoy = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 7);
  const lejos = new Date(hoy); lejos.setDate(hoy.getDate() + 25);
  const base = { email: 'x@ex.mx', phone: '', relationship: 'titular', onBehalfOf: '', details: 'Quiero mis datos.', createdAt: hoy.toISOString(), respondedAt: null, responseSummary: '' };

  it('ordena por vencimiento, marca la vencida y no deja cerrar sin respuesta', async () => {
    const user = userEvent.setup();
    const cargar = vi.fn().mockResolvedValue([
      { ...base, id: 'a', type: 'acceso', name: 'Con tiempo', status: 'recibida', dueOn: iso(lejos) },
      { ...base, id: 'b', type: 'cancelacion', name: 'Atrasada', status: 'en_proceso', dueOn: iso(ayer) },
    ]);
    const actualizar = vi.fn(async (id, cambios) => ({ ...base, id, type: 'cancelacion', name: 'Atrasada', dueOn: iso(ayer), ...cambios, status: cambios.status, respondedAt: hoy.toISOString() }));
    render(<AdminArco cargar={cargar} actualizar={actualizar} />);

    const titulos = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(titulos).toEqual(['Cancelación · Atrasada', 'Acceso · Con tiempo']);
    expect(screen.getByText(/Venció hace/)).toBeTruthy();

    const cerrar = screen.getAllByRole('button', { name: 'Cerrar como respondida' })[0];
    await user.click(cerrar);
    expect(screen.getByText(/mínimo 10 caracteres/)).toBeTruthy();
    expect(actualizar).not.toHaveBeenCalled();
    await user.type(screen.getAllByLabelText(/Qué se respondió/)[0], 'Se cancelaron sus datos de contacto.');
    await user.click(screen.getAllByRole('button', { name: 'Cerrar como respondida' })[0]);
    expect(actualizar).toHaveBeenCalledWith('b', { status: 'respondida', responseSummary: 'Se cancelaron sus datos de contacto.' });
  });
});

describe('Consentimiento informado', () => {
  const nino = { id: 'p1', name: 'Leo Pérez', email: 'marta@ex.mx', isMinor: true, guardianName: 'Marta Pérez' };

  it('sin consentimiento lo dice, y para un menor propone a su adulto como firmante', async () => {
    const user = userEvent.setup();
    const cargar = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'c1', type: 'clinical_treatment', version: 'ci-x', acceptedAt: new Date().toISOString(), revokedAt: null, evidence: { firmante: 'Marta Pérez', parentesco: 'madre_padre_tutor', modalidad: 'papel' } },
    ]);
    const registrar = vi.fn().mockResolvedValue({});
    render(<ConsentimientoClinico patient={nino} cargar={cargar} registrar={registrar} revocar={vi.fn()} />);

    expect(await screen.findByText(/Sin consentimiento vigente/)).toBeTruthy();
    expect(screen.getByText(/lo firma su madre, padre o tutor/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Registrar consentimiento' }));
    expect(screen.getByLabelText('Nombre de quien firmó').value).toBe('Marta Pérez');
    expect(screen.getByLabelText('Firmó como').value).toBe('madre_padre_tutor');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      patientId: 'p1', email: 'marta@ex.mx', firmante: 'Marta Pérez', parentesco: 'madre_padre_tutor', modalidad: 'papel',
    }));
    expect(await screen.findByText(/firmó Marta Pérez \(madre, padre o tutor\)/)).toBeTruthy();
  });
});
