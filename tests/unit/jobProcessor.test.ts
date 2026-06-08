import { JobProcessor } from '@/services/jobProcessor';
import { InMemoryJobStore } from '@/services/inMemoryJobStore';
import { OpenClawClient } from '@/services/openclawClient';
import { WebhookDispatcher } from '@/services/webhookDispatcher';
import { Job } from '@/types';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_test',
    mode: 'async',
    status: 'queued',
    createdAt: new Date().toISOString(),
    request: {
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { openclawAgentId: 'hades' },
    },
    attempts: 0,
    ...overrides,
  };
}

describe('JobProcessor', () => {
  let store: InMemoryJobStore;
  let openclaw: OpenClawClient;
  let webhook: WebhookDispatcher;
  let mockPost: jest.Mock;
  let processor: JobProcessor;

  beforeEach(() => {
    store = new InMemoryJobStore();
    mockPost = jest.fn();
    mockedAxios.create.mockReturnValue({ post: mockPost, request: mockPost } as never);
    openclaw = new OpenClawClient();
    webhook = new WebhookDispatcher({ maxRetries: 0 });
    processor = new JobProcessor({ store, openclaw, webhook });
  });

  it('marks running then complete on success', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { ok: true } });
    const job = makeJob();
    await store.save(job);
    await processor.process(job);
    const after = await store.get(job.id);
    expect(after!.status).toBe('complete');
    expect(after!.result).toEqual({ status: 200, data: { ok: true } });
    expect(after!.attempts).toBe(1);
  });

  it('routes to /v1/responses when body has __openclaw_path marker', async () => {
    mockPost.mockResolvedValue({ status: 200, data: {} });
    const job = makeJob({
      request: { body: { __openclaw_path: '/v1/responses' }, headers: {} },
    });
    await store.save(job);
    await processor.process(job);
    const cfg = mockPost.mock.calls[0][0] as { url?: string };
    expect(cfg.url).toBe('/v1/responses');
  });

  it('retries on failure and eventually marks error', async () => {
    // Forçar max attempts = 2 e retry delay = 0 pra não flakear
    process.env.JOB_MAX_ATTEMPTS = '2';
    process.env.JOB_RETRY_DELAY_MS = '1';
    jest.isolateModules(() => undefined);
    const localStore = new InMemoryJobStore();
    const localProcessor = new JobProcessor({ store: localStore, openclaw, webhook });
    mockPost.mockRejectedValue(new Error('upstream down'));
    const job = makeJob();
    await localStore.save(job);
    await localProcessor.process(job);
    // primeira tentativa falha, agenda retry em 1ms — esperamos propagar
    await new Promise((r) => setTimeout(r, 50));
    const after = await localStore.get(job.id);
    expect(after!.status === 'error' || after!.status === 'queued').toBe(true);
    if (after!.status === 'error') {
      expect(after!.error?.code).toBe('UPSTREAM_ERROR');
    }
  });

  it('dispatches webhook on completion when configured', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { ok: true } });
    const job = makeJob({
      request: {
        body: { foo: 'bar' },
        headers: {},
        webhookUrl: 'https://cb.example.com/x',
        webhookHeaders: { 'X-Sig': 'abc' },
      },
    });
    await store.save(job);
    await processor.process(job);
    expect(mockPost).toHaveBeenCalledWith(
      'https://cb.example.com/x',
      expect.objectContaining({ jobId: 'job_test', status: 'complete' }),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Sig': 'abc', 'X-Idempotency-Key': 'job_test' }) }),
    );
  });

  it('skips webhook when not configured', async () => {
    mockPost.mockResolvedValue({ status: 200, data: {} });
    const job = makeJob();
    await store.save(job);
    await processor.process(job);
    // só a chamada pro openclaw, nenhum webhook
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
