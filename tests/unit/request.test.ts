import { extractHeaders, inferMode, buildJob, HEADER_NAMES, PROXY_MODE_HEADER } from '@/utils/request';

function mockReq(headers: Record<string, string> = {}): { header: (k: string) => string | undefined } {
  return { header: (k: string) => headers[k.toLowerCase()] ?? headers[k] };
}

describe('request utilities', () => {
  describe('HEADER_NAMES', () => {
    it('uses lowercase header names (HTTP/1.1 normalization)', () => {
      expect(HEADER_NAMES.authorization).toBe('authorization');
      expect(HEADER_NAMES.cfAccessClientId).toBe('cf-access-client-id');
      expect(HEADER_NAMES.openclawAgentId).toBe('x-openclaw-agent-id');
    });
  });

  describe('PROXY_MODE_HEADER', () => {
    it('is x-proxy-mode', () => {
      expect(PROXY_MODE_HEADER).toBe('x-proxy-mode');
    });
  });

  describe('extractHeaders', () => {
    it('returns all fields as undefined when no headers present', () => {
      const r = extractHeaders(mockReq());
      expect(r).toEqual({
        authorization: undefined,
        cfAccessClientId: undefined,
        cfAccessClientSecret: undefined,
        openclawAgentId: undefined,
        openclawModel: undefined,
        openclawSessionKey: undefined,
        openclawMessageChannel: undefined,
        openclawScopes: undefined,
      });
    });

    it('extracts each known header', () => {
      const r = extractHeaders(
        mockReq({
          authorization: 'Bearer t',
          'cf-access-client-id': 'cid',
          'cf-access-client-secret': 'sec',
          'x-openclaw-agent-id': 'hades',
          'x-openclaw-model': 'M3',
          'x-openclaw-session-key': 'sess',
          'x-openclaw-message-channel': 'test',
          'x-openclaw-scopes': 'admin',
        }),
      );
      expect(r).toEqual({
        authorization: 'Bearer t',
        cfAccessClientId: 'cid',
        cfAccessClientSecret: 'sec',
        openclawAgentId: 'hades',
        openclawModel: 'M3',
        openclawSessionKey: 'sess',
        openclawMessageChannel: 'test',
        openclawScopes: 'admin',
      });
    });

    it('returns undefined for empty-string values', () => {
      const r = extractHeaders(mockReq({ authorization: '' }));
      expect(r.authorization).toBeUndefined();
    });
  });

  describe('inferMode', () => {
    it('returns "sync" when header is "sync"', () => {
      expect(inferMode(mockReq({ 'x-proxy-mode': 'sync' }))).toBe('sync');
    });

    it('returns "async" when header is "async"', () => {
      expect(inferMode(mockReq({ 'x-proxy-mode': 'async' }))).toBe('async');
    });

    it('is case-insensitive (Sync, ASYNC)', () => {
      expect(inferMode(mockReq({ 'x-proxy-mode': 'Sync' }))).toBe('sync');
      expect(inferMode(mockReq({ 'x-proxy-mode': 'ASYNC' }))).toBe('async');
    });

    it('falls back to PROXY_DEFAULT_MODE when header missing', () => {
      // default em tests/setup.ts = sync
      expect(inferMode(mockReq())).toBe('sync');
    });

    it('falls back to default when header is invalid value', () => {
      expect(inferMode(mockReq({ 'x-proxy-mode': 'streaming' }))).toBe('sync');
    });
  });

  describe('buildJob', () => {
    it('creates a job with correct id, status, mode, createdAt', () => {
      const { job, response } = buildJob({
        mode: 'async',
        body: { messages: [] },
        headers: { openclawAgentId: 'hades' },
        publicBaseUrl: 'http://proxy.test',
      });
      expect(job.id).toMatch(/^job_/);
      expect(job.status).toBe('queued');
      expect(job.mode).toBe('async');
      expect(job.attempts).toBe(0);
      expect(response.jobId).toBe(job.id);
      expect(response.status).toBe('queued');
      expect(response.links.self).toBe(`http://proxy.test/v1/jobs/${job.id}`);
    });

    it('injects __openclaw_path marker when openclawPath provided', () => {
      const { job } = buildJob({
        mode: 'async',
        openclawPath: '/v1/responses',
        body: { input: 'hi' },
        headers: {},
        publicBaseUrl: 'http://proxy.test',
      });
      expect((job.request.body as Record<string, unknown>).__openclaw_path).toBe('/v1/responses');
    });

    it('does NOT inject marker when openclawPath is absent', () => {
      const { job } = buildJob({
        mode: 'async',
        body: { messages: [] },
        headers: {},
        publicBaseUrl: 'http://proxy.test',
      });
      expect((job.request.body as Record<string, unknown>).__openclaw_path).toBeUndefined();
    });

    it('extracts webhook_url and webhook_headers from body into job.request', () => {
      const { job } = buildJob({
        mode: 'async',
        body: { messages: [], webhook_url: 'https://cb.example.com/x', webhook_headers: { 'X-Sig': 'abc' } },
        headers: {},
        publicBaseUrl: 'http://proxy.test',
      });
      expect(job.request.webhookUrl).toBe('https://cb.example.com/x');
      expect(job.request.webhookHeaders).toEqual({ 'X-Sig': 'abc' });
    });

    it('returns webhook link only when webhook_url present', () => {
      const withWebhook = buildJob({
        mode: 'async',
        body: { webhook_url: 'https://cb/x' },
        headers: {},
        publicBaseUrl: 'http://proxy.test',
      });
      const withoutWebhook = buildJob({
        mode: 'async',
        body: { messages: [] },
        headers: {},
        publicBaseUrl: 'http://proxy.test',
      });
      expect(withWebhook.response.links.webhook).toBe('https://cb/x');
      expect(withoutWebhook.response.links.webhook).toBeUndefined();
    });
  });
});
