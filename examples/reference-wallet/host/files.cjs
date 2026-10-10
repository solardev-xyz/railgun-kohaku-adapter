"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

function refuse() {
  throw Object.assign(new Error("Reference profile file refused"), {
    code: "REFERENCE_FILE_REFUSED",
  });
}
function assertRoot(root) {
  if (
    !path.isAbsolute(root) ||
    fs.realpathSync(root) !== root ||
    !fs.lstatSync(root).isDirectory()
  )
    refuse();
}
function assertPath(root, file, missing = false) {
  assertRoot(root);
  const relative = path.relative(root, file);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  )
    refuse();
  let current = root;
  const parts = relative.split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (missing && error.code === "ENOENT") return null;
      throw error;
    }
    if (
      stat.isSymbolicLink() ||
      (index === parts.length - 1
        ? !stat.isFile() || stat.nlink !== 1
        : !stat.isDirectory())
    )
      refuse();
    if (index === parts.length - 1) return stat;
  }
  refuse();
}
function readFile(root, file, maximumBytes) {
  const before = assertPath(root, file);
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    before.size > maximumBytes
  )
    refuse();
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
  );
  try {
    const opened = fs.fstatSync(fd);
    if (
      opened.ino !== before.ino ||
      opened.dev !== before.dev ||
      opened.size > maximumBytes
    )
      refuse();
    const bytes = Buffer.alloc(opened.size + 1);
    let size = 0,
      count;
    do {
      count = fs.readSync(fd, bytes, size, bytes.length - size, null);
      size += count;
    } while (count && size < bytes.length);
    const after = fs.fstatSync(fd),
      current = assertPath(root, file);
    if (
      size !== opened.size ||
      [after, current].some((stat) =>
        ["dev", "ino", "size", "mtimeMs", "ctimeMs"].some(
          (field) => stat[field] !== opened[field],
        ),
      )
    )
      refuse();
    return bytes.subarray(0, size);
  } finally {
    fs.closeSync(fd);
  }
}
/** Single-process profile lock is a caller prerequisite. Retain encrypted temp
 * files on failure for diagnosis; a post-rename failure is possibly committed. */
function writeFile(
  root,
  file,
  bytes,
  { active = () => {}, create = false } = {},
) {
  active();
  assertPath(root, file, true);
  if (create && fs.existsSync(file)) refuse();
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(16).toString("hex")}.tmp`;
  let committed = false;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    active();
    assertPath(root, file, true);
    if (create && fs.existsSync(file)) refuse();
    fs.renameSync(temporary, file);
    committed = true;
    if (process.platform !== "win32") {
      const parent = fs.openSync(directory, "r");
      try {
        fs.fsyncSync(parent);
      } finally {
        fs.closeSync(parent);
      }
    }
  } catch (error) {
    if (committed) error.storageCommitted = true;
    throw error;
  }
}
module.exports = { assertRoot, assertPath, readFile, writeFile };
