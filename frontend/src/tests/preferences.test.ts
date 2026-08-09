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

  it('default profile is STRICT and there is NO numeric-tuning surface', async () => {
    const prefs = await import('@/src/workflows/preferences');
    expect(prefs.getEngineMode()).toBe('STRICT');
    expect(prefs.DEFAULT_PREFERENCES.engineMode).toBe('STRICT');
    // Only presentation booleans + the versioned engineMode string — no numbers.
    expect(Object.keys(prefs.DEFAULT_PREFERENCES).sort()).toEqual(
      ['engineMode', 'showDecisionComparison', 'showDirectionalLean'].sort(),
    );
    expect(typeof prefs.DEFAULT_PREFERENCES.showDirectionalLean).toBe('boolean');
    expect(typeof prefs.DEFAULT_PREFERENCES.showDecisionComparison).toBe('boolean');
  });

  it('the preference can select BALANCED and persists the write', async () => {
    const prefs = await import('@/src/workflows/preferences');
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
    expect(prefs.getEngineMode()).toBe('STRICT');
  });

  it('an invalid persisted engine mode falls back to STRICT', async () => {
    mockStore['bapp.pref.engineMode'] = 'GARBAGE';
    const prefs = await import('@/src/workflows/preferences');
    await flush();
    expect(prefs.getEngineMode()).toBe('STRICT');
  });
});
