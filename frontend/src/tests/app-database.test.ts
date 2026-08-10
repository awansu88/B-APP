import type { ExpoSqliteDatabase } from '@/src/data/database/expo-sqlite-database';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeDatabase(): ExpoSqliteDatabase {
  return {
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    withTransactionAsync: jest.fn(),
    serializeAsync: jest.fn().mockResolvedValue(new Uint8Array()),
  } as unknown as ExpoSqliteDatabase;
}

async function loadProvider(
  open: jest.Mock,
  migrate: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  jest.resetModules();
  jest.doMock('@/src/data/database/expo-sqlite-database', () => ({
    ExpoSqliteDatabase: { open },
  }));
  jest.doMock('@/src/data/database/migrations', () => ({ runMigrations: migrate }));
  const { getAppDatabase } = await import('@/src/data/database/app-database');
  return { getAppDatabase, open, migrate };
}

describe('process-wide native app database initialization', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/src/data/database/expo-sqlite-database');
    jest.dontMock('@/src/data/database/migrations');
    jest.dontMock('@/src/utils/storage');
  });

  it('shares the same promise, open, migration, and resolved database across two concurrent calls', async () => {
    const db = fakeDatabase();
    const pending = deferred<ExpoSqliteDatabase>();
    const loaded = await loadProvider(jest.fn(() => pending.promise));

    const first = loaded.getAppDatabase();
    const second = loaded.getAppDatabase();
    expect(second).toBe(first);
    expect(loaded.open).toHaveBeenCalledTimes(1);
    expect(loaded.open).toHaveBeenCalledWith('bapp.db');

    pending.resolve(db);
    await expect(Promise.all([first, second])).resolves.toEqual([db, db]);
    expect(loaded.migrate).toHaveBeenCalledTimes(1);
    expect(loaded.migrate).toHaveBeenCalledWith(db);
  });

  it('shares one initialization across three concurrent History/Session/Backup callers', async () => {
    const db = fakeDatabase();
    const loaded = await loadProvider(jest.fn().mockResolvedValue(db));
    const [history, session, backup] = await Promise.all([
      loaded.getAppDatabase(),
      loaded.getAppDatabase(),
      loaded.getAppDatabase(),
    ]);

    expect(history).toBe(db);
    expect(session).toBe(db);
    expect(backup).toBe(db);
    expect(loaded.open).toHaveBeenCalledTimes(1);
    expect(loaded.migrate).toHaveBeenCalledTimes(1);
  });

  it('resets after open rejection and retries successfully', async () => {
    const error = new Error('open failed');
    const db = fakeDatabase();
    const loaded = await loadProvider(
      jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(db),
    );

    await expect(loaded.getAppDatabase()).rejects.toBe(error);
    await expect(loaded.getAppDatabase()).resolves.toBe(db);
    expect(loaded.open).toHaveBeenCalledTimes(2);
    expect(loaded.migrate).toHaveBeenCalledTimes(1);
  });

  it('resets after migration rejection and retries with a fresh open and migration', async () => {
    const error = new Error('migration failed');
    const firstDb = fakeDatabase();
    const secondDb = fakeDatabase();
    const loaded = await loadProvider(
      jest.fn().mockResolvedValueOnce(firstDb).mockResolvedValueOnce(secondDb),
      jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined),
    );

    await expect(loaded.getAppDatabase()).rejects.toBe(error);
    await expect(loaded.getAppDatabase()).resolves.toBe(secondDb);
    expect(loaded.open).toHaveBeenCalledTimes(2);
    expect(loaded.migrate).toHaveBeenNthCalledWith(1, firstDb);
    expect(loaded.migrate).toHaveBeenNthCalledWith(2, secondDb);
  });

  it('reuses successful initialization for all later callers', async () => {
    const db = fakeDatabase();
    const loaded = await loadProvider(jest.fn().mockResolvedValue(db));

    await loaded.getAppDatabase();
    await loaded.getAppDatabase();
    await loaded.getAppDatabase();
    expect(loaded.open).toHaveBeenCalledTimes(1);
    expect(loaded.migrate).toHaveBeenCalledTimes(1);
  });
});

describe('native factories share the authoritative provider', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/src/data/database/expo-sqlite-database');
    jest.dontMock('@/src/data/database/migrations');
    jest.dontMock('@/src/utils/storage');
  });

  async function loadFactories() {
    const db = fakeDatabase();
    const open = jest.fn().mockResolvedValue(db);
    const migrate = jest.fn().mockResolvedValue(undefined);
    await loadProvider(open, migrate);
    jest.doMock('@/src/utils/storage', () => ({
      storage: {
        getItem: jest.fn(async (_key: string, fallback: unknown) => fallback),
        setItem: jest.fn(async () => true),
      },
    }));
    const history = await import('@/src/workflows/history/create-store');
    const session = await import('@/src/workflows/session/create-session-store');
    const backup = await import('@/src/workflows/backup/create-data-source');
    return { db, open, migrate, history, session, backup };
  }

  it.each([
    ['History → Session → DataSource', ['history', 'session', 'backup']],
    ['DataSource → History → Session', ['backup', 'history', 'session']],
    ['Session → DataSource → History', ['session', 'backup', 'history']],
  ] as const)('%s uses one open and one migration', async (_label, order) => {
    const loaded = await loadFactories();
    const calls = {
      history: () => loaded.history.createHistoryStore(),
      session: () => loaded.session.createSessionStore(),
      backup: () => loaded.backup.createDataSource(),
    };
    for (const factory of order) await calls[factory]();

    expect(loaded.open).toHaveBeenCalledTimes(1);
    expect(loaded.migrate).toHaveBeenCalledTimes(1);
  });

  it('parallel History, live Session, and Statistics/Export DataSource creation has one owner', async () => {
    const loaded = await loadFactories();
    const [history, session, source] = await Promise.all([
      loaded.history.createHistoryStore(),
      loaded.session.createSessionStore(),
      loaded.backup.createDataSource(),
    ]);

    expect(history).toBeDefined();
    expect(session.kind).toBe('sqlite');
    expect(source.runtime).toBe('native-sqlite');
    expect(loaded.open).toHaveBeenCalledTimes(1);
    expect(loaded.migrate).toHaveBeenCalledTimes(1);
  });

  it('History surfaces authoritative SQLite initialization failure instead of using memory', async () => {
    const error = new Error('native SQLite unavailable');
    const loaded = await loadProvider(jest.fn().mockRejectedValue(error));
    jest.doMock('@/src/utils/storage', () => ({ storage: {} }));
    const history = await import('@/src/workflows/history/create-store');

    await expect(history.createHistoryStore()).rejects.toBe(error);
    expect(loaded.migrate).not.toHaveBeenCalled();
  });
});
