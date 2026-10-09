// "JWT issued at future": el token recien emitido se reintenta solo.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { trackedFetch, esTokenDelFuturo } from '../../src/api/supabaseClient';

const resp = (status, cuerpo) => new Response(cuerpo, { status });

describe('reloj adelantado del token', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('reconoce el 401 de "issued at future" y nada mas', async () => {
    expect(await esTokenDelFuturo(resp(401, '{"code":"PGRST303","message":"JWT issued at future"}'))).toBe(true);
    expect(await esTokenDelFuturo(resp(401, '{"message":"JWT expired"}'))).toBe(false);
    expect(await esTokenDelFuturo(resp(200, 'issued at future'))).toBe(false);
  });

  it('reintenta tras una pausa y devuelve la respuesta buena', async () => {
    vi.useFakeTimers();
    const fetchFalso = vi.fn()
      .mockResolvedValueOnce(resp(401, '{"message":"JWT issued at future"}'))
      .mockResolvedValueOnce(resp(200, '[]'));
    vi.stubGlobal('fetch', fetchFalso);
    const promesa = trackedFetch('https://x.supabase.co/rest/v1/payments', { method: 'GET' });
    await vi.advanceTimersByTimeAsync(1000);
    const r = await promesa;
    expect(r.status).toBe(200);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('otro 401 no se reintenta', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resp(401, '{"message":"JWT expired"}'));
    vi.stubGlobal('fetch', fetchFalso);
    const r = await trackedFetch('https://x.supabase.co/rest/v1/payments', { method: 'GET' });
    expect(r.status).toBe(401);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
