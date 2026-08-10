import type { HistoryStore } from '@/src/workflows/history/history-store';

describe('History initialization error boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@/src/utils/storage', () => ({ storage: {} }));
    jest.doMock('@/src/workflows/history/create-store', () => ({
      createHistoryStore: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/src/utils/storage');
    jest.dontMock('@/src/workflows/history/create-store');
  });

  it('keeps successful History initialization unchanged', async () => {
    const snapshot = { shoe: null, rounds: [] };
    const store = { loadActive: jest.fn().mockResolvedValue(snapshot) } as unknown as HistoryStore;
    const { initializeHistorySession } = await import(
      '@/src/workflows/history/use-history-session'
    );

    await expect(initializeHistorySession(async () => store)).resolves.toEqual({
      ok: true,
      store,
      snapshot,
    });
    expect(store.loadActive).toHaveBeenCalledTimes(1);
  });

  it('turns createHistoryStore rejection into explicit readable state without an unhandled rejection', async () => {
    const error = new Error('NativeDatabase.execAsync initialization failed');
    const { initializeHistorySession } = await import(
      '@/src/workflows/history/use-history-session'
    );

    await expect(
      initializeHistorySession(async () => Promise.reject(error)),
    ).resolves.toEqual({ ok: false, error: error.message });
  });

  it('catches loadActive failure and allows a later retry attempt to succeed', async () => {
    const snapshot = { shoe: null, rounds: [] };
    const firstStore = {
      loadActive: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as HistoryStore;
    const secondStore = {
      loadActive: jest.fn().mockResolvedValue(snapshot),
    } as unknown as HistoryStore;
    const createStore = jest
      .fn<Promise<HistoryStore>, []>()
      .mockResolvedValueOnce(firstStore)
      .mockResolvedValueOnce(secondStore);
    const { initializeHistorySession } = await import(
      '@/src/workflows/history/use-history-session'
    );

    await expect(initializeHistorySession(createStore)).resolves.toEqual({
      ok: false,
      error: 'database unavailable',
    });
    await expect(initializeHistorySession(createStore)).resolves.toEqual({
      ok: true,
      store: secondStore,
      snapshot,
    });
    expect(createStore).toHaveBeenCalledTimes(2);
  });
});
