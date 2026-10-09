// Resenas de Google: enlaces saneados, nunca resenas copiadas.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/monitoring', () => ({ trackEvent: vi.fn() }));
import ResenasGoogle from '../../src/user/ResenasGoogle';

describe('Resenas de Google', () => {
  it('sin enlace para dejar resena: solo "Ver resenas", hacia el mapa', () => {
    render(<ResenasGoogle settings={{ mapsUrl: 'https://maps.app.goo.gl/abc' }} />);
    expect(screen.getByRole('link', { name: 'Ver reseñas en Google' }).getAttribute('href')).toBe('https://maps.app.goo.gl/abc');
    expect(screen.queryByRole('link', { name: /Déjanos tu reseña/ })).toBeNull();
  });

  it('con enlace: ofrece dejar resena en pestana nueva', () => {
    render(<ResenasGoogle settings={{ mapsUrl: 'https://maps.app.goo.gl/abc', reviewUrl: 'https://g.page/r/xyz/review' }} />);
    const dejar = screen.getByRole('link', { name: /Déjanos tu reseña/ });
    expect(dejar.getAttribute('href')).toBe('https://g.page/r/xyz/review');
    expect(dejar.getAttribute('target')).toBe('_blank');
  });

  it('un enlace inseguro no se publica', () => {
    const { container } = render(<ResenasGoogle settings={{ mapsUrl: 'javascript:alert(1)', reviewUrl: 'javascript:alert(2)' }} />);
    expect(container.innerHTML).toBe('');
  });
});
