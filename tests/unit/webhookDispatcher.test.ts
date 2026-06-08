import axios from 'axios';
import { WebhookDispatcher } from '@/services/webhookDispatcher';
import { WebhookPayload } from '@/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const payload: WebhookPayload = {
  jobId: 'job_test123',
  status: 'complete',
  mode: 'async',
  createdAt: '2026-06-08T00:00:00Z',
  completedAt: '2026-06-08T00:01:30Z',
  durationMs: 90_000,
  result: { status: 200, data: { ok: true } },
};

describe('WebhookDispatcher', () => {
  let dispatcher: WebhookDispatcher;
  let mockPost: jest.Mock;

  beforeEach(() => {
    mockPost = jest.fn();
    mockedAxios.create.mockReturnValue({ post: mockPost } as never);
    dispatcher = new WebhookDispatcher({ timeoutMs: 1000, maxRetries: 2 });
  });

  it('returns true on first 2xx', async () => {
    mockPost.mockResolvedValue({ status: 200 });
    const ok = await dispatcher.dispatch('https://cb.example.com/x', payload);
    expect(ok).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    mockPost
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 200 });
    const ok = await dispatcher.dispatch('https://cb.example.com/x', payload);
    expect(ok).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(3);
  });

  it('returns false after exhausting retries', async () => {
    mockPost.mockResolvedValue({ status: 500 });
    const ok = await dispatcher.dispatch('https://cb.example.com/x', payload);
    expect(ok).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(3); // 0 + 1 retry + 2 retry
  });

  it('sends correct headers (idempotency, event, extras)', async () => {
    mockPost.mockResolvedValue({ status: 200 });
    await dispatcher.dispatch('https://cb.example.com/x', payload, { 'X-Sig': 'abc' });
    const cfg = mockPost.mock.calls[0][2] as { headers: Record<string, string> };
    expect(cfg.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Idempotency-Key': 'job_test123',
      'X-Proxy-Event': 'job.complete',
      'X-Sig': 'abc',
    });
  });

  it('treats network error as retryable', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 200 });
    const ok = await dispatcher.dispatch('https://cb.example.com/x', payload);
    expect(ok).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});
