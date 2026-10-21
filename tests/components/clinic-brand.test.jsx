import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import UserApp from '../../src/user/UserApp';
import { AppProviders } from '../../src/context/AppContext';
import { businessFromSettings } from '../../src/businessInfo';
import { businessDisplayName } from '../../src/businessBrand.mjs';
import { businessJsonLd } from '../../src/seo/jsonLd.mjs';
import { routeMeta } from '../../src/seo/routes.mjs';
import { useRouteHead } from '../../src/seo/useRouteHead';

const settings = { name: 'Brainpsi Coffee', legalName: 'Brainpsi Coffee Legal', cafeEnabled: false };
it('removes Coffee from the visible header and footer when the cafe is disabled', () => {
  render(<MemoryRouter><AppProviders data={{
    catalogs: { settings, services: [], therapists: [], schedules: [], locations: [], offers: [], menu: {}, busy: [] },
    bookings: [], orders: [], dataLoading: false,
  }} theme={{ theme: 'light' }}><UserApp /></AppProviders></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Brainpsi, inicio' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Brainpsi', exact: true })).toBeTruthy();
  expect(screen.queryByText('Brainpsi Coffee', { exact: true })).toBeNull();
});
it('retains stored and legal names, custom brands and the enabled display form', () => {
  expect(businessFromSettings(settings)).toMatchObject({ name: 'Brainpsi', legalName: 'Brainpsi Coffee Legal' });
  expect(settings.name).toBe('Brainpsi Coffee');
  expect(businessDisplayName({ ...settings, cafeEnabled: true })).toBe('Brainpsi Coffee');
  expect(businessDisplayName({ name: 'Consultorio Aurora', cafeEnabled: false })).toBe('Consultorio Aurora');
  expect(businessDisplayName({ cafeEnabled: false })).toBe('Brainpsi');
  expect(businessJsonLd({ settings }).name).toBe('Brainpsi');
  expect(routeMeta('/', settings).title).not.toContain('Coffee');
  expect(routeMeta('/', settings).description).not.toMatch(/cafetería|café/i);
});
it('uses the clinic-configured public messages on the homepage', () => {
  render(<MemoryRouter><AppProviders data={{
    catalogs: { settings: { name: 'Consultorio Aurora', legalName: 'Aurora Legal', cafeEnabled: false, publicTitle: 'Acompañamiento que sí cabe en tu vida', publicDescription: 'Atención psicológica para tu familia, con horarios claros.' }, services: [], therapists: [], schedules: [], locations: [], offers: [], menu: {}, busy: [] },
    bookings: [], orders: [], dataLoading: false,
  }} theme={{ theme: 'light' }}><UserApp /></AppProviders></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Acompañamiento que sí cabe en tu vida' })).toBeTruthy();
  expect(screen.getByText('Atención psicológica para tu familia, con horarios claros.')).toBeTruthy();
});
function Head({ settings }) { useRouteHead({ settings }); return null; }
it('updates browser and Open Graph titles when the cafe is toggled', async () => {
  const og = document.createElement('meta'); og.setAttribute('property', 'og:title'); document.head.appendChild(og);
  try {
    const view = render(<MemoryRouter><Head settings={{ ...settings, cafeEnabled: true }} /></MemoryRouter>);
    expect(document.title).toContain('Brainpsi Coffee');
    view.rerender(<MemoryRouter><Head settings={settings} /></MemoryRouter>);
    await waitFor(() => expect(document.title).not.toContain('Coffee'));
    expect(og.content).toBe(document.title);
  } finally { og.remove(); }
});
