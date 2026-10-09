// Contacto muestra solo los datos que el negocio capturo.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/monitoring', () => ({ trackEvent: vi.fn() }));
import ContactPage from '../../src/user/ContactPage';
import { hayWhatsapp } from '../../src/businessInfo';

describe('Contacto', () => {
  it('un telefono o correo vacio no deja el titulo suelto', () => {
    render(<ContactPage settings={{ phone: '', email: '  ', whatsapp: '528111111111', address: 'Av Lincoln 1600', instagram: 'https://instagram.com/brainpsi.coffee' }} />);
    expect(screen.queryByText('Teléfono')).toBeNull();
    expect(screen.queryByText('Correo')).toBeNull();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('Av Lincoln 1600')).toBeTruthy();
    expect(screen.getByText('@brainpsi.coffee')).toBeTruthy();
  });

  it('con datos, los muestra con su enlace', () => {
    render(<ContactPage settings={{ phone: '8111111111', email: 'hola@ex.mx' }} />);
    expect(screen.getByRole('link', { name: '8111111111' }).getAttribute('href')).toBe('tel:8111111111');
    expect(screen.getByRole('link', { name: 'hola@ex.mx' }).getAttribute('href')).toBe('mailto:hola@ex.mx');
  });

  it('sin numero de WhatsApp no se ofrece WhatsApp (el enlace no tendria destinatario)', () => {
    expect(hayWhatsapp({ whatsapp: '' })).toBe(false);
    expect(hayWhatsapp({ whatsapp: '52 81' })).toBe(false);
    expect(hayWhatsapp({ whatsapp: '528112345678' })).toBe(true);
    render(<ContactPage settings={{ whatsapp: '', address: 'Av Lincoln 1600' }} />);
    expect(screen.queryByText('WhatsApp')).toBeNull();
    expect(screen.queryByText(/Por WhatsApp respondemos/)).toBeNull();
  });
});
