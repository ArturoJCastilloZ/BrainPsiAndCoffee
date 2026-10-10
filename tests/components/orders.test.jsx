// Entregar un pedido con saldo pide el cobro primero.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminOrders from '../../src/admin/AdminOrders';

const pedido = {
  id: 'iau2r-pedido', status: 'ready', total: 50, createdAt: new Date().toISOString(),
  customerName: 'Sandra', customerPhone: '8111111111', source: 'web',
  items: [{ name: 'Hipervigilancia', price: 50, qty: 1, customizations: {} }],
};

const montar = (props) => render(
  <AdminOrders orders={[pedido]} setOrders={vi.fn()} catalogs={{ menu: {} }} session={{ user: { role: 'owner' } }} {...props} />,
);

describe('Entregar pedido', () => {
  it('con saldo: abre "Cobrar y entregar", y entrega solo despues de cobrar', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    const cobrar = vi.fn().mockResolvedValue(undefined);
    montar({ setOrders, canRecordPayments: true, onRegistrarCobro: cobrar });

    await user.click(screen.getByRole('button', { name: 'Entregar' }));
    expect(setOrders).not.toHaveBeenCalled();
    const dialogo = screen.getByRole('dialog', { name: 'Cobrar y entregar' });
    expect(dialogo).toBeTruthy();

    await user.selectOptions(screen.getByRole('combobox'), 'efectivo');
    await user.click(screen.getByRole('button', { name: 'Cobrar y entregar' }));
    expect(cobrar).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'iau2r-pedido', amount: 50, method: 'efectivo' }));
    expect(setOrders).toHaveBeenCalledWith([expect.objectContaining({ id: 'iau2r-pedido', status: 'delivered' })]);
  });

  it('si el cobro falla, el pedido NO se entrega', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    montar({ setOrders, canRecordPayments: true, onRegistrarCobro: vi.fn().mockRejectedValue(new Error('rechazado')) });
    await user.click(screen.getByRole('button', { name: 'Entregar' }));
    await user.selectOptions(screen.getByRole('combobox'), 'tarjeta');
    await user.click(screen.getByRole('button', { name: 'Cobrar y entregar' }));
    expect(await screen.findByText('rechazado')).toBeTruthy();
    expect(setOrders).not.toHaveBeenCalled();
  });

  it('"Entregar sin cobrar" entrega y deja el saldo pendiente', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    const cobrar = vi.fn();
    montar({ setOrders, canRecordPayments: true, onRegistrarCobro: cobrar });
    await user.click(screen.getByRole('button', { name: 'Entregar' }));
    await user.click(screen.getByRole('button', { name: 'Entregar sin cobrar' }));
    expect(cobrar).not.toHaveBeenCalled();
    expect(setOrders).toHaveBeenCalledWith([expect.objectContaining({ status: 'delivered' })]);
  });

  it('ya cobrado, o sin permiso de cobrar (barista): entrega directo', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    montar({ setOrders, canRecordPayments: true, payments: [{ orderId: 'iau2r-pedido', amount: 50 }] });
    await user.click(screen.getByRole('button', { name: 'Entregar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(setOrders).toHaveBeenCalledTimes(1);

    const barista = vi.fn();
    montar({ setOrders: barista });
    await user.click(screen.getAllByRole('button', { name: 'Entregar' })[1]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(barista).toHaveBeenCalledWith([expect.objectContaining({ status: 'delivered' })]);
  });
});

describe('Nuevo pedido', () => {
  it('el boton se puede presionar y dice que falta; no guarda', async () => {
    const user = userEvent.setup();
    const setOrders = vi.fn();
    render(<AdminOrders orders={[]} setOrders={setOrders} session={{ user: { role: 'owner' } }}
      catalogs={{ menu: { hot: { title: 'Calientes', items: [{ id: 'cafe', name: 'Americano', price: 40, active: true }] } } }} />);
    await user.click(screen.getByRole('button', { name: /Nuevo pedido/ }));
    const guardar = screen.getByRole('button', { name: 'Guardar pedido' });
    expect(guardar.disabled).toBe(false);
    await user.click(guardar);
    expect(screen.getAllByText('Ingresa el nombre del cliente.').length).toBeGreaterThan(0);
    expect(setOrders).not.toHaveBeenCalled();
  });
});
