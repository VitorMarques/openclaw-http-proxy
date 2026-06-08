import axios from 'axios';
import { OpenClawClient } from '@/services/openclawClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenClawClient', () => {
  let client: OpenClawClient;
  let mockRequest: jest.Mock;

  beforeEach(() => {
    mockRequest = jest.fn();
    mockedAxios.create.mockReturnValue({ request: mockRequest } as never);
    client = new OpenClawClient('http://test:1234', 5000);
  });

  it('forwards body and all relevant headers', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: { ok: true } });
    await client.call({
      path: '/v1/chat/completions',
      body: { model: 'openclaw/hades', messages: [] },
      headers: {
        authorization: 'Bearer test-token-abc',
        cfAccessClientId: 'cid',
        cfAccessClientSecret: 'sec',
        openclawAgentId: 'hades',
        openclawModel: 'override',
        openclawSessionKey: 'sess',
        openclawMessageChannel: 'test',
        openclawScopes: 'admin',
      },
    });
    const cfg = mockRequest.mock.calls[0][0] as { method: string; url: string; data: unknown; headers: Record<string, string> };
    expect(cfg.method).toBe('POST');
    expect(cfg.url).toBe('/v1/chat/completions');
    expect(cfg.data).toEqual({ model: 'openclaw/hades', messages: [] });
    expect(cfg.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token-abc',
      'CF-Access-Client-Id': 'cid',
      'CF-Access-Client-Secret': 'sec',
      'x-openclaw-agent-id': 'hades',
      'x-openclaw-model': 'override',
      'x-openclaw-session-key': 'sess',
      'x-openclaw-message-channel': 'test',
      'x-openclaw-scopes': 'admin',
    });
  });

  it('returns the upstream status + data', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: { hello: 'world' } });
    const out = await client.call({ path: '/v1/models', headers: {} });
    expect(out.status).toBe(200);
    expect(out.data).toEqual({ hello: 'world' });
  });

  it('does not throw on 4xx/5xx, returns status', async () => {
    mockRequest.mockResolvedValue({ status: 502, data: { error: 'bad gateway' } });
    const out = await client.call({ path: '/v1/chat/completions', headers: {} });
    expect(out.status).toBe(502);
    expect(out.data).toEqual({ error: 'bad gateway' });
  });

  it('propagates network errors to caller', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.call({ path: '/v1/chat/completions', headers: {} })).rejects.toThrow('ECONNREFUSED');
  });

  it('only sets headers that are present', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: {} });
    await client.call({ path: '/v1/responses', headers: { openclawAgentId: 'minerva' } });
    const cfg = mockRequest.mock.calls[0][0] as { headers: Record<string, string> };
    expect(cfg.headers['x-openclaw-agent-id']).toBe('minerva');
    expect(cfg.headers['Authorization']).toBeUndefined();
    expect(cfg.headers['CF-Access-Client-Id']).toBeUndefined();
  });
});
