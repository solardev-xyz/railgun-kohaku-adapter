"use strict";
const { Transaction } = require("ethers");
const { createRpcHost } = require("./rpc.cjs");
const HASH = /^0x[0-9a-f]{64}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
function refuse() {
  throw Object.assign(Error("Own settled receipt refused"), {
    code: "REFERENCE_RECEIPT_REFUSED",
  });
}
// Application accounting only. The authenticated journal admits the hash;
// this reader grants no recovery, signing, settlement or resubmission authority.
function createReceiptReader({
  context,
  sessions,
  submissionJournal,
  submitter,
  transport,
  rpcUrl,
  tor,
  maxGasFee,
}) {
  const registry = require("./registry.cjs").createRegistry({ rpcUrl });
  if (typeof maxGasFee !== "bigint" || maxGasFee <= 0n) refuse();
  function select(snapshot, hash) {
    const rows = [
      ...snapshot.records.map((record) => ({
        record,
        observation: record.observation,
        resolution: record.resolution?.railgun,
      })),
      ...snapshot.archive.map((record) => ({
        record,
        observation: record,
        resolution: record.railgun,
      })),
    ].filter(({ record }) => record.hash === hash);
    if (rows.length !== 1) refuse();
    const { record, observation, resolution } = rows[0];
    if (
      !["railgun-native-shield", "railgun-transact"].includes(
        record.intent?.kind,
      ) ||
      !["included", "reverted"].includes(observation?.status) ||
      resolution?.outcome !==
        (observation.status === "included" ? "matched" : "reverted") ||
      !Number.isSafeInteger(observation.blockNumber) ||
      observation.blockNumber < 0 ||
      !HASH.test(observation.blockHash) ||
      !Number.isSafeInteger(resolution.finalizedBlockNumber) ||
      resolution.finalizedBlockNumber < observation.blockNumber
    )
      refuse();
    return {
      record,
      blockNumber: observation.blockNumber,
      blockHash: observation.blockHash,
      receiptStatus: observation.status === "included" ? "0x1" : "0x0",
    };
  }
  return async function readReceipt(hash, review) {
    if (
      typeof hash !== "string" ||
      !HASH.test(hash) ||
      typeof review !== "function"
    )
      refuse();
    const parent = sessions.openPrivacySession();
    const subject = {
      kind: "public-address",
      principal: submitter.readMetadata().address.toLowerCase(),
      chainId: 11155111,
      role: "transaction-rpc",
    };
    const parentHandle = parent.getContext(subject, { origin: "tor" });
    const owner = context.getPrivacyContext(parentHandle);
    const deadline = new AbortController();
    let timer;
    const signal = AbortSignal.any([owner.signal, deadline.signal]);
    const current = () => {
      context.getPrivacyContext(parentHandle);
      if (signal.aborted) refuse();
    };
    const scope = context.createPrivacyScope({
      profileId: owner.profileId,
      signal,
      isCurrent: () => {
        current();
        return true;
      },
    });
    const handle = scope.getContext(subject, { origin: "tor" });
    let network, restriction, failure, result;
    try {
      const read = () =>
        submissionJournal.readExistingPrivateSubmissionSnapshot(handle);
      const selected = select(await read(), hash);
      const original = JSON.stringify(selected.record);
      current();
      const rpc = createRpcHost({
        context,
        registry,
        tor,
        settings: { isWalletTorExperimentAvailable: () => true },
        transport: {
          createWalletTorTransport: () =>
            (network ??= transport.createWalletTorTransport()),
        },
      });
      const disclosureClient = rpc.createPrivateRpc(handle, "transaction-rpc");
      const destination = rpc.getPrivateRpcDestination(
        disclosureClient,
        handle,
      );
      const details = rpc.getPrivateRpcDestinationDetails(destination);
      if (
        (await review(
          Object.freeze({
            purpose: "reference-own-receipt-v1",
            transactionHash: hash,
            endpoint: details.url,
            chainId: 11155111,
            requests: Object.freeze([
              "eth_chainId",
              "eth_getTransactionReceipt",
              "eth_getTransactionByHash",
            ]),
            disclosureExplanation:
              "Read the receipt for this profile’s already settled transaction. The endpoint learns its hash; gas accounting remains unverified RPC data.",
          }),
          { signal },
        )) !== true
      )
        refuse();
      current();
      if (JSON.stringify(select(await read(), hash).record) !== original)
        refuse();
      timer = setTimeout(() => deadline.abort(), 30000);
      restriction = rpc.createPrivateRpcDestinationConstraint({
        observation: destination,
        signal,
        deadline: performance.now() + 30000,
      });
      const client = rpc.createPrivateRpc(handle, "transaction-rpc", {
        signal,
        destinationConstraint: restriction.constraint,
      });
      async function request(method, params) {
        current();
        return (await client.request(method, params, () => true)).result;
      }
      const receipt = await request("eth_getTransactionReceipt", [hash]);
      if (
        !receipt ||
        Array.isArray(receipt) ||
        receipt.transactionHash !== hash ||
        receipt.status !== selected.receiptStatus ||
        receipt.blockHash !== selected.blockHash ||
        !["blockNumber", "gasUsed", "effectiveGasPrice"].every(
          (key) =>
            typeof receipt[key] === "string" && QUANTITY.test(receipt[key]),
        ) ||
        BigInt(receipt.blockNumber) !== BigInt(selected.blockNumber)
      )
        refuse();
      const transaction = await request("eth_getTransactionByHash", [hash]);
      if (
        !transaction ||
        transaction.hash !== hash ||
        typeof transaction.from !== "string" ||
        transaction.from.toLowerCase() !== subject.principal ||
        (transaction.chainId !== undefined &&
          transaction.chainId !== "0xaa36a7") ||
        transaction.type !== "0x0" ||
        transaction.blockHash !== selected.blockHash ||
        !["nonce", "gas", "gasPrice", "blockNumber"].every(
          (key) =>
            typeof transaction[key] === "string" &&
            QUANTITY.test(transaction[key]),
        ) ||
        BigInt(transaction.nonce) !== BigInt(selected.record.nonce) ||
        BigInt(transaction.blockNumber) !== BigInt(selected.blockNumber)
      )
        refuse();
      const gasUsed = BigInt(receipt.gasUsed),
        effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
      const gasLimit = BigInt(transaction.gas),
        gasPrice = BigInt(transaction.gasPrice);
      let signed;
      try {
        if (
          typeof transaction.r !== "string" ||
          !(HASH.test(transaction.r) || QUANTITY.test(transaction.r)) ||
          typeof transaction.s !== "string" ||
          !(HASH.test(transaction.s) || QUANTITY.test(transaction.s)) ||
          typeof transaction.v !== "string" ||
          !QUANTITY.test(transaction.v) ||
          ![22310257n, 22310258n].includes(BigInt(transaction.v)) ||
          typeof transaction.value !== "string" ||
          !QUANTITY.test(transaction.value) ||
          typeof transaction.input !== "string" ||
          !/^0x(?:[0-9a-f]{2}){0,65536}$/.test(transaction.input) ||
          typeof transaction.to !== "string" ||
          !/^0x[0-9a-fA-F]{40}$/.test(transaction.to)
        )
          refuse();
        signed = Transaction.from({
          type: 0,
          chainId: 11155111n,
          nonce: selected.record.nonce,
          gasLimit,
          gasPrice,
          to: transaction.to,
          value: BigInt(transaction.value),
          data: transaction.input,
          signature: {
            r: transaction.r,
            s: transaction.s,
            v: BigInt(transaction.v),
          },
        });
        if (
          signed.hash !== hash ||
          signed.from.toLowerCase() !== subject.principal
        )
          refuse();
      } catch {
        refuse();
      }
      const gasFee = gasUsed * effectiveGasPrice;
      if (gasUsed <= 0n || gasUsed > gasLimit || effectiveGasPrice !== gasPrice)
        refuse();
      if (JSON.stringify(select(await read(), hash).record) !== original)
        refuse();
      current();
      result = Object.freeze({
        status: "receipt",
        transactionHash: hash,
        blockNumber: selected.blockNumber,
        blockHash: selected.blockHash,
        gasUsed,
        effectiveGasPrice,
        gasFee,
        receiptStatus: receipt.status,
        transactionHashVerified: true,
        transactionGasLimit: gasLimit,
        transactionGasPrice: gasPrice,
        currentMaxGasFee: maxGasFee,
        withinCurrentGasPolicy: gasFee <= maxGasFee,
        trust: "unverified-rpc",
        spendingEnabled: false,
      });
    } catch (error) {
      failure = error;
    } finally {
      restriction?.close();
      scope.close();
      try {
        if (network) {
          network.close();
          await network.closed;
        }
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      if (failure) throw failure;
      current();
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
}
module.exports = { createReceiptReader };
