const fs = require('fs');
const os = require('os');
const path = require('path');
let mockConnections,
  mockRecords,
  mockOpenError,
  mockCloseError,
  mockBeforeOpen,
  mockMainThread,
  mockCommitHook;
jest.mock('worker_threads', () => ({
  get isMainThread() {
    return mockMainThread;
  },
}));
const mockSchema =
  'CREATE TABLE account_fence (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL CHECK (version = 1))';
jest.mock('better-sqlite3', () =>
  jest.fn().mockImplementation((filename, options) => {
    if (mockBeforeOpen) mockBeforeOpen(filename);
    if (mockOpenError) throw mockOpenError;
    const record = mockRecords.get(filename) || { schema: [], rows: [], mode: 'delete' };
    mockRecords.set(filename, record);
    let locking = 'normal',
      journalLimit = -1;
    const db = {
      open: true,
      filename,
      options,
      calls: [],
      pragma(sql, options) {
        this.calls.push(['pragma', sql, options]);
        if (sql === 'journal_mode') return record.mode;
        if (sql === 'journal_size_limit = 0') journalLimit = 0;
        if (sql === 'journal_size_limit') return journalLimit;
        if (sql === 'locking_mode = EXCLUSIVE') locking = 'exclusive';
        if (sql === 'locking_mode') return locking;
        if (sql === 'page_size') return 4096;
        if (sql.startsWith('max_page_count = ')) return Number(sql.split(' = ')[1]);
      },
      exec(sql) {
        this.calls.push(['exec', sql]);
        if (sql === mockSchema)
          record.schema = [{ type: 'table', name: 'account_fence', sql: mockSchema }];
        if (sql === 'COMMIT') {
          const bytes = Buffer.alloc(4096);
          Buffer.from('SQLite format 3\0').copy(bytes);
          bytes[18] = bytes[19] = 1;
          require('fs').writeFileSync(filename, bytes);
          require('fs').writeFileSync(filename + '-journal', '');
          mockCommitHook?.(filename);
        }
      },
      prepare(sql) {
        this.calls.push(['prepare', sql]);
        return {
          all: () => (sql.includes('sqlite_master') ? record.schema : record.rows),
          run: () => {
            record.rows = [{ id: 1, version: 1 }];
          },
        };
      },
      close: jest.fn(function () {
        if (mockCloseError) throw mockCloseError;
        this.open = false;
      }),
    };
    mockConnections.push(db);
    return db;
  }),
  { virtual: true }
);
const { openRailgunAccountFence } = require("../src/owners/railgun-account-fence.js");
const Database = require('better-sqlite3');
let directory;
const filename = () => path.join(directory, 'writer-fence.sqlite');
const open = (create = true) => openRailgunAccountFence({ directory, create });
beforeEach(() => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'railgun-fence-unit-')));
  mockMainThread = true;
  mockConnections = [];
  mockRecords = new Map();
  mockOpenError = mockCloseError = mockBeforeOpen = mockCommitHook = undefined;
  Database.mockClear();
});

