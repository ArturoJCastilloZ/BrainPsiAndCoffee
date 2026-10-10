// Toda accion del panel avisa que se hizo, en un lugar fijo y visible.
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import Avisos, { avisar } from '../../src/components/Avisos';
import { useAccionesConAviso } from '../../src/admin/useAccionesConAviso';
import { describirCitas, describirLista, describirPedidos } from '../../src/avisosDeCambios.mjs';

describe('Mensajes de lo que se hizo', () => {
  it('listas: agregado, eliminado, guardado, en singular y plural, con genero', () => {
    const suc = { uno: 'Sucursal', varios: 'sucursales', femenino: true };
    expect(describirLista([], [{ id: 'a' }], suc)).toBe('Sucursal agregada.');
    expect(describirLista([{ id: 'a' }, { id: 'b' }], [], { uno: 'Servicio', varios: 'servicios' })).toBe('2 servicios eliminados.');
    expect(describirLista([{ id: 'a', n: 1 }], [{ id: 'a', n: 2 }], suc)).toBe('Sucursal guardada.');
    expect(describirLista([{ id: 'a' }], [{ id: 'b' }], suc)).toBe('Cambios guardados.');
  });

  it('citas: confirmar, rechazar una solicitud, cancelar, reagendar, crear', () => {
    const c = { id: 'c1', status: 'requested', date: '2026-10-13', time: '10:00' };
    expect(describirCitas([c], [{ ...c, status: 'confirmed' }])).toBe('Cita confirmada.');
    expect(describirCitas([c], [{ ...c, status: 'cancelled' }])).toMatch(/Solicitud rechazada/);
    expect(describirCitas([{ ...c, status: 'confirmed' }], [{ ...c, status: 'cancelled' }])).toBe('Cita cancelada.');
    expect(describirCitas([c], [{ ...c, time: '12:00' }])).toMatch(/^Cita reagendada al .+ a las 12:00\.$/);
    expect(describirCitas([], [c])).toBe('Cita creada.');
  });

  it('pedidos: cada estado dice lo que paso', () => {
    const p = { id: 'p1', status: 'ready' };
    expect(describirPedidos([p], [{ ...p, status: 'delivered' }])).toBe('Pedido entregado.');
    expect(describirPedidos([], [p])).toBe('Pedido creado.');
  });
});

describe('Aviso en pantalla', () => {
  afterEach(() => vi.useRealTimers());

  it('aparece al avisar y se va solo', () => {
    vi.useFakeTimers();
    render(<Avisos />);
    act(() => avisar.exito('Sucursal guardada.'));
    expect(screen.getByRole('status').textContent).toContain('Sucursal guardada.');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('los guardados del panel avisan solos si salieron bien, y no si fallaron', async () => {
    render(<Avisos />);
    let acciones;
    function Sonda(props) { acciones = useAccionesConAviso(props); return null; }
    const ok = vi.fn(async () => ({ ok: true }));
    const falla = vi.fn(async () => ({ ok: false, error: new Error('x') }));
    const { rerender } = render(<Sonda bookings={[{ id: 'c1', status: 'requested', date: '2026-10-13', time: '10:00' }]}
      setBookings={ok} catalogs={{ locations: [] }} catalogActions={{ setLocations: falla }} />);

    await act(async () => { await acciones.setBookings([{ id: 'c1', status: 'confirmed', date: '2026-10-13', time: '10:00' }]); });
    expect(screen.getByRole('status').textContent).toContain('Cita confirmada.');

    rerender(<Sonda bookings={[]} setBookings={ok} catalogs={{ locations: [] }} catalogActions={{ setLocations: falla }} />);
    await act(async () => { await acciones.catalogActions.setLocations([{ id: 'x' }]); });
    expect(screen.getByRole('status').textContent).not.toContain('Sucursal');
  });
});
