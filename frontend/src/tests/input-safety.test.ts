/**
 * Input-safety regression: DuplicateInputGuard (Milestone 5C, Section 12).
 * Proves an accidental rapid double-tap on the single result button cannot
 * create two baccarat rounds, while an intentional later tap still submits the
 * next round. Uses an injected clock for determinism (no real timers).
 */
import { DuplicateInputGuard } from '@/src/domain/history';

function clockGuard(windowMs = 400) {
  let t = 1000;
  const guard = new DuplicateInputGuard(windowMs, () => t);
  return {
    guard,
    at(ms: number) {
      t = ms;
      return guard.tryAccept();
    },
  };
}

describe('DuplicateInputGuard — accidental double-tap protection', () => {
  it('A. the FIRST tap is always accepted immediately (no startup delay)', () => {
    const g = new DuplicateInputGuard(400, () => 5_000);
    expect(g.tryAccept()).toBe(true);
  });

  it('B. an accidental rapid second tap inside the window is REJECTED', () => {
    const c = clockGuard(400);
    expect(c.at(1000)).toBe(true); // round N accepted
    expect(c.at(1050)).toBe(false); // tail of the same gesture (50ms) -> ignored
    expect(c.at(1399)).toBe(false); // still inside the 400ms window
  });

  it('C. an intentional tap after the re-arm window submits the next round', () => {
    const c = clockGuard(400);
    expect(c.at(1000)).toBe(true); // N
    expect(c.at(1100)).toBe(false); // accidental
    expect(c.at(1401)).toBe(true); // deliberate N+1 (>400ms later)
    expect(c.at(1450)).toBe(false); // its own accidental tail rejected
    expect(c.at(1900)).toBe(true); // deliberate N+2
  });

  it('a burst of rapid taps accepts EXACTLY ONE round', () => {
    const c = clockGuard(400);
    const results = [1000, 1030, 1060, 1090, 1120, 1200].map((ms) => c.at(ms));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results[0]).toBe(true);
  });

  it('reset() re-arms immediately (New Shoe / session reset)', () => {
    const c = clockGuard(400);
    expect(c.at(1000)).toBe(true);
    expect(c.at(1100)).toBe(false);
    c.guard.reset();
    expect(c.at(1100)).toBe(true); // first tap of the fresh shoe accepted at the same instant
  });

  it('window is short enough to never block normal manual entry (seconds apart)', () => {
    const c = clockGuard(400);
    expect(c.at(1000)).toBe(true);
    expect(c.at(3000)).toBe(true); // 2s later (human pace) -> accepted
    expect(c.at(6000)).toBe(true);
  });
});
