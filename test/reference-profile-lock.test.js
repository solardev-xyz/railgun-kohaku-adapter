"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const core = path.resolve(
  __dirname,
  "../examples/reference-wallet/host/profile-lock-core.cjs",
);
const script = `const {acquireLock}=require(process.argv[1]);
const lock=acquireLock({root:process.argv[2],appData:process.argv[3]});
process.stdout.write(JSON.stringify({directory:lock.directory})+'\\n');
if(process.argv[4]==='blocked') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2000);
process.stdin.on('data', data=>{try {
if(String(data).trim()==='again') acquireLock({root:process.argv[2],appData:process.argv[3]});
else lock.verify();
process.stdout.write('valid\\n');
} catch(e) {process.stdout.write(e.code+'\\n');}});`;
function fixture() {
  const base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "reference-lock-test-")),
  );
  const root = path.join(base, "wallet"),
    appData = path.join(base, "appdata");
  fs.mkdirSync(root, { mode: 0o700 });
  fs.mkdirSync(appData, { mode: 0o700 });
  return { root, appData };
}
function line(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Lock child timed out")), 5000);
    child.stdout.once("data", (bytes) => {
      clearTimeout(timer);
      resolve(String(bytes).trim());
    });
    child.once("error", reject);
  });
}
async function holder(f, mode = "hold") {
  const child = spawn(process.execPath, [
    "-e",
    script,
    core,
    f.root,
    f.appData,
    mode,
  ]);
  const ready = JSON.parse(await line(child));
  return { child, ...ready };
}
function contender(f) {
  return spawnSync(
    process.execPath,
    [
      "-e",
      `try {
const lock=require(process.argv[1]).acquireLock({root:process.argv[2],appData:process.argv[3]}); lock.verify();
process.stdout.write('acquired'); } catch(e) {process.stdout.write(e.code);process.exitCode=2;}`,
      core,
      f.root,
      f.appData,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
}
function exit(child, signal) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    if (signal) child.kill(signal);
    else child.stdin.end();
  });
}
test("blocked holder survives contention; normal exit releases the OS lock", async () => {
  const f = fixture(),
    h = await holder(f, "blocked");
  try {
    const c = contender(f);
    expect(c.status).toBe(2);
    expect(c.stdout).toBe("REFERENCE_PROFILE_BUSY");
    expect(h.child.exitCode).toBeNull();
  } finally {
    await exit(h.child);
  }
  expect(contender(f).stdout).toBe("acquired");
});
test("SIGKILL releases lock, with no stale-file takeover", async () => {
  const f = fixture(),
    h = await holder(f);
  await exit(h.child, "SIGKILL");
  expect(contender(f).stdout).toBe("acquired");
});
test("same-process reentry refuses and permissions are private", async () => {
  const f = fixture(),
    h = await holder(f);
  try {
    const response = line(h.child);
    h.child.stdin.write("again\n");
    expect(await response).toBe("REFERENCE_PROFILE_BUSY");
    expect(fs.statSync(h.directory).mode & 0o777).toBe(0o700);
    const file = fs
      .readdirSync(h.directory)
      .find((name) => name.endsWith(".sqlite"));
    expect(fs.statSync(path.join(h.directory, file)).mode & 0o777).toBe(0o600);
  } finally {
    await exit(h.child);
  }
});
test("replacement of the lock inode is detected and permanently poisons custody", async () => {
  const f = fixture(),
    h = await holder(f);
  try {
    const file = path.join(
      h.directory,
      fs.readdirSync(h.directory).find((name) => name.endsWith(".sqlite")),
    );
    fs.renameSync(file, file + ".retained");
    fs.writeFileSync(file, Buffer.alloc(0), { mode: 0o600 });
    const response = line(h.child);
    h.child.stdin.write("verify\n");
    expect(await response).toBe("REFERENCE_LOCK_COMPROMISED");
    fs.renameSync(file, file + ".replacement");
    fs.renameSync(file + ".retained", file);
    const again = line(h.child);
    h.child.stdin.write("verify\n");
    expect(await again).toBe("REFERENCE_LOCK_COMPROMISED");
  } finally {
    await exit(h.child);
  }
});
test("symlinked wallet root is refused before opening the lock", () => {
  const f = fixture(),
    alias = path.join(path.dirname(f.root), "alias");
  fs.symlinkSync(f.root, alias, "dir");
  expect(contender({ ...f, root: alias }).stdout).toBe(
    "REFERENCE_FILE_REFUSED",
  );
});
test("only the lock core names its SQLite file; it remains outside wallet inventories", () => {
  const directory = path.resolve(
    __dirname,
    "../examples/reference-wallet/host",
  );
  const references = fs
    .readdirSync(directory)
    .filter(
      (name) =>
        name.endsWith(".cjs") &&
        fs
          .readFileSync(path.join(directory, name), "utf8")
          .includes("profile-lock.sqlite"),
    );
  expect(references).toEqual(["profile-lock-core.cjs"]);
});
