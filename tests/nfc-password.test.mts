import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../lib/mobile-api', () => ({ requireMobileSession: mocks.session }));
import { GET } from '../app/api/fulfilment/nfc-password/route';
beforeEach(() => { vi.resetAllMocks(); delete process.env.NFC_SHARED_CARD_PASSWORD; mocks.session.mockResolvedValue({ role: 'staff' }); });
const request = () => new Request('https://app.test/api/fulfilment/nfc-password');
it('requires warehouse authentication before returning any password', async () => {
 process.env.NFC_SHARED_CARD_PASSWORD = 'A1B2';
 mocks.session.mockRejectedValueOnce(new Error('SIGN_IN_REQUIRED'));
 const response = await GET(request()); expect(response.status).toBe(401); expect(await response.text()).not.toContain('A1B2');
 mocks.session.mockRejectedValueOnce(new Error('WAREHOUSE_ACCESS_REQUIRED'));
 expect((await GET(request())).status).toBe(403);
});
it('fails closed if missing or incompatible with the Windows helper', async () => {
 expect((await GET(request())).status).toBe(503);
 process.env.NFC_SHARED_CARD_PASSWORD = 'too-long'; expect((await GET(request())).status).toBe(503);
});
it('returns a stable system password without caching', async () => {
 process.env.NFC_SHARED_CARD_PASSWORD = 'A1B2';
 const response = await GET(request()); expect(response.status).toBe(200);
 expect(await response.json()).toEqual({ password: 'A1B2' });
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(await (await GET(request())).json()).toEqual({ password: 'A1B2' });
});
