/**
 * M7.1 Patch 2 — engine-mode / UI preference store (section 17 preference parts).
 * Storage is mocked with an in-memory KV so the node test env never loads native
 * AsyncStorage; this also lets us prove the selection SURVIVES A RELOAD.
 */
const mockStore: Record<string, unknown> = {};
jest.mock('@/src/utils/storage', () => ({
  storage: {
    getItem: async (k: string, fallback: unknown) => (k in mockStore ? mockStore[k] : fallback),
    setItem: async (k: string, v: unknown) => {
      mockStore[k] = v;
      return true;
    },
    removeItem: async (k: string) => {
      delete mockStore[k];
      return true;
    },
  },
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Patch 2 · engine-mode preference (section 17)', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    jest.resetModules();
  });

  it('default profile is matcher-enabled production; only the bounded threshold preset is numeric', async () => {
    const prefs = await import('@/src/workflows/preferences');
    expect(prefs.getEngineMode()).toBe('BALANCED');
    expect(prefs.DEFAULT_PREFERENCES.engineMode).toBe('BALANCED');
    // Presentation booleans + versioned engineMode + the M7.1 Patch-4 Balanced
    // threshold PRESET (bounded 0.55/0.54/0.53/0.52 — not an arbitrary knob).
    expect(Object.keys(prefs.DEFAULT_PREFERENCES).sort()).toEqual(
      ['engineMode', 'nextBalancedThreshold', 'showDecisionComparison', 'showDirectionalLean'].sort(),
    );
    expect(typeof prefs.DEFAULT_PREFERENCES.showDirectionalLean).toBe('boolean');
    expect(typeof prefs.DEFAULT_PREFERENCES.showDecisionComparison).toBe('boolean');
    // The only numeric preference is a fixed preset (default 0.53), never free-form.
    expect(prefs.DEFAULT_PREFERENCES.nextBalancedThreshold).toBe(0.53);
    expect([0.55, 0.54, 0.53, 0.52]).toContain(prefs.DEFAULT_PREFERENCES.nextBalancedThreshold);
  });

  it('the preference can select BALANCED and persists the write', async () => {
    const prefs = await import('@/src/workflows/preferences');
    prefs.setEngineMode('STRICT');
    prefs.setEngineMode('BALANCED');
    expect(prefs.getEngineMode()).toBe('BALANCED');
    await flush();
    expect(mockStore['bapp.pref.engineMode']).toBe('BALANCED');
  });

  it('the selection SURVIVES A RELOAD (rehydration from storage)', async () => {
    const first = await import('@/src/workflows/preferences');
    first.setEngineMode('BALANCED');
    await flush();

    jest.resetModules();
    const reloaded = await import('@/src/workflows/preferences');
    await flush(); // allow module-level hydrate() to complete
    expect(reloaded.getEngineMode()).toBe('BALANCED');
  });

  it('presentation toggles round-trip and never affect engineMode', async () => {
    const prefs = await import('@/src/workflows/preferences');
    prefs.setShowDecisionComparison(true);
    prefs.setShowDirectionalLean(false);
    await flush();
    expect(mockStore['bapp.pref.showDecisionComparison']).toBe(true);
    expect(mockStore['bapp.pref.showDirectionalLean']).toBe(false);
    expect(prefs.getEngineMode()).toBe('BALANCED');
  });

  it('an invalid persisted engine mode falls back to production', async () => {
    mockStore['bapp.pref.engineMode'] = 'GARBAGE';
    const prefs = await import('@/src/workflows/preferences');
    await flush();
    expect(prefs.getEngineMode()).toBe('BALANCED');
  });

  // ---- M7.1 Patch 4 — Next-Shoe Balanced threshold preference ----
  it('Next-Shoe threshold defaults to 0.53 and persists a bounded preset write', async () => {
    const prefs = await import('@/src/workflows/preferences');
    expect(prefs.getNextBalancedThreshold()).toBe(0.53);
    prefs.setNextBalancedThreshold(0.52);
    expect(prefs.getNextBalancedThreshold()).toBe(0.52);
    await flush();
    expect(mockStore['bapp.pref.nextBalancedThreshold']).toBe(0.52);
    // it does NOT touch the engine mode (profile selection is independent)
    expect(prefs.getEngineMode()).toBe('BALANCED');
  });

  it('Next-Shoe threshold rehydrates SEPARATELY from engine mode after reload', async () => {
    const first = await import('@/src/workflows/preferences');
    first.setNextBalancedThreshold(0.54);
    first.setEngineMode('BALANCED');
    await flush();
    jest.resetModules();
    const reloaded = await import('@/src/workflows/preferences');
    await flush();
    expect(reloaded.getNextBalancedThreshold()).toBe(0.54);
    expect(reloaded.getEngineMode()).toBe('BALANCED');
  });

  it('migrates a persisted legacy STRICT preference to production', async () => {
    mockStore['bapp.pref.engineMode'] = 'STRICT';
    const prefs = await import('@/src/workflows/preferences');
    await flush();
    expect(prefs.getEngineMode()).toBe('BALANCED');
    expect(mockStore['bapp.pref.engineMode']).toBe('BALANCED');
  });

  it('an invalid persisted Next-Shoe threshold falls back to 0.53', async () => {
    mockStore['bapp.pref.nextBalancedThreshold'] = 0.4;
    const prefs = await import('@/src/workflows/preferences');
    await flush();
    expect(prefs.getNextBalancedThreshold()).toBe(0.53);
  });
});
