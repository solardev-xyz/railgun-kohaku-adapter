"use strict";
/** User-facing custody commands. Returned records contain no seed or phrase.
 * The terminal implementation refuses redirection for every credential action. */
async function custodyCommand({ command, vault, terminal, signal }) {
  if (!["init", "restore", "backup"].includes(command))
    throw Error("Unsupported custody command");
  let password, confirmation, phrase;
  try {
    if (command === "backup") {
      if (
        !(await terminal.confirm(
          "Anyone with the recovery phrase can spend this wallet. Reveal it on this terminal?",
          "REVEAL",
          signal,
        ))
      )
        return Object.freeze({ status: "cancelled" });
      password = await terminal.read("Vault password: ", {
        secret: true,
        signal,
      });
      await vault.exportRecovery(password, terminal.showRecovery);
      return Object.freeze({ status: "recovery-displayed" });
    }
    if (command === "restore") {
      if (
        !(await terminal.confirm(
          "Restore into this empty profile only. Stop using every other copy of the same seed before spending.",
          "RESTORE",
          signal,
        ))
      )
        return Object.freeze({ status: "cancelled" });
      phrase = await terminal.read("24-word recovery phrase (hidden): ", {
        secret: true,
        signal,
        maxBytes: 512,
      });
    }
    password = await terminal.read("New vault password (at least 12 bytes): ", {
      secret: true,
      signal,
    });
    confirmation = await terminal.read("Repeat password: ", {
      secret: true,
      signal,
    });
    if (!password.equals(confirmation))
      throw Object.assign(Error("Passwords differ"), {
        code: "REFERENCE_PASSWORD_MISMATCH",
      });
    if (signal.aborted)
      throw Object.assign(Error("Cancelled"), { code: "REFERENCE_CANCELLED" });
    await vault.initialize(password, phrase);
    if (command === "init") {
      await vault.exportRecovery(password, terminal.showRecovery);
      const saved = await terminal.confirm(
        "Record the phrase offline before funding this wallet. Have you saved it?",
        "SAVED",
        signal,
      );
      return Object.freeze({
        status: saved ? "vault-created" : "vault-created-backup-required",
      });
    }
    return Object.freeze({ status: "vault-restored-rescan-required" });
  } finally {
    password?.fill(0);
    confirmation?.fill(0);
    phrase?.fill(0);
    vault.lock();
  }
}
module.exports = { custodyCommand };
