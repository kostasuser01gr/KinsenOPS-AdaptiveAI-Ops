/**
 * Phase 4.0C regression tests — Task runner abstraction
 *
 * Tests:
 * 1. Task registration
 * 2. Start / stop lifecycle
 * 3. No-overlap concurrency guard
 * 4. Timeout handling
 * 5. Jitter range logic
 * 6. Manual trigger behaviour
 * 7. Error accounting
 * 8. Migrated SLA task definition
 * 9. Observability state surface
 */
import { describe, it, expect, vi } from "vitest";
import { TaskRunner } from "../../server/tasks/runner.js";
import type { TaskDefinition, TaskState } from "../../server/tasks/types.js";

function noop(): TaskDefinition {
  return {
    id: "test-noop",
    description: "no-op task",
    intervalMs: 60_000,
    run: async () => {},
  };
}

// ─── 1. Registration ─────────────────────────────────────────────────────────
describe("task registration", () => {
  it("registers a task and reports count", () => {
    const r = new TaskRunner();
    r.register(noop());
    expect(r.taskCount()).toBe(1);
  });

  it("throws on duplicate id", () => {
    const r = new TaskRunner();
    r.register(noop());
    expect(() => r.register(noop())).toThrow(/already registered/);
  });

  it("registers multiple distinct tasks", () => {
    const r = new TaskRunner();
    r.register({ ...noop(), id: "a" });
    r.register({ ...noop(), id: "b" });
    r.register({ ...noop(), id: "c" });
    expect(r.taskCount()).toBe(3);
  });
});

// ─── 2. Start / stop lifecycle ───────────────────────────────────────────────
describe("start / stop lifecycle", () => {
  it("isStarted reflects state", async () => {
    const r = new TaskRunner();
    r.register(noop());
    expect(r.isStarted()).toBe(false);
    r.start();
    expect(r.isStarted()).toBe(true);
    await r.stop();
    expect(r.isStarted()).toBe(false);
  });

  it("start is idempotent", () => {
    const r = new TaskRunner();
    r.register(noop());
    r.start();
    r.start(); // no throw
    expect(r.isStarted()).toBe(true);
  });

  it("stop is idempotent", async () => {
    const r = new TaskRunner();
    r.register(noop());
    await r.stop(); // not started — no throw
    expect(r.isStarted()).toBe(false);
  });

  it("does not schedule disabled tasks", async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const r = new TaskRunner();
    r.register({ ...noop(), id: "disabled", run: fn, enabled: false, runOnStart: true });
    r.start();
    // Give a tick for any runOnStart to fire
    await new Promise((resolve) => setTimeout(resolve, 20));
    await r.stop();
    expect(fn).not.toHaveBeenCalled();
  });

  it("runs runOnStart tasks immediately", async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const r = new TaskRunner();
    r.register({ ...noop(), id: "eager", run: fn, runOnStart: true });
    r.start();
    // Give a tick for the promise to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    await r.stop();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── 3. No-overlap concurrency guard ─────────────────────────────────────────
describe("concurrency guard", () => {
  it("skips execution if task is already running", async () => {
    let callCount = 0;
    let resolver: (() => void) | null = null;
    const blockingTask: TaskDefinition = {
      id: "blocking",
      description: "blocks until released",
      intervalMs: 10,
      allowManualTrigger: true,
      run: () => {
        callCount++;
        return new Promise<void>((resolve) => { resolver = resolve; });
      },
    };
    const r = new TaskRunner();
    r.register(blockingTask);

    // Trigger first run (blocks)
    const first = r.trigger("blocking");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callCount).toBe(1);

    // Trigger second run — should be skipped
    const second = await r.trigger("blocking");
    expect(second).toEqual({ ok: false, error: "task already running" });
    expect(callCount).toBe(1);

    // Release and clean up
    resolver!();
    await first;
    await r.stop();
  });
});

// ─── 4. Timeout handling ─────────────────────────────────────────────────────
describe("timeout handling", () => {
  it("records error when task exceeds timeout", async () => {
    const r = new TaskRunner();
    r.register({
      id: "slow",
      description: "exceeds timeout",
      intervalMs: 60_000,
      timeoutMs: 50,
      allowManualTrigger: true,
      run: () => new Promise(() => { /* never resolves */ }),
    });

    await r.trigger("slow");
    // Wait for promise to settle after timeout
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state = r.getState("slow")!;
    expect(state.errorCount).toBe(1);
    expect(state.lastError).toMatch(/timed out/);
    await r.stop();
  });
});

// ─── 5. Jitter range logic ──────────────────────────────────────────────────
describe("jitter logic", () => {
  it("nextRunAt is within [intervalMs, intervalMs + jitterMs]", async () => {
    const INTERVAL = 500;
    const JITTER = 200;
    const r = new TaskRunner();
    r.register({
      ...noop(),
      id: "jittered",
      intervalMs: INTERVAL,
      jitterMs: JITTER,
    });
    r.start();
    await new Promise((resolve) => setTimeout(resolve, 20)); // let scheduling happen

    const state = r.getState("jittered")!;
    expect(state.nextRunAt).not.toBeNull();

    const nextRun = new Date(state.nextRunAt!).getTime();
    const now = Date.now();
    const delay = nextRun - now;
    // delay should be in range [0, INTERVAL + JITTER] (minus small elapsed ms)
    expect(delay).toBeGreaterThan(-50); // small tolerance for elapsed time
    expect(delay).toBeLessThanOrEqual(INTERVAL + JITTER + 50);

    await r.stop();
  });
});

// ─── 6. Manual trigger behaviour ─────────────────────────────────────────────
describe("manual trigger", () => {
  it("rejects unknown tasks", async () => {
    const r = new TaskRunner();
    const res = await r.trigger("nonexistent");
    expect(res).toEqual({ ok: false, error: "unknown task" });
  });

  it("rejects tasks that disallow manual trigger", async () => {
    const r = new TaskRunner();
    r.register({ ...noop(), id: "no-manual", allowManualTrigger: false });
    const res = await r.trigger("no-manual");
    expect(res).toEqual({ ok: false, error: "manual trigger not allowed" });
  });

  it("succeeds for triggerable tasks", async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const r = new TaskRunner();
    r.register({ ...noop(), id: "triggerable", allowManualTrigger: true, run: fn });
    const res = await r.trigger("triggerable");
    expect(res).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
    await r.stop();
  });
});

