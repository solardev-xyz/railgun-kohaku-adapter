"use strict";
// Application navigation only. No result here is a signing permit. Every action
// uses the existing command and its owner/review/custody checks in a fresh process.
const { createHash } = require("node:crypto");
const HASH = /^0x[0-9a-f]{64}$/;
const WETH = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
const KEY = "guided-journey";
const MAX_CALLS = 512;
const STEPS = Object.freeze({
  funding: ["funding-address", "Read your public funding address."],
  account: ["account-create", "Create this profile's Railgun account."],
  "account-recover": [
    "account-info",
    "Inspect the account after interrupted creation.",
  ],
  "initial-scan": [
    "scan",
    "Synchronize the public chain; interrupted progress is retained.",
  ],
  wallet: ["wallet-rebuild", "Build the private wallet from the public scan."],
  "wallet-check": [
    "address",
    "Check whether the interrupted wallet build completed.",
  ],
  "wallet-resume": [
    "wallet-resume",
    "Resume the existing private wallet build.",
  ],
  address: [
    "address",
    "Read your Railgun address. Bob shares this address with Alice.",
  ],
  shield: ["shield", "Review one Shield. Fund this profile before continuing."],
  "shield-find": [
    "shield-history",
    "Find the original Shield in its authenticated journal.",
  ],
  "shield-observe": [
    "shield-observe",
    "Observe the original Shield; wait for inclusion and finality.",
  ],
  "shield-resolve": [
    "shield-resolve",
    "Resolve the included Shield after finality.",
  ],
  "shield-receipt": ["receipt", "Check the Shield receipt and actual gas."],
  "input-scan": [
    "scan",
    "Synchronize the chain before discovering the input note.",
  ],
  "input-wallet": [
    "wallet-sync",
    "Discover notes using this profile's own credentials.",
  ],
  "input-notes": [
    "notes",
    "Select the exact unspent note created by the expected transaction.",
  ],
  "input-status": [
    "poi-status",
    "Wait for this profile’s independently observed Valid input POI.",
  ],
  "input-txid": [
    "txid-sync",
    "Synchronize authenticated TXID state before spending.",
  ],
  payment: [
    null,
    "Review the selected full-note payment. Uncertainty never repeats it.",
  ],
  "payment-recheck": [
    "notes",
    "Recheck the exact original input before a bounded preparation re-offer. No absence of a hold is assumed.",
  ],
  "hold-find": [
    "hold-find",
    "Find the retained operation by its authenticated input note.",
  ],
  "proof-resume": [
    "resume-proof",
    "Resume the original retained proof without preparing or sending another payment.",
  ],
  "payment-observe": ["observe", "Observe the original retained operation."],
  "payment-submit": [
    "submit-stored",
    "Explicitly review the first submission of the original retained operation.",
  ],
  "payment-resolve": [
    "resolve",
    "Resolve the original payment after finality.",
  ],
  "payment-receipt": [
    "receipt",
    "Check this payment's settled receipt and actual gas.",
  ],
  "output-scan": ["scan", "Refresh the chain after the payment."],
  "output-wallet": [
    "wallet-sync",
    "Refresh the private wallet after the payment.",
  ],
  "output-notes": [
    "notes",
    "Check that the spent input is no longer available.",
  ],
  "output-txid": ["txid-sync", "Synchronize TXIDs for Alice's output POI."],
  "poi-prepare": [
    "poi-prepare-shield",
    "Prepare POI for Alice's Shield-created input and Bob's output.",
  ],
  "poi-submit": [
    "poi-submit",
    "Review the single POI handoff; its response is not acceptance.",
  ],
  "poi-recover": [
    "poi-recover",
    "Inspect the existing attempted POI; never submit it again.",
  ],
  complete: [
    null,
    "This profile's journey is complete. Alice's handoff still requires Bob's owned Valid status.",
  ],
  diagnosis: [
    null,
    "Stopped safely. Inspect the recorded original operation; no automatic replacement is offered.",
  ],
});
function refuse(code = "REFERENCE_JOURNEY_REFUSED") {
  throw Object.assign(Error("Guided journey refused"), { code });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
function journeyIdentity(config, hostDigest) {
  if (!config || !/^[a-f0-9]{64}$/.test(hostDigest)) refuse();
  return createHash("sha256")
    .update(JSON.stringify(canonical({ config, hostDigest })))
    .digest("hex");
}
function keys(value, required, optional = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    refuse();
}
function validate(value) {
  keys(value, [
    "version",
    "role",
    "identity",
    "step",
    "calls",
    "inflight",
    "data",
    "history",
  ]);
  if (
    value.version !== 1 ||
    !["alice", "bob"].includes(value.role) ||
    !Object.hasOwn(STEPS, value.step) ||
    !/^[a-f0-9]{64}$/.test(value.identity) ||
    !Number.isSafeInteger(value.calls) ||
    value.calls < 0 ||
    value.calls > MAX_CALLS ||
    !Array.isArray(value.history) ||
    value.history.length > MAX_CALLS
  )
    refuse();
  if (value.inflight !== null) {
    keys(value.inflight, [
      "step",
      "call",
      "preparationApproved",
      "sendApproved",
    ]);
    if (
      value.inflight.step !== value.step ||
      value.inflight.call !== value.calls ||
      ![null, true, false].includes(value.inflight.preparationApproved) ||
      ![null, true, false].includes(value.inflight.sendApproved)
    )
      refuse();
  }
  const d = value.data;
  keys(
    d,
    [],
    [
      "funding",
      "address",
      "amount",
      "shieldHash",
      "shieldGas",
      "note",
      "recipient",
      "paymentHash",
      "hold",
      "storedAttempts",
      "preSendRefusals",
      "output",
      "paymentGas",
      "capsule",
      "expectedTransfer",
      "accountAttempts",
      "walletAttempts",
      "poiAttempts",
      "shieldAttempt",
      "shieldNonce",
      "shieldNoteValue",
      "shieldAttempts",
      "paymentAttempts",
      "recipientApproved",
    ],
  );
  for (const key of ["shieldHash", "paymentHash", "expectedTransfer"])
    if (Object.hasOwn(d, key) && !HASH.test(d[key])) refuse();
  for (const key of ["hold", "capsule", "shieldAttempt"])
    if (Object.hasOwn(d, key) && !/^[a-f0-9]{64}$/.test(d[key])) refuse();
  for (const key of [
    "accountAttempts",
    "walletAttempts",
    "storedAttempts",
    "preSendRefusals",
    "poiAttempts",
    "shieldAttempts",
    "paymentAttempts",
  ])
    if (
      Object.hasOwn(d, key) &&
      (!Number.isSafeInteger(d[key]) || d[key] < 0 || d[key] > 3)
    )
      refuse();
  if (
    Object.hasOwn(d, "shieldNonce") &&
    (!Number.isSafeInteger(d.shieldNonce) || d.shieldNonce < 0)
  )
    refuse();
  if (
    Object.hasOwn(d, "recipientApproved") &&
    typeof d.recipientApproved !== "boolean"
  )
    refuse();
  if (Object.hasOwn(d, "funding") && !/^0x[0-9a-fA-F]{40}$/.test(d.funding))
    refuse();
  for (const key of ["address", "recipient"])
    if (
      Object.hasOwn(d, key) &&
      (typeof d[key] !== "string" || !/^[a-zA-Z0-9]{1,256}$/.test(d[key]))
    )
      refuse();
  for (const key of ["amount", "shieldGas", "paymentGas", "shieldNoteValue"])
    if (Object.hasOwn(d, key) && !/^[0-9]{1,40}$/.test(d[key])) refuse();
  if (d.note) {
    keys(d.note, ["id", "amount", "txid", "asset"]);
    keys(d.note.asset, ["__type", "contract"]);
    if (
      !/^[0-9]+:[0-9]+$/.test(d.note.id) ||
      !/^[1-9][0-9]{0,36}$/.test(d.note.amount) ||
      !HASH.test(d.note.txid) ||
      d.note.asset.__type !== "erc20" ||
      d.note.asset.contract.toLowerCase() !== WETH
    )
      refuse();
  }
  if (d.output) {
    if (d.output.kind === "shielded") keys(d.output, ["kind", "noteId"]);
    else if (d.output.kind === "unshield")
      keys(d.output, [
        "kind",
        "recipient",
        "amount",
        "received",
        "fee",
        "feeDeviation",
      ]);
    else refuse();
  }
  const calls = new Set();
  for (const row of value.history) {
    keys(row, ["step", "call", "status", "error"]);
    if (
      !Object.hasOwn(STEPS, row.step) ||
      !Number.isSafeInteger(row.call) ||
      row.call < 1 ||
      row.call > value.calls ||
      calls.has(row.call) ||
      typeof row.status !== "string" ||
      !/^[a-z-]{1,48}$/.test(row.status) ||
      (row.error !== null &&
        !/^(REFERENCE|RAILGUN|PRIVATE|PRIVACY|TOR)_[A-Z0-9_]{1,96}$/.test(
          row.error,
        ))
    )
      refuse();
    calls.add(row.call);
  }
  return value;
}
function view(saved) {
  const s = validate(saved);
  return Object.freeze({
    status: "journey",
    role: s.role,
    step: s.step,
    instruction:
      s.step === "complete" && s.role === "bob"
        ? "Bob’s original received note was unshielded, settled and accounted for."
        : STEPS[s.step][1],
    interrupted: s.inflight !== null,
    calls: s.calls,
    lastError: s.history.at(-1)?.error ?? null,
    next: ["complete", "diagnosis"].includes(s.step) ? null : "journey-next",
    // Deliberate local exchange values; never publish journey output as telemetry.
    fundingAddress: s.data.funding ?? null,
    railgunAddress: s.data.address ?? null,
    transferTransaction:
      s.role === "alice" ? (s.data.paymentHash ?? null) : null,
    stateAuthority: "application-bookkeeping-only",
  });
}
async function startJourney({ state, role, identity }) {
  if (!["alice", "bob"].includes(role) || !/^[a-f0-9]{64}$/.test(identity))
    refuse();
  const saved = {
    version: 1,
    role,
    identity,
    step: "funding",
    calls: 0,
    inflight: null,
    data: {},
    history: [],
  };
  await state.update(KEY, (old) => {
    if (old !== null) refuse();
    return saved;
  });
  return view(saved);
}
async function journeyStatus(state) {
  const saved = await state.get(KEY);
  return saved === null
    ? { status: "journey-not-started", next: "journey-start" }
    : view(saved);
}
// Recovery choices are closed. An incomplete inventory or missing hash cannot
// become permission to prepare another payment. Local preparation is repeatable;
// a possibly performed network handoff is never replayed.
function interrupted(s) {
  const step = s.step;
  if (
    (step === "shield" && s.inflight.sendApproved !== true) ||
    (step === "payment" && s.inflight.preparationApproved !== true)
  ) {
    // The original preparation callback never returned approval. By command
    // ordering neither signing nor submission can have been admitted. Inputs
    // that have never been approved can be corrected at the next prompt.
    if (step === "shield" && s.inflight.preparationApproved !== true)
      delete s.data.amount;
    else if (step === "payment" && !s.data.recipientApproved)
      delete s.data.recipient;
  } else if (step === "account") s.step = "account-recover";
  else if (step === "wallet" || step === "wallet-resume")
    s.step = "wallet-check";
  else if (step === "shield") s.step = "shield-find";
  else if (step === "payment" || step === "proof-resume") s.step = "hold-find";
  else if (step === "payment-submit" || step === "payment-resolve")
    s.step = "payment-observe";
  else if (step === "shield-resolve") s.step = "shield-find";
  else if (step === "poi-submit") s.step = "poi-recover";
  s.inflight = null;
}
function commandFor(s) {
  const d = s.data,
    command =
      STEPS[s.step][0] ??
      (s.step === "payment"
        ? s.role === "alice"
          ? "pay-note"
          : "unshield-note"
        : null);
  if (!command) return null;
  const options = { command };
  if (["shield-observe", "shield-resolve"].includes(command))
    options.transactionHash = d.shieldHash;
  if (command === "receipt")
    options.transactionHash =
      s.step === "shield-receipt" ? d.shieldHash : d.paymentHash;
  if (command === "shield") options.amount = d.amount;
  if (["pay-note", "unshield-note"].includes(command)) {
    options.noteId = d.note.id;
    options.recipient = s.role === "alice" ? d.recipient : d.funding;
  }
  if (["poi-status", "hold-find"].includes(command)) options.noteId = d.note.id;
  if (command === "hold-find")
    options.kind =
      s.role === "alice"
        ? "railgun-private-transfer"
        : "railgun-token-unshield";
  if (
    [
      "observe",
      "resolve",
      "submit-stored",
      "resume-proof",
      "poi-prepare-shield",
    ].includes(command)
  )
    options.holdId = d.hold;
  if (["poi-submit", "poi-recover"].includes(command))
    options.capsuleDigest = d.capsule;
  if (command === "submit-stored")
    options.expectedPayment = {
      noteId: d.note.id,
      recipient: s.role === "alice" ? d.recipient : d.funding,
      kind:
        s.role === "alice"
          ? "railgun-private-transfer"
          : "railgun-token-unshield",
    };
  if (command === "account-info") options.cache = "pending";
  return options;
}
function hash(value) {
  if (typeof value !== "string" || !HASH.test(value)) refuse();
  return value;
}
function receipt(result, expected) {
  if (
    result.status !== "receipt" ||
    result.transactionHash !== expected ||
    result.receiptStatus !== "0x1" ||
    result.transactionHashVerified !== true ||
    result.withinCurrentGasPolicy !== true ||
    !/^[0-9]+$/.test(String(result.gasFee)) ||
    BigInt(result.gasFee) > 2000000000000000n
  )
    refuse();
  return String(result.gasFee);
}
function shieldHash(outcome, data) {
  if (
    !outcome ||
    outcome.from?.toLowerCase() !== data.funding.toLowerCase() ||
    outcome.chainId !== 11155111 ||
    outcome.broadcastSource !== "direct" ||
    String(outcome.value) !== data.amount
  )
    refuse();
  return hash(outcome.hash);
}
function advance(s, result) {
  const d = s.data,
    step = s.step;
  if (!result || (step !== "input-status" && typeof result.status !== "string"))
    refuse();
  if (result.status === "cancelled") return;
  switch (step) {
    case "funding":
      if (
        result.status !== "funding-address" ||
        !/^0x[0-9a-fA-F]{40}$/.test(result.address)
      )
        refuse();
      d.funding = result.address;
      s.step = "account";
      break;
    case "account":
    case "account-recover":
      if (result.status !== "account-opened") refuse();
      s.step = "initial-scan";
      break;
    case "initial-scan":
    case "input-scan":
    case "output-scan":
      if (result.status === "paused") break;
      if (result.status !== "complete") refuse();
      s.step = {
        "initial-scan": "wallet",
        "input-scan": "input-wallet",
        "output-scan": "output-wallet",
      }[step];
      break;
    case "wallet":
    case "wallet-resume":
      if (result.status !== "wallet-ready") refuse();
      s.step = "address";
      break;
    case "wallet-check":
    case "address":
      if (
        result.status !== "address" ||
        typeof result.address !== "string" ||
        !result.address
      )
        refuse();
      d.address = result.address;
      s.step = s.role === "alice" ? "shield" : "input-scan";
      break;
    case "shield":
      if (result.status !== "submission-outcome") refuse();
      d.shieldHash = shieldHash(result.outcome, d);
      s.step = "shield-observe";
      break;
    case "shield-find": {
      if (result.status !== "shield-history" || !Array.isArray(result.records))
        refuse();
      // A lost first result has no trustworthy hash binding. Do not guess by
      // amount, last row or "the only transaction". Keep inspection available.
      const rows = result.records.filter((r) =>
        d.shieldHash
          ? r.transactionHash === d.shieldHash
          : Number.isSafeInteger(d.shieldNonce) && r.nonce === d.shieldNonce,
      );
      if (
        rows.length === 0 &&
        Number.isSafeInteger(d.shieldNonce) &&
        !d.shieldHash
      ) {
        s.step = (d.shieldAttempts ?? 0) < 3 ? "shield" : "diagnosis";
        break;
      }
      if (rows.length === 0 && !d.shieldHash) {
        s.step = "diagnosis";
        break;
      }
      if (
        rows.length !== 1 ||
        (Number.isSafeInteger(d.shieldNonce) && rows[0].nonce !== d.shieldNonce)
      )
        refuse();
      d.shieldHash = hash(rows[0].transactionHash);
      s.step = rows[0].resolved ? "shield-receipt" : "shield-observe";
      break;
    }
    case "shield-observe":
      if (
        result.status !== "observed" ||
        result.observation?.status === "nonce-consumed"
      )
        refuse();
      if (
        result.transactionHash !== d.shieldHash ||
        result.shield?.status === "anomaly"
      )
        refuse();
      if (result.resolved) s.step = "shield-receipt";
      else if (
        result.observation?.status === "included" &&
        result.shield?.status === "matched" &&
        result.observation.confirmations >= 12
      )
        s.step = "shield-resolve";
      break;
    case "shield-resolve":
      if (
        result.status !== "resolved" ||
        result.outcome !== "matched" ||
        result.transactionHash !== d.shieldHash
      )
        refuse();
      s.step = "shield-receipt";
      break;
    case "shield-receipt":
      d.shieldGas = receipt(result, d.shieldHash);
      s.step = "input-scan";
      break;
    case "input-wallet":
      if (result.status !== "wallet-ready") refuse();
      s.step = "input-notes";
      break;
    case "input-notes": {
      if (result.status !== "notes" || !Array.isArray(result.notes)) refuse();
      const matches = result.notes.filter(
        (n) =>
          n.spentTxid === false &&
          n.txid?.toLowerCase() ===
            (s.role === "alice" ? d.shieldHash : d.expectedTransfer),
      );
      if (matches.length === 0) {
        s.step = "input-scan";
        break;
      }
      if (
        matches.length !== 1 ||
        matches[0].asset?.__type !== "erc20" ||
        matches[0].asset.contract.toLowerCase() !== WETH ||
        !/^[1-9][0-9]*$/.test(String(matches[0].amount))
      )
        refuse();
      if (
        s.role === "alice" &&
        (!d.shieldNoteValue ||
          BigInt(matches[0].amount) !== BigInt(d.shieldNoteValue))
      )
        refuse();
      d.note = {
        id: matches[0].id,
        amount: String(matches[0].amount),
        txid: matches[0].txid.toLowerCase(),
        asset: matches[0].asset,
      };
      s.step = "input-status";
      break;
    }
    case "input-status":
      if (
        result.noteId !== d.note.id ||
        result.inputType !== (s.role === "alice" ? "Shield" : "Transact") ||
        result.selectedCount !== 1 ||
        result.ownershipAtSnapshot !== true
      )
        refuse();
      if (
        result.allValid === true &&
        result.statuses?.length === 1 &&
        result.statuses[0] === "Valid" &&
        result.rootsAccepted === true &&
        result.membershipVerified === true
      )
        s.step = s.role === "alice" ? "payment" : "input-txid";
      else if (
        result.statuses?.length !== 1 ||
        !["Missing", "ProofSubmitted"].includes(result.statuses[0])
      )
        s.step = "diagnosis";
      break;
    case "input-txid":
      if (result.status !== "complete") refuse();
      s.step = "payment";
      break;
    case "payment":
      if (result.status !== "submission-outcome") refuse();
      if (result.outcome?.hash || result.outcome?.transactionHash)
        d.paymentHash = hash(
          result.outcome.hash ?? result.outcome.transactionHash,
        );
      s.step = "hold-find";
      break;
    case "payment-recheck": {
      if (result.status !== "notes" || !Array.isArray(result.notes)) refuse();
      const matches = result.notes.filter(
        (n) => n.id === d.note.id && n.spentTxid === false,
      );
      if (
        matches.length !== 1 ||
        String(matches[0].amount) !== d.note.amount ||
        matches[0].txid?.toLowerCase() !== d.note.txid ||
        matches[0].asset?.contract?.toLowerCase() !==
          d.note.asset.contract.toLowerCase()
      )
        refuse();
      s.step = (d.paymentAttempts ?? 0) < 3 ? "payment" : "diagnosis";
      break;
    }
    case "hold-find":
      if (result.status === "hold-absent") {
        s.step = (d.paymentAttempts ?? 0) < 3 ? "payment-recheck" : "diagnosis";
        break;
      }
      if (result.status === "hold-ambiguous") {
        s.step = "diagnosis";
        break;
      }
      if (
        result.status !== "hold-found" ||
        result.inputNoteId !== d.note.id ||
        typeof result.holdId !== "string"
      )
        refuse();
      if (d.hold && d.hold !== result.holdId) refuse();
      d.hold = result.holdId;
      if (
        s.role === "alice" &&
        (result.transfer?.recipient !== "other" ||
          BigInt(result.transfer.amount) !== BigInt(d.note.amount))
      )
        refuse();
      if (s.role === "bob" && result.transfer !== null) refuse();
      s.step =
        result.localState === "signed-unfinished"
          ? "proof-resume"
          : result.localState === "proof-present"
            ? "payment-observe"
            : "diagnosis";
      break;
    case "proof-resume":
      if (
        !["proof-stored", "proof-present"].includes(result.status) ||
        result.holdId !== d.hold
      ) {
        s.step = "diagnosis";
        break;
      }
      s.step = "payment-observe";
      break;
    case "payment-observe":
      if (result.holdId !== d.hold) refuse();
      if (result.status === "unjournaled") {
        s.step = (d.storedAttempts ?? 0) >= 3 ? "diagnosis" : "payment-submit";
        break;
      }
      if (
        result.status !== "journaled" ||
        result.transact?.status === "anomaly" ||
        result.observation?.status === "nonce-consumed"
      )
        refuse();
      if (d.paymentHash && d.paymentHash !== result.transactionHash) refuse();
      d.paymentHash = hash(result.transactionHash);
      if (result.resolved && result.transact?.status === "matched") {
        d.output = result.output;
        s.step = "payment-receipt";
      } else if (
        result.observation?.status === "included" &&
        result.transact?.status === "matched" &&
        result.observation.confirmations >= 12
      )
        s.step = "payment-resolve";
      break;
    case "payment-submit":
      s.step = "payment-observe";
      break; // never infer delivery from a response
    case "payment-resolve":
      if (
        result.status !== "resolved" ||
        result.outcome !== "matched" ||
        result.holdId !== d.hold ||
        result.transactionHash !== d.paymentHash
      )
        refuse();
      d.output = result.output;
      s.step = "payment-receipt";
      break;
    case "payment-receipt":
      d.paymentGas = receipt(result, d.paymentHash);
      if (BigInt(d.paymentGas) + BigInt(d.shieldGas ?? "0") > 4000000000000000n)
        refuse();
      if (s.role === "bob") {
        if (
          d.output?.kind !== "unshield" ||
          d.output.recipient.toLowerCase() !== d.funding.toLowerCase() ||
          d.output.feeDeviation !== false ||
          BigInt(d.output.amount) !== BigInt(d.note.amount) ||
          BigInt(d.output.received) + BigInt(d.output.fee) !==
            BigInt(d.note.amount)
        )
          refuse();
      } else if (d.output?.kind !== "shielded") refuse();
      s.step = "output-scan";
      break;
    case "output-wallet":
      if (result.status !== "wallet-ready") refuse();
      s.step = "output-notes";
      break;
    case "output-notes":
      if (
        result.status !== "notes" ||
        !Array.isArray(result.notes) ||
        result.notes.some((n) => n.id === d.note.id && n.spentTxid === false)
      )
        refuse();
      s.step = s.role === "alice" ? "output-txid" : "complete";
      break;
    case "output-txid":
      if (result.status !== "complete") refuse();
      s.step = "poi-prepare";
      break;
    case "poi-prepare":
      if (
        result.status !== "prepared" ||
        !/^[a-f0-9]{64}$/.test(result.capsuleDigest)
      )
        refuse();
      d.capsule = result.capsuleDigest;
      s.step = "poi-submit";
      break;
    case "poi-submit":
      s.step = "poi-recover";
      break;
    case "poi-recover":
      if (result.status === "refused") {
        s.step = (d.poiAttempts ?? 0) < 3 ? "poi-submit" : "diagnosis";
        break;
      }
      if (
        result.status !== "matched" ||
        result.recordState !== "attempted" ||
        result.capsuleDigest !== d.capsule
      ) {
        s.step = "diagnosis";
        break;
      }
      s.step = "complete";
      break;
    default:
      refuse();
  }
}
async function nextJourney({
  state,
  identity,
  execute,
  ask,
  confirm,
  signal,
  maxOperationAmount = 10000000000000000n,
}) {
  let s = validate(await state.get(KEY));
  if (s.identity !== identity) refuse("REFERENCE_JOURNEY_IDENTITY_CHANGED");
  if (signal.aborted) refuse("REFERENCE_CANCELLED");
  s = structuredClone(s);
  if (s.inflight) interrupted(s);
  const attemptKey = {
    shield: "shieldAttempts",
    payment: "paymentAttempts",
    "payment-submit": "storedAttempts",
    "poi-submit": "poiAttempts",
  }[s.step];
  if (s.calls >= MAX_CALLS || (attemptKey && (s.data[attemptKey] ?? 0) >= 3) ||
      (s.step === "payment-submit" && (s.data.preSendRefusals ?? 0) >= 3)) {
    s.step = "diagnosis";
    s.inflight = null;
    await state.update(KEY, () => s);
    return view(s);
  }
  if (s.step === "shield-find" && !s.data.shieldHash && s.data.shieldAttempt) {
    try {
      const rows = await state.get("operations");
      if (rows !== null && !Array.isArray(rows)) refuse();
      const matches = (rows ?? []).filter(
        (row) => row.guideAttempt === s.data.shieldAttempt,
      );
      if (matches.length > 1) refuse();
      const row = matches[0];
      if (row?.status === "reported") {
        if (row.command !== "shield" || row.amount !== s.data.amount) refuse();
        s.data.shieldHash = shieldHash(row.outcome, s.data);
      }
    } catch (error) {
      if (error?.code !== "REFERENCE_JOURNEY_REFUSED") throw error;
      s.step = "diagnosis";
      await state.update(KEY, () => s);
      return view(s);
    }
  }
  if (!commandFor(s)) return view(s);
  if (s.step === "shield" && !s.data.amount) {
    const value = await ask("Native Sepolia ETH to shield, in wei: ");
    if (
      !/^[1-9][0-9]{0,36}$/.test(value) ||
      BigInt(value) > (1n << 120n) - 1n ||
      BigInt(value) > BigInt(maxOperationAmount)
    )
      refuse();
    s.data.amount = value;
  }
  if (s.role === "bob" && s.step === "input-scan" && !s.data.note) {
    const value = await ask(
      s.data.expectedTransfer
        ? `No owned note found yet for ${s.data.expectedTransfer}. Press Enter to keep waiting, or enter Alice's corrected transaction hash: `
        : "Alice's finalized private-payment transaction hash: ",
    );
    if (value !== "" || !s.data.expectedTransfer)
      s.data.expectedTransfer = hash(value);
  }
  if (s.role === "alice" && s.step === "payment" && !s.data.recipient) {
    const value = await ask("Bob's Railgun address: ");
    if (
      typeof value !== "string" ||
      !/^[a-zA-Z0-9]{1,256}$/.test(value) ||
      value === s.data.address
    )
      refuse();
    s.data.recipient = value;
  }
  if (!(await confirm(STEPS[s.step][1]))) return view(s);
  if (signal.aborted) refuse();
  const options = commandFor(s),
    step = s.step;
  let dispatched = false;
  const onDispatch = async () => {
    if (dispatched || signal.aborted) refuse();
    s.calls++;
    s.inflight = {
      step,
      call: s.calls,
      preparationApproved: null,
      sendApproved: null,
    };
    if (step === "shield") {
      s.data.shieldAttempt = createHash("sha256")
        .update(JSON.stringify([s.identity, s.calls, "shield"]))
        .digest("hex");
      options.guideAttempt = s.data.shieldAttempt;
    }
    if (step === "account")
      s.data.accountAttempts = (s.data.accountAttempts ?? 0) + 1;
    if (step === "wallet")
      s.data.walletAttempts = (s.data.walletAttempts ?? 0) + 1;
    if (step === "poi-submit")
      s.data.poiAttempts = (s.data.poiAttempts ?? 0) + 1;
    await state.update(KEY, (old) => {
      const previous = validate(old);
      if (previous.calls !== s.calls - 1) refuse();
      return s;
    });
    dispatched = true;
  };
  let result;
  try {
    result = await execute(options, {
      onDispatch,
      onPreparationDecision: async (approved) => {
        if (
          !dispatched ||
          !["shield", "payment"].includes(step) ||
          typeof approved !== "boolean" ||
          s.inflight.preparationApproved !== null
        )
          refuse();
        s.inflight.preparationApproved = approved;
        if (step === "payment" && approved) {
          s.data.recipientApproved = true;
          s.data.paymentAttempts = (s.data.paymentAttempts ?? 0) + 1;
        }
        await state.update(KEY, (old) => {
          if (validate(old).inflight?.call !== s.calls) refuse();
          return s;
        });
      },
      onTransactionDecision: async (approved, summary) => {
        if (
          !dispatched ||
          !["shield", "payment", "payment-submit"].includes(step) ||
          typeof approved !== "boolean" ||
          s.inflight.sendApproved !== null
        )
          refuse();
        if (
          summary.from?.toLowerCase() !== s.data.funding.toLowerCase() ||
          summary.transaction?.chainId !== 11155111 ||
          !Number.isSafeInteger(summary.transaction.nonce) ||
          summary.transaction.nonce < 0
        )
          refuse();
        if (step === "shield") {
          if (
            summary.operation !== "railgun-native-shield" ||
            BigInt(summary.transaction.value) !== BigInt(s.data.amount) ||
            typeof summary.noteValue !== "bigint" ||
            summary.noteValue <= 0n ||
            summary.noteValue > BigInt(s.data.amount)
          )
            refuse();
          s.data.shieldNonce = summary.transaction.nonce;
          s.data.shieldNoteValue = summary.noteValue.toString();
        }
        if (approved && step === "shield")
          s.data.shieldAttempts = (s.data.shieldAttempts ?? 0) + 1;
        if (approved && step === "payment-submit")
          s.data.storedAttempts = (s.data.storedAttempts ?? 0) + 1;
        s.inflight.sendApproved = approved;
        await state.update(KEY, (old) => {
          if (validate(old).inflight?.call !== s.calls) refuse();
          return s;
        });
      },
    });
    if (!dispatched) refuse();
    if (signal.aborted) refuse();
    // JSON projection also ensures BigInts can be retained by the encrypted store.
    result = JSON.parse(
      JSON.stringify(result, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
    if (step === "payment-submit" && s.inflight.sendApproved === null &&
        result.status === "submission-outcome" && result.outcome?.status === "recovery-required" &&
        result.outcome.stage !== "disclosure-review")
      s.data.preSendRefusals = (s.data.preSendRefusals ?? 0) + 1;
    advance(s, result);
    s.inflight = null;
    s.history.push({
      step,
      call: s.calls,
      status: result.status ?? "owned-status",
      error: null,
    });
    await state.update(KEY, () => s);
    return { ...view(s), result };
  } catch (error) {
    // Preserve the original intent if persistence/lifetime is unavailable. The
    // next invocation takes exactly the same conservative interrupted path.
    try {
      if (!dispatched) throw error;
      s = validate(await state.get(KEY));
      s = structuredClone(s);
      if (s.inflight?.call !== s.calls) throw error;
      const code =
        typeof error?.code === "string" &&
        /^(REFERENCE|RAILGUN|PRIVATE|PRIVACY|TOR)_[A-Z0-9_]{1,96}$/.test(
          error.code,
        )
          ? error.code
          : "REFERENCE_JOURNEY_STEP_REFUSED";
      if (step === "payment-submit" && s.inflight.sendApproved === null &&
          !signal.aborted && code !== "REFERENCE_CANCELLED")
        s.data.preSendRefusals = (s.data.preSendRefusals ?? 0) + 1;
      if (
        [
          "REFERENCE_JOURNEY_REFUSED",
          "REFERENCE_JOURNEY_HOLD_UNAVAILABLE",
        ].includes(code)
      ) {
        s.step = "diagnosis";
        s.inflight = null;
      } else if (
        step === "hold-find" &&
        code === "RAILGUN_PRIVATE_RECOVERY_HISTORY_REFUSED"
      ) {
        s.step =
          (s.data.paymentAttempts ?? 0) < 3 ? "payment-recheck" : "diagnosis";
        s.inflight = null;
      } else if (step === "account-recover") {
        s.step = (s.data.accountAttempts ?? 0) < 2 ? "account" : "diagnosis";
        s.inflight = null;
      } else if (step === "wallet-resume") {
        s.step = (s.data.walletAttempts ?? 0) < 2 ? "wallet" : "diagnosis";
        s.inflight = null;
      } else if (step === "wallet-check") {
        s.step = "wallet-resume";
        s.inflight = null;
      } else interrupted(s);
      s.history.push({ step, call: s.calls, status: "refused", error: code });
      await state.update(KEY, () => s);
    } catch {
      /* Original error wins. */
    }
    throw error;
  }
}
module.exports = { journeyIdentity, startJourney, journeyStatus, nextJourney };
