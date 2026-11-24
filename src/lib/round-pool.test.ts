// ABOUTME: Tests for the round pool: one request to each worker, their answers gathered in worker order.
// ABOUTME: Stand-in workers answer when the test tells them to; real Web Workers are covered by the end-to-end tests.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { openRoundPool, type RoundMessage } from "./round-pool";

/** A worker that keeps what it is sent and posts back what the test says. */
class StandInWorker {
  onmessage: ((event: { data: RoundMessage<string> }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  requests: string[] = [];
  terminated = false;

  postMessage(request: string): void {
    this.requests.push(request);
  }

  post(message: RoundMessage<string>): void {
    this.onmessage?.({ data: message });
  }

  terminate(): void {
    this.terminated = true;
  }
}

function standIns(): {
  workers: StandInWorker[];
  spawn: () => Worker;
} {
  const workers: StandInWorker[] = [];
  return {
    workers,
    spawn: () => {
      const worker = new StandInWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  };
}

describe("openRoundPool", () => {
  it("gives each worker its request and gathers the answers in worker order", async () => {
    const { workers, spawn } = standIns();
    const pool = openRoundPool<string>(spawn, 3);
    expect(pool.size).toBe(3);
    const round = pool.ask<string>(["a", "b", "c"]);
    expect(workers.map((worker) => worker.requests)).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
    // The last worker answers first.
    workers[2].post({ type: "answer", answer: "C" });
    workers[0].post({ type: "answer", answer: "A" });
    workers[1].post({ type: "answer", answer: "B" });
    expect(await round).toEqual(["A", "B", "C"]);
  });

  it("takes a round of fewer requests than workers, and one of none", async () => {
    const { workers, spawn } = standIns();
    const pool = openRoundPool<string>(spawn, 3);
    const round = pool.ask<string>(["a", "b"]);
    workers[1].post({ type: "answer", answer: "B" });
    workers[0].post({ type: "answer", answer: "A" });
    expect(await round).toEqual(["A", "B"]);
    expect(workers[2].requests).toEqual([]);
    expect(await pool.ask<string>([])).toEqual([]);
  });

  it("takes round after round on the same workers", async () => {
    const { workers, spawn } = standIns();
    const pool = openRoundPool<string>(spawn, 2);
    const first = pool.ask<string>(["a", "b"]);
    workers[0].post({ type: "answer", answer: "A" });
    workers[1].post({ type: "answer", answer: "B" });
    await first;
    const second = pool.ask<string>(["c", "d"]);
    workers[1].post({ type: "answer", answer: "D" });
    workers[0].post({ type: "answer", answer: "C" });
    expect(await second).toEqual(["C", "D"]);
    expect(workers).toHaveLength(2);
  });

  it("reports the sum of what the workers have done", async () => {
    const { workers, spawn } = standIns();
    const pool = openRoundPool<string>(spawn, 2);
    const seen: number[] = [];
    const round = pool.ask<string>(["a", "b"], (done) => seen.push(done));
    workers[0].post({ type: "progress", done: 500 });
    workers[1].post({ type: "progress", done: 300 });
    workers[0].post({ type: "progress", done: 1000 });
    workers[0].post({ type: "answer", answer: "A" });
    workers[1].post({ type: "answer", answer: "B" });
    await round;
    expect(seen).toEqual([500, 800, 1300]);
  });

  it("fails the round when a worker reports an error or breaks", async () => {
    const { workers, spawn } = standIns();
    const pool = openRoundPool<string>(spawn, 2);
    const reported = pool.ask<string>(["a", "b"]);
    workers[1].post({ type: "error", message: "text is too short" });
    await expect(reported).rejects.toThrow("text is too short");

    const broken = pool.ask<string>(["a", "b"]);
    workers[0].onerror?.({ message: "worker failed to load" });
    await expect(broken).rejects.toThrow("worker failed to load");
  });

  it("stops every worker when closed", () => {
    const { workers, spawn } = standIns();
    const pool = openRoundPool<string>(spawn, 3);
    pool.close();
    expect(workers.map((worker) => worker.terminated)).toEqual([
      true,
      true,
      true,
    ]);
  });
});
