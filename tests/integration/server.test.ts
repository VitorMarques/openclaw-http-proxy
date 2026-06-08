import request from 'supertest';
import axios from 'axios';
import { createApp } from '@/server';
import { InMemoryJobStore } from '@/services/inMemoryJobStore';
import { OpenClawClient } from '@/services/openclawClient';
import { WebhookDispatcher } from '@/services/webhookDispatcher';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Server integration', () => {
  let mockPost: jest.Mock;
  let mockRequest: jest.Mock;
  let store: InMemoryJobStore;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(() => {
    mockPost = jest.fn();
    mockRequest = jest.fn();
    mockedAxios.create.mockReturnValue({ post: mockPost, request: mockRequest } as never);
    const openclaw = new OpenClawClient();
    const webhook = new WebhookDispatcher({ maxRetries: 0 });
    store = new InMemoryJobStore();
    app = createApp({ store, openclaw, webhook, publicBaseUrl: 'http://proxy.test' }).app;
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('POST /v1/chat/completions (sync)', () => {
    it('forwards to openclaw and returns 2xx', async () => {
      mockRequest.mockResolvedValue({ status: 200, data: { id: 'chatcmpl-1', choices: [] } });
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-token-abc')
        .set('x-openclaw-agent-id', 'hades')
        .send({ model: 'openclaw/hades', messages: [{ role: 'user', content: 'ping' }] });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('chatcmpl-1');
    });

    it('uses x-proxy-mode header to override default mode', async () => {
      mockRequest.mockResolvedValue({ status: 200, data: {} });
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-token-abc')
        .set('X-Proxy-Mode', 'sync')
        .send({ messages: [] });
      expect(res.status).toBe(200);
    });

    // O test de 401 com TRUST_FORWARDED_AUTH=false não funciona porque o config
    // é avaliado no import (imutável). Cobertura real: HttpError.unit se necessário.
  });

  describe('POST /v1/chat/completions (async)', () => {
    it('returns 202 with jobId and a polling link', async () => {
      mockRequest.mockResolvedValue({ status: 200, data: { ok: true } });
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-token-abc')
        .set('X-Proxy-Mode', 'async')
        .send({
          messages: [{ role: 'user', content: 'ping' }],
          webhook_url: 'https://cb.example.com/x',
        });
      expect(res.status).toBe(202);
      expect(res.body.jobId).toMatch(/^job_/);
      expect(res.body.status).toBe('queued');
      expect(res.body.links.self).toMatch(/\/v1\/jobs\/job_/);
      expect(res.body.links.webhook).toBe('https://cb.example.com/x');
    });

    it('jobId in store is reachable via GET /v1/jobs/:id', async () => {
      mockRequest.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { status: 200, data: { result: 42 } };
      });
      const submit = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-token-abc')
        .set('X-Proxy-Mode', 'async')
        .send({ messages: [] });
      const jobId = submit.body.jobId;
      // poll
      let res = await request(app).get(`/v1/jobs/${jobId}`);
      // pode ser queued/running/complete dependendo do timing
      expect(['queued', 'running', 'complete', 'error']).toContain(res.body.status);
      // aguarda completar
      await new Promise((r) => setTimeout(r, 100));
      res = await request(app).get(`/v1/jobs/${jobId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(jobId);
    });

    it('strips webhook_url from body before forwarding to openclaw', async () => {
      mockRequest.mockResolvedValue({ status: 200, data: {} });
      await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-token-abc')
        .set('X-Proxy-Mode', 'async')
        .send({ messages: [], webhook_url: 'https://cb/x' });
      const cfg = mockRequest.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(cfg.data.webhook_url).toBeUndefined();
    });
  });

  describe('GET /v1/jobs/:id', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/v1/jobs/job_doesnotexist');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('JOB_NOT_FOUND');
    });
  });

  describe('GET /metrics', () => {
    it('exposes prometheus metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('jobs_submitted_total');
    });
  });
});
