import { beforeEach, expect, it, vi } from 'vitest';
const rest = vi.hoisted(() => ({ haySesion: vi.fn(), restMaybeSingle: vi.fn(), restRpc: vi.fn(), restSelect: vi.fn() }));
vi.mock('../../src/api/rest', () => rest);
import { loadCatalogs } from '../../src/api/catalogs';
beforeEach(() => {
  vi.clearAllMocks();
  rest.haySesion.mockResolvedValue(false);
  rest.restSelect.mockResolvedValue({ data: [], error: null });
  rest.restRpc.mockResolvedValue({ data: [], error: null });
});
it('disabled cafe cannot break clinic loading through its optional tables', async () => {
  rest.restMaybeSingle.mockResolvedValue({ data: { content: { cafeEnabled: false } }, error: null });
  const data = await loadCatalogs();
  expect(data.settings.cafeEnabled).toBe(false);
  const tables = rest.restSelect.mock.calls.map(([name]) => name);
  expect(tables).toContain('therapy_services');
  expect(tables).not.toContain('products');
  expect(tables).not.toContain('product_options');
  expect(tables).not.toContain('offers');
});
it('missing flag preserves cafe catalog queries', async () => {
  rest.restMaybeSingle.mockResolvedValue({ data: null, error: null });
  await loadCatalogs();
  expect(rest.restSelect.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['products','product_options','offers']));
});
it('settings read failure is not mistaken for an enabled cafe', async () => {
  const error = new Error('Unavailable');
  rest.restMaybeSingle.mockResolvedValue({ error });
  await expect(loadCatalogs()).rejects.toBe(error);
  expect(rest.restSelect).not.toHaveBeenCalled();
});
