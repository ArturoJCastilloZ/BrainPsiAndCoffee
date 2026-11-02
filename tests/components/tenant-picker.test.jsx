import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TenantPicker from '../../src/components/TenantPicker';
import { themeVars } from '../../src/GlobalStyle';

// themeVars ya invierte los tokens C.* segun el tema. Si TenantPicker
// ramifica otra vez con el tema, invierte dos veces y en oscuro pinta
// claro sobre claro. Por eso el estilo inline debe ser el MISMO token en
// los dos temas.
function renderIn(theme) {
  const isDark = theme === 'dark';
  return render(
    <div data-theme={theme} style={themeVars(isDark)}>
      <TenantPicker memberships={{ brainpsi: 'owner', aurora: 'doctor' }} theme={theme} onSelected={() => {}} />
    </div>,
  );
}

function styles() {
  const heading = screen.getByRole('heading', { level: 1 });
  const page = heading.closest('div').parentElement;
  const card = heading.closest('div');
  const button = screen.getByRole('button', { name: /brainpsi/i });
  const name = button.querySelector('strong');
  const role = name.nextElementSibling;
  return {
    page: page.style.background,
    card: card.style.background,
    title: heading.style.color,
    button: button.style.background,
    buttonText: button.style.color,
    name: name.style.color,
    role: role.style.color,
  };
}

describe('TenantPicker', () => {
  afterEach(cleanup);

  it('usa los mismos tokens var(--bp-*) en claro y en oscuro', () => {
    renderIn('light');
    const light = styles();
    cleanup();
    renderIn('dark');
    const dark = styles();
    expect(dark).toEqual(light);
    expect(light).toMatchObject({
      page: 'var(--bp-ivory)',
      card: 'var(--bp-surface)',
      title: 'var(--bp-brown)',
      button: 'var(--bp-surface-2)',
      name: 'var(--bp-brown)',
      role: 'var(--bp-brown-mid)',
    });
  });

  it('da al boton un nombre accesible con clinica y rol, y oculta el icono', () => {
    renderIn('dark');
    const button = screen.getByRole('button', { name: 'Entrar a brainpsi como Dueño' });
    expect(button.textContent).toContain('brainpsi');
    expect(button.textContent).toContain('Dueño');
    expect(screen.getByRole('button', { name: 'Entrar a aurora como Especialista' })).toBeTruthy();
    const icon = button.querySelector('svg');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('stroke')).toBe('var(--bp-sage-text)');
  });
});