const { withFenceValidation } = require("../src/owners/fence-validation");
afterEach(() => jest.restoreAllMocks());
test("one frame checks disk on first predicate and exit, never caches a later call", () => {
  const fence = open(), stat = jest.spyOn(fs, "realpathSync");
  withFenceValidation(() => {
    for (let i = 0; i < 30; i++) fence.assertValidationCurrent();
    withFenceValidation(() => fence.assertValidationCurrent());
    expect(stat).toHaveBeenCalledTimes(1);
  });
  expect(stat).toHaveBeenCalledTimes(2);
  fence.assertValidationCurrent();
  expect(stat).toHaveBeenCalledTimes(3);
  fence.close();
});
test.each(["file", "directory", "journal", "wal", "shm"])(
  "%s mutation during validation refuses at exit and quarantines", (kind) => {
    const fence = open(), db = mockConnections[0];
    expect(() => withFenceValidation(() => {
      fence.assertValidationCurrent();
      if (kind === "file") {
        fs.renameSync(filename(), filename() + ".retained");
        fs.writeFileSync(filename(), "replacement");
      } else if (kind === "directory") {
        fs.renameSync(directory, directory + "-retained");
        fs.symlinkSync(directory + "-retained", directory);
      } else fs.writeFileSync(filename() + "-" + kind, "changed");
      fence.assertValidationCurrent();
    })).toThrow();
    expect(fence.signal.aborted).toBe(true);
    expect(db.close).not.toHaveBeenCalled();
    expect(() => fence.assertCurrent()).toThrow();
  },
);
test("reentrant writer admission still checks physical identity before its callback", () => {
  const fence = open(), write = jest.fn();
  expect(() => withFenceValidation(() => {
    fence.assertValidationCurrent();
    fs.writeFileSync(filename() + "-wal", "changed");
    expect(() => fence.run(write)).toThrow();
  })).toThrow();
  expect(write).not.toHaveBeenCalled();
});
test("direct assertion does not reuse a context predicate", () => {
  const fence = open();
  let directError;
  expect(() => withFenceValidation(() => {
    fence.assertValidationCurrent();
    fs.writeFileSync(filename() + "-wal", "changed");
    try { fence.assertCurrent(); } catch (error) { directError = error; }
  })).toThrow();
  expect(directError?.code).toBe("RAILGUN_ACCOUNT_FENCE_REFUSED");
});
test.each(["close", "retainUntilExit", "database"])(
  "%s is checked on every nested predicate", (method) => {
    const fence = open();
    let predicateError;
    expect(() => withFenceValidation(() => {
      fence.assertValidationCurrent();
      if (method === "database") mockConnections[0].open = false;
      else fence[method]();
      try { fence.assertValidationCurrent(); } catch (error) { predicateError = error; }
    })).toThrow();
    expect(predicateError?.code).toBe("RAILGUN_ACCOUNT_FENCE_REFUSED");
  },
);
test("throws clear the frame and perform exit checks", () => {
  const fence = open(), stat = jest.spyOn(fs, "realpathSync"), original = Error("original");
  expect(() => withFenceValidation(() => {
    fence.assertValidationCurrent();
    withFenceValidation(() => { throw original; });
  })).toThrow(original);
  expect(stat).toHaveBeenCalledTimes(2);
  fence.assertValidationCurrent();
  expect(stat).toHaveBeenCalledTimes(3);
  fence.close();
});
test("two fences are independently checked, including after the first exit fails", () => {
  const first = open(), firstFile = filename();
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "railgun-fence-second-")));
  const second = open();
  expect(() => withFenceValidation(() => {
    first.assertValidationCurrent(); second.assertValidationCurrent();
    fs.writeFileSync(firstFile + "-wal", "bad");
    fs.writeFileSync(filename() + "-wal", "bad");
  })).toThrow();
  expect(first.signal.aborted).toBe(true);
  expect(second.signal.aborted).toBe(true);
});
test("promise and thenable results refuse without retaining a frame across await", async () => {
  const fence = open(), stat = jest.spyOn(fs, "realpathSync");
  expect(() => withFenceValidation(() => {
    fence.assertValidationCurrent(); return Promise.resolve();
  })).toThrow(expect.objectContaining({ code: "RAILGUN_OWNER_HOST_UNAVAILABLE" }));
  expect(stat).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  fence.assertValidationCurrent();
  expect(stat).toHaveBeenCalledTimes(3);
  const then = jest.fn();
  expect(() => withFenceValidation(() => ({ then }))).toThrow();
  expect(then).not.toHaveBeenCalled();
  fence.close();
});

test("real host nested context validation performs two physical fence checks without writes or requests", () => {
  const { createContextHost } = require("../examples/reference-wallet/host/context.cjs");
  const fence = open(), host = createContextHost();
  const signal = new AbortController().signal;
  const subject = { kind: "private-account", principal: "railgun:0", chainId: 11155111,
    protocol: "railgun", deployment: "sepolia", role: "storage" };
  // Exercise the enrollment predicate's genuine fence method through the real
  // host and a repeated parent-context graph. Identity/key custody is covered
  // by enrollment tests and the installed native journey, not fabricated here.
  const logical = jest.fn(() => { fence.assertValidationCurrent(); return true; });
  const parent = host.createPrivacyScope({ profileId: "alice", signal, isCurrent: logical });
  const handle = parent.getContext(subject);
  const child = host.createPrivacyScope({ profileId: "alice", signal, isCurrent: () => {
    for (let i = 0; i < 5; i++) host.getPrivacyContext(handle);
    return true;
  } });
  const childHandle = child.getContext({ ...subject, role: "prover" });
  const stat = jest.spyOn(fs, "realpathSync");
  const guards = [];
  for (const method of ["writeFileSync", "writeSync", "renameSync", "fsyncSync"])
    guards.push(jest.spyOn(fs, method).mockImplementation(() => { throw Error("write during validation"); }));
  const originalOpen = fs.openSync;
  guards.push(jest.spyOn(fs, "openSync").mockImplementation((file, flags, ...rest) => {
    if (flags !== "r") throw Error("write-open during validation");
    return originalOpen(file, flags, ...rest);
  }));
  for (const name of ["node:http", "node:https"])
    guards.push(jest.spyOn(require(name), "request").mockImplementation(() => { throw Error("request during validation"); }));
  logical.mockClear();
  withFenceValidation(() => host.getPrivacyContext(childHandle));
  expect(logical).toHaveBeenCalledTimes(5);
  expect(stat).toHaveBeenCalledTimes(2);
  for (const guard of guards) expect(guard).not.toHaveBeenCalled();
  stat.mockClear();
  child.getContext(subject);
  expect(stat).toHaveBeenCalledTimes(5);
  stat.mockClear();
  host.getPrivacyContext(childHandle);
  expect(stat).toHaveBeenCalledTimes(5);
  for (const guard of guards) guard.mockRestore();
  child.close(); parent.close(); fence.close();
});
