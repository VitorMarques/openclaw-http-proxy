import { publicJobView } from '@/utils/sanitize';
import { Job } from '@/types';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_abc',
    mode: 'async',
    status: 'complete',
    createdAt: '2026-06-08T00:00:00Z',
    startedAt: '2026-06-08T00:00:01Z',
    completedAt: '2026-06-08T00:01:30Z',
    durationMs: 89_000,
    request: {
      body: { messages: [{ role: 'user', content: 'ping' }] },
      headers: {
        authorization: 'Bearer SUPER-SECRET-TOKEN-XYZ',
        cfAccessClientId: 'cid-secret',
        cfAccessClientSecret: 'sec-leaked-123',
        openclawAgentId: 'hades',
        openclawModel: 'M3',
      },
      webhookUrl: 'https://cb.example.com/x',
      webhookHeaders: { 'X-Auth': 'should-not-leak' },
    },
    result: { status: 200, data: { choices: [{ message: { content: 'pong' } }] } },
    attempts: 1,
    ...overrides,
  };
}

describe('publicJobView (sanitize)', () => {
  it('NUNCA retorna o valor de authorization', () => {
    const view = publicJobView(makeJob());
    const json = JSON.stringify(view);
    expect(json).not.toContain('SUPER-SECRET-TOKEN-XYZ');
    expect(json).not.toContain('Bearer SUPER-SECRET');
  });

  it('NUNCA retorna o valor de cfAccessClientSecret', () => {
    const view = publicJobView(makeJob());
    const json = JSON.stringify(view);
    expect(json).not.toContain('sec-leaked-123');
  });

  it('NUNCA retorna o valor de cfAccessClientId', () => {
    const view = publicJobView(makeJob());
    const json = JSON.stringify(view);
    expect(json).not.toContain('cid-secret');
  });

  it('NUNCA retorna webhookHeaders (podem ter auth do receiver)', () => {
    const view = publicJobView(makeJob());
    const json = JSON.stringify(view);
    expect(json).not.toContain('should-not-leak');
    expect(json).not.toContain('X-Auth');
    expect(view.request.webhookConfigured).toBe(true);
  });

  it('omite os campos sensíveis da lista de headers enviados', () => {
    const view = publicJobView(makeJob());
    expect(view.request.headers.sent).toEqual(['openclawAgentId', 'openclawModel']);
    expect(view.request.headers.redacted).toEqual([
      'authorization',
      'cfAccessClientId',
      'cfAccessClientSecret',
    ]);
  });

  it('retorna o body (não tem auth dentro)', () => {
    const view = publicJobView(makeJob());
    expect(view.request.body).toEqual({ messages: [{ role: 'user', content: 'ping' }] });
  });

  it('retorna result.data e error do upstream (não são auth)', () => {
    const view = publicJobView(makeJob());
    expect(view.result).toEqual({ status: 200, data: { choices: [{ message: { content: 'pong' } }] } });
  });

  it('retorna webhookUrl (cliente mandou, ele já sabe)', () => {
    const view = publicJobView(makeJob());
    expect(view.request.webhookUrl).toBe('https://cb.example.com/x');
  });

  it('marca webhookConfigured=false quando não tem', () => {
    const job = makeJob();
    delete job.request.webhookUrl;
    const view = publicJobView(job);
    expect(view.request.webhookConfigured).toBe(false);
    expect(view.request.webhookUrl).toBeUndefined();
  });

  it('preserva campos top-level (id, status, durationMs, etc)', () => {
    const view = publicJobView(makeJob());
    expect(view.id).toBe('job_abc');
    expect(view.status).toBe('complete');
    expect(view.durationMs).toBe(89_000);
    expect(view.attempts).toBe(1);
  });
});
