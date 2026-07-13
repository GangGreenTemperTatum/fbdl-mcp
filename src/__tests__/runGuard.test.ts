import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAILURE_COOLDOWN_MS,
  SUCCESS_COOLDOWN_MS,
  resetRunGuard,
  tryAcquireCreateSlot,
} from "../runGuard.js";

beforeEach(() => {
  resetRunGuard();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1_700_000_000_000));
});

afterEach(() => {
  vi.useRealTimers();
  resetRunGuard();
});

describe("runGuard", () => {
  it("grants a slot when no run is in flight and no cooldown is active", () => {
    const result = tryAcquireCreateSlot();
    expect(result.ok).toBe(true);
  });

  it("rejects a second concurrent acquisition while the first is in flight", () => {
    const first = tryAcquireCreateSlot();
    expect(first.ok).toBe(true);

    const second = tryAcquireCreateSlot();
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("in_flight");
    expect(second.message).toContain("Only one run");
  });

  it("blocks new acquisitions for 30s after a successful release", () => {
    const first = tryAcquireCreateSlot();
    if (!first.ok) throw new Error("expected first to acquire");
    first.slot.release("success");

    const blocked = tryAcquireCreateSlot();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("cooldown");
    expect(blocked.message).toContain("successful");
    expect(blocked.cooldownRemainingMs).toBeGreaterThan(0);
    expect(blocked.cooldownRemainingMs).toBeLessThanOrEqual(SUCCESS_COOLDOWN_MS);

    vi.advanceTimersByTime(SUCCESS_COOLDOWN_MS - 1);
    expect(tryAcquireCreateSlot().ok).toBe(false);

    vi.advanceTimersByTime(1);
    expect(tryAcquireCreateSlot().ok).toBe(true);
  });

  it("blocks new acquisitions for 60s after a failed release", () => {
    const first = tryAcquireCreateSlot();
    if (!first.ok) throw new Error("expected first to acquire");
    first.slot.release("failure");

    const blocked = tryAcquireCreateSlot();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("cooldown");
    expect(blocked.message).toContain("failed");

    vi.advanceTimersByTime(SUCCESS_COOLDOWN_MS);
    // Past 30s but failure cooldown is 60s — still blocked.
    expect(tryAcquireCreateSlot().ok).toBe(false);

    vi.advanceTimersByTime(FAILURE_COOLDOWN_MS - SUCCESS_COOLDOWN_MS);
    expect(tryAcquireCreateSlot().ok).toBe(true);
  });

  it("releases the in-flight flag even when subsequent calls are blocked by cooldown", () => {
    const first = tryAcquireCreateSlot();
    if (!first.ok) throw new Error("expected first to acquire");
    first.slot.release("success");

    // In-flight should be clear — the next failure is cooldown, not in_flight.
    const next = tryAcquireCreateSlot();
    if (next.ok) throw new Error("expected cooldown rejection");
    expect(next.reason).toBe("cooldown");
  });
});
