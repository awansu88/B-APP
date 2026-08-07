/**
 * Milestone-5C session-store FACTORY fail-safe policy.
 *
 * Durable SQLite/DB-002 persistence is REQUIRED for a native live persisted
 * session. The native factory must NEVER silently downgrade to a volatile
 * AsyncStorage/MemorySessionStore — a failed SQLite init throws an explicit
 * `SessionPersistenceUnavailableError`. The web factory returns the
 * AsyncStorage-compatible memory adapter (preview only).
 *
 * expo-sqlite (and the native AsyncStorage `storage` singleton) can't load in
 * the node test env, so both are mocked and the factory modules are imported
 * dynamically after `jest.doMock` + `jest.resetModules()`.
 */
import { SqlJsDatabase } from './support/sqljs-database';

describe('createSessionStore factory — M5C fail-safe policy', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/src/data/database/expo-sqlite-database');
    jest.dontMock('@/src/utils/storage');
  });

  it('WEB: returns the AsyncStorage-compatible memory adapter (kind=memory)', async () => {
    jest.resetModules();
    jest.doMock('@/src/utils/storage', () => ({
      storage: {
        async getItem(_key: string, fallback: string) {
          return fallback;
        },
        async setItem() {
          return true;
        },
      },
    }));
    const mod = await import('@/src/workflows/session/create-session-store.web');
    const created = await mod.createSessionStore();
    expect(created.kind).toBe('memory');
    expect(created.store).toBeDefined();
  });

  it('NATIVE success: opens SQLite/DB-002 and returns the durable adapter (kind=sqlite)', async () => {
    jest.resetModules();
    jest.doMock('@/src/data/database/expo-sqlite-database', () => ({
      ExpoSqliteDatabase: { open: async () => await SqlJsDatabase.open() },
    }));
    const mod = await import('@/src/workflows/session/create-session-store');
    const created = await mod.createSessionStore();
    expect(created.kind).toBe('sqlite');
    expect(created.store).toBeDefined();
  });

  it('NATIVE SQLite init failure: throws SessionPersistenceUnavailableError (never a memory store)', async () => {
    jest.resetModules();
    jest.doMock('@/src/data/database/expo-sqlite-database', () => ({
      ExpoSqliteDatabase: {
        open: async () => {
          throw new Error('sqlite unavailable on this device');
        },
      },
    }));
    const mod = await import('@/src/workflows/session/create-session-store');
    const storeMod = await import('@/src/workflows/session/session-store');
    await expect(mod.createSessionStore()).rejects.toBeInstanceOf(
      storeMod.SessionPersistenceUnavailableError,
    );
  });
});
