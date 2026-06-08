import request from 'supertest';
import axios from 'axios';
import { createApp } from '@/server';
import { InMemoryJobStore } from '@/services/inMemoryJobStore';
import { OpenClawClient } from '@/services/openclawClient';
import { WebhookDispatcher } from '@/services/webhookDispatcher';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * RFC 7230 §3.2: HTTP headers são case-insensitive.
 * Esses testes provam que o proxy aceita qualquer case nos headers de auth/routing
 * e os repassa corretamente pro OpenClaw.
 */
describe('Header case insensitivity (RFC 7230 §3.2)', () => {
  let mockRequest: jest.Mock;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(() => {
    mockRequest = jest.fn();
    mockedAxios.create.mockReturnValue({ request: mockRequest, post: jest.fn() } as never);
    const openclaw = new OpenClawClient();
    const webhook = new WebhookDispatcher({ maxRetries: 0 });
    const store = new InMemoryJobStore();
    app = createApp({ store, openclaw, webhook, publicBaseUrl: 'http://proxy.test' }).app;
  });

  it('extrai Authorization independente do case (Bearer lowercase)', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: {} });
    await request(app)
      .post('/v1/chat/completions')
      .set('authorization', 'Bearer test-lowercase') // minúsculo
      .send({ model: 'openclaw/hades' });
    const cfg = mockRequest.mock.calls[0][0] as { headers: Record<string, string> };
    expect(cfg.headers['Authorization']).toBe('Bearer test-lowercase');
  });

  it('extrai CF-Access-Client-Id em qualquer case', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: {} });
    await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer t')
      .set('cf-ACCESS-client-ID', 'cid-abc') // mixed case
      .set('CF-ACCESS-CLIENT-SECRET', 'sec-xyz') // UPPERCASE
      .send({ model: 'openclaw/hades' });
    const cfg = mockRequest.mock.calls[0][0] as { headers: Record<string, string> };
    expect(cfg.headers['CF-Access-Client-Id']).toBe('cid-abc');
    expect(cfg.headers['CF-Access-Client-Secret']).toBe('sec-xyz');
  });

  it('extrai x-openclaw-* em qualquer case', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: {} });
    await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer t')
      .set('X-OpenClaw-Agent-Id', 'hades') // CamelCase
      .set('X-OPENCLAW-MODEL', 'M3') // UPPERCASE
      .send({ model: 'openclaw/hades' });
    const cfg = mockRequest.mock.calls[0][0] as { headers: Record<string, string> };
    expect(cfg.headers['x-openclaw-agent-id']).toBe('hades');
    expect(cfg.headers['x-openclaw-model']).toBe('M3');
  });

  it('header inbound normalizado pelo Express + outbound preserva case do client', async () => {
    // IMPORTANTE: Node normaliza os headers RECEBIDOS (req.headers) pra lowercase.
    // Mas o que o client HTTP constrói (axios headers) preserva o case.
    // No WIRE HTTP ambos funcionam — o servidor destino normaliza de novo.
    mockRequest.mockResolvedValue({ status: 200, data: {} });
    await request(app)
      .post('/v1/chat/completions')
      .set('AUTHORIZATION', 'Bearer t')
      .send({});
    const cfg = mockRequest.mock.calls[0][0] as { headers: Record<string, string> };
    // O client constrói com keys específicas (CF-Access-Client-Id, x-openclaw-*).
    // Case no outbound é irrelevante — o OpenClaw server normaliza no parse.
    expect(cfg.headers['Authorization']).toBe('Bearer t');
    expect(typeof cfg.headers['Content-Type']).toBe('string');
  });
});
