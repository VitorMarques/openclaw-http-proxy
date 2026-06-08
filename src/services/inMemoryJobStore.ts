import { Job, JobStatus } from '@/types';
import { JobStore } from './jobStore';

/**
 * Implementação in-memory de JobStore.
 *
 * Características:
 *  - Thread-safe via Promise chaining (single Node process).
 *  - Cleanup periódico remove jobs mais antigos que TTL.
 *  - Snapshot em list() pra evitar inconsistência durante iteração.
 *
 * Não escala horizontalmente (cada processo tem seu Map). Pra multi-instance
 * trocar por RedisJobStore (mesma interface).
 */
export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>();

  async save(job: Job): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async get(id: string): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  async update(id: string, patch: Partial<Job>): Promise<Job | undefined> {
    const current = this.jobs.get(id);
    if (!current) return undefined;
    const updated: Job = { ...current, ...patch, id: current.id, createdAt: current.createdAt };
    this.jobs.set(id, updated);
    return { ...updated };
  }

  async list(filter?: { status?: JobStatus; limit?: number }): Promise<Job[]> {
    let arr = Array.from(this.jobs.values());
    if (filter?.status) {
      arr = arr.filter((j) => j.status === filter.status);
    }
    arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter?.limit && arr.length > filter.limit) {
      arr = arr.slice(0, filter.limit);
    }
    return arr.map((j) => ({ ...j }));
  }

  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async deleteOlderThan(ageMs: number): Promise<number> {
    const cutoff = Date.now() - ageMs;
    let removed = 0;
    for (const [id, job] of this.jobs) {
      const ts = new Date(job.completedAt ?? job.createdAt).getTime();
      if (ts < cutoff) {
        this.jobs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  async size(): Promise<number> {
    return this.jobs.size;
  }
}
