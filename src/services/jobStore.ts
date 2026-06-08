import { Job, JobStatus } from '@/types';

/**
 * Interface de persistência de jobs.
 *
 * Design: o processador não conhece a implementação. Trocar in-memory
 * por Redis/Postgres/etc é mudar só o construtor de DI.
 */
export interface JobStore {
  save(job: Job): Promise<void>;
  get(id: string): Promise<Job | undefined>;
  update(id: string, patch: Partial<Job>): Promise<Job | undefined>;
  list(filter?: { status?: JobStatus; limit?: number }): Promise<Job[]>;
  delete(id: string): Promise<boolean>;
  deleteOlderThan(ageMs: number): Promise<number>;
  size(): Promise<number>;
}
