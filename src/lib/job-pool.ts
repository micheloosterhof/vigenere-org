// ABOUTME: Runs independent solver jobs across a pool of Web Workers, one job per worker at a time.
// ABOUTME: Stops every worker as soon as one decryption reads as English, or when asked to.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

// More workers than this copy the quadgram table around for little gain.
const MAX_WORKERS = 8;

/**
 * Deals the items out to at most `parts` shares in turn, so with the
 * likeliest items first every share starts on one of them.
 */
export function dealOut<T>(items: T[], parts: number): T[][] {
  const shares: T[][] = Array.from(
    { length: Math.min(parts, items.length) },
    () => [],
  );
  items.forEach((item, i) => {
    shares[i % shares.length].push(item);
  });
  return shares;
}

/** What the pool needs to know of a job's result. */
export interface JobResult {
  /** True when the decryption reads as English: the pool then stops. */
  english: boolean;
  /** Average quadgram log10 probability of the decryption. */
  fitness: number;
}

/** What a pool worker accepts: the quadgram table once, then one job per message. */
export type JobWorkerRequest<Job> =
  | { type: "init"; table: ArrayBuffer }
  | { type: "job"; job: Job; text: string };

/** What a pool worker posts back. */
export type JobWorkerMessage<Result> =
  | { type: "progress"; fraction: number }
  | { type: "result"; result: Result }
  | { type: "error"; message: string };

export interface JobPoolProgress<Result> {
  /** Fraction of all jobs done, counting the running ones in part. */
  fraction: number;
  jobsDone: number;
  jobs: number;
  /** Best result so far, if any job has finished. */
  best: Result | null;
}

export interface JobPoolRun<Result> {
  /** The best result: the first English one, else the best of all jobs (null if stopped before any finished). */
  result: Promise<Result | null>;
  /** Stops all workers; the promise resolves with the best result so far. */
  stop(): void;
}

/**
 * Runs `jobs` in order on as many workers as the machine has cores (capped),
 * each made by `spawn`. A worker takes the next job when it finishes one.
 */
export function runJobPool<Job, Result extends JobResult>(
  spawn: () => Worker,
  text: string,
  table: Uint8Array,
  jobs: Job[],
  onProgress?: (progress: JobPoolProgress<Result>) => void,
): JobPoolRun<Result> {
  let stop = (): void => {};
  const result = new Promise<Result | null>((resolve, reject) => {
    if (jobs.length === 0) {
      resolve(null);
      return;
    }
    const cores = navigator.hardwareConcurrency ?? 2;
    const size = Math.max(1, Math.min(jobs.length, cores, MAX_WORKERS));
    const workers: Worker[] = [];
    const running = new Array<number>(size).fill(0);
    let next = 0;
    let done = 0;
    let best: Result | null = null;
    let settled = false;

    const settle = (outcome: () => void): void => {
      if (!settled) {
        settled = true;
        for (const worker of workers) {
          worker.terminate();
        }
        outcome();
      }
    };
    stop = () => settle(() => resolve(best));

    const report = (): void => {
      const partial = running.reduce((sum, f) => sum + f, 0);
      onProgress?.({
        fraction: Math.min(1, (done + partial) / jobs.length),
        jobsDone: done,
        jobs: jobs.length,
        best,
      });
    };

    const dispatch = (index: number): void => {
      if (next >= jobs.length) {
        return;
      }
      const job = jobs[next];
      next += 1;
      running[index] = 0;
      const request: JobWorkerRequest<Job> = { type: "job", job, text };
      workers[index].postMessage(request);
    };

    for (let index = 0; index < size; index += 1) {
      const worker = spawn();
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<JobWorkerMessage<Result>>) => {
        const message = event.data;
        if (message.type === "progress") {
          running[index] = message.fraction;
          report();
        } else if (message.type === "result") {
          done += 1;
          running[index] = 0;
          if (best === null || message.result.fitness > best.fitness) {
            best = message.result;
          }
          report();
          const found = best;
          if (found.english || done === jobs.length) {
            settle(() => resolve(found));
          } else {
            dispatch(index);
          }
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
      const init: JobWorkerRequest<Job> = {
        type: "init",
        table: table.buffer.slice(0) as ArrayBuffer,
      };
      worker.postMessage(init);
      dispatch(index);
    }
  });
  return { result, stop: () => stop() };
}
