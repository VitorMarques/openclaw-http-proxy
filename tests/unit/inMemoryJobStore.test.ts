import { InMemoryJobStore } from '@/services/inMemoryJobStore';
import { Job } from '@/types';

function makeJob(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    mode: 'async',
    status: 'queued',
    createdAt: new Date().toISOString(),
    request: { body: { foo: 'bar' }, headers: {} },
    attempts: 0,
    ...overrides,
  };
}

describe('InMemoryJobStore', () => {
  let store: InMemoryJobStore;

  beforeEach(() => {
    store = new InMemoryJobStore();
  });

  describe('save + get', () => {
    it('persists a job and retrieves it', async () => {
      const job = makeJob('job_1');
      await store.save(job);
      const fetched = await store.get('job_1');
      expect(fetched).toMatchObject({ id: 'job_1', status: 'queued' });
    });

    it('returns undefined for unknown id', async () => {
      expect(await store.get('job_missing')).toBeUndefined();
    });

    it('returns a copy (no mutation leak)', async () => {
      const job = makeJob('job_1');
      await store.save(job);
      const fetched = await store.get('job_1');
      fetched!.status = 'error';
      const refetched = await store.get('job_1');
      expect(refetched!.status).toBe('queued');
    });
  });

  describe('update', () => {
    it('merges patch into existing job', async () => {
      await store.save(makeJob('job_1'));
      const updated = await store.update('job_1', { status: 'running', attempts: 1 });
      expect(updated!.status).toBe('running');
      expect(updated!.attempts).toBe(1);
    });

    it('preserves immutable fields (id, createdAt)', async () => {
      const original = makeJob('job_1');
      await store.save(original);
      await store.update('job_1', { id: 'job_hacked', createdAt: '2020-01-01' } as Partial<Job>);
      const fetched = await store.get('job_1');
      expect(fetched!.id).toBe('job_1');
      expect(fetched!.createdAt).toBe(original.createdAt);
    });

    it('returns undefined for unknown id', async () => {
      expect(await store.update('job_missing', { status: 'running' })).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns jobs sorted by createdAt desc', async () => {
      await store.save(makeJob('a', { createdAt: '2026-01-01T00:00:00Z' }));
      await store.save(makeJob('b', { createdAt: '2026-01-02T00:00:00Z' }));
      await store.save(makeJob('c', { createdAt: '2026-01-03T00:00:00Z' }));
      const list = await store.list();
      expect(list.map((j) => j.id)).toEqual(['c', 'b', 'a']);
    });

    it('filters by status', async () => {
      await store.save(makeJob('a', { status: 'queued' }));
      await store.save(makeJob('b', { status: 'complete' }));
      const queued = await store.list({ status: 'queued' });
      expect(queued.map((j) => j.id)).toEqual(['a']);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await store.save(makeJob(`j${i}`));
      const list = await store.list({ limit: 3 });
      expect(list).toHaveLength(3);
    });
  });

  describe('delete + deleteOlderThan + size', () => {
    it('deletes by id', async () => {
      await store.save(makeJob('job_1'));
      expect(await store.delete('job_1')).toBe(true);
      expect(await store.size()).toBe(0);
    });

    it('returns false when deleting unknown', async () => {
      expect(await store.delete('nope')).toBe(false);
    });

    it('removes jobs older than cutoff', async () => {
      const old = new Date(Date.now() - 100_000).toISOString();
      const recent = new Date().toISOString();
      await store.save(makeJob('old1', { createdAt: old }));
      await store.save(makeJob('old2', { createdAt: old, completedAt: old }));
      await store.save(makeJob('new1', { createdAt: recent }));
      const removed = await store.deleteOlderThan(50_000);
      expect(removed).toBe(2);
      expect(await store.size()).toBe(1);
    });
  });
});