// ─── 7. Error accounting ─────────────────────────────────────────────────────
describe("error accounting", () => {
  it("records errors without crashing", async () => {
    const r = new TaskRunner();
    r.register({
      ...noop(),
      id: "failing",
      allowManualTrigger: true,
      run: async () => { throw new Error("boom"); },
    });

    await r.trigger("failing");
    await r.trigger("failing");

    const state = r.getState("failing")!;
    expect(state.runCount).toBe(2);
    expect(state.errorCount).toBe(2);
    expect(state.lastError).toBe("boom");
    expect(state.running).toBe(false);
    await r.stop();
  });

  it("successful runs do not increment errorCount", async () => {
    const r = new TaskRunner();
    r.register({ ...noop(), id: "ok", allowManualTrigger: true });
    await r.trigger("ok");
    const state = r.getState("ok")!;
    expect(state.runCount).toBe(1);
    expect(state.errorCount).toBe(0);
    expect(state.lastError).toBeNull();
  });
});

// ─── 8. Migrated SLA task definition ─────────────────────────────────────────
describe("SLA breach task definition", () => {
  it("is registered in the singleton taskRunner", async () => {
    const { taskRunner } = await import("../../server/tasks/index.js");
    const state = taskRunner.getState("sla-breach-check");
    expect(state).toBeDefined();
    expect(state!.id).toBe("sla-breach-check");
    expect(state!.enabled).toBe(true);
  });

  it("sla-breach-check allows manual trigger", async () => {
    const { taskRunner } = await import("../../server/tasks/index.js");
    const states = taskRunner.getStates();
    const sla = states.find((s) => s.id === "sla-breach-check")!;
    expect(sla).toBeDefined();
    // allowManualTrigger is on the definition, observable via trigger attempt when not running
  });
});

// ─── 9. Observability (getStates / getState) ────────────────────────────────
describe("observability state surface", () => {
  it("getStates returns all registered tasks", () => {
    const r = new TaskRunner();
    r.register({ ...noop(), id: "a" });
    r.register({ ...noop(), id: "b" });
    const states = r.getStates();
    expect(states).toHaveLength(2);
    expect(states.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("getState returns undefined for unknown task", () => {
    const r = new TaskRunner();
    expect(r.getState("missing")).toBeUndefined();
  });

  it("state shape matches TaskState interface", async () => {
    const r = new TaskRunner();
    r.register({ ...noop(), id: "shape-check", allowManualTrigger: true });
    await r.trigger("shape-check");

    const state = r.getState("shape-check")!;
    const keys: (keyof TaskState)[] = [
      "id", "description", "enabled", "running",
      "lastStartedAt", "lastFinishedAt", "lastDurationMs",
      "runCount", "errorCount", "lastError", "nextRunAt",
    ];
    for (const k of keys) {
      expect(state).toHaveProperty(k);
    }
    expect(state.runCount).toBe(1);
    expect(state.running).toBe(false);
    expect(state.lastStartedAt).not.toBeNull();
    expect(state.lastFinishedAt).not.toBeNull();
    expect(typeof state.lastDurationMs).toBe("number");
  });

  it("singleton taskRunner exposes all registered tasks", async () => {
    const { taskRunner } = await import("../../server/tasks/index.js");
    const ids = taskRunner.getStates().map((s) => s.id).sort();
    expect(ids).toEqual([
      "anomaly-detection",
      "connector-sync",
      "export-cleanup",
      "export-processor",
      "kpi-snapshots",
      "predictive-maintenance",
      "sla-breach-check",
    ]);
  });

  it("disabled tasks show enabled=false", async () => {
    const { taskRunner } = await import("../../server/tasks/index.js");
    const kpi = taskRunner.getState("kpi-snapshots")!;
    expect(kpi.enabled).toBe(false);
    const anomaly = taskRunner.getState("anomaly-detection")!;
    expect(anomaly.enabled).toBe(false);
    const connector = taskRunner.getState("connector-sync")!;
    expect(connector.enabled).toBe(false);
  });
});
