import { ApiPromise, WsProvider } from "@polkadot/api";
import { computeReportCommitment } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { compactError } from "./codec.mjs";
import { DEFAULTS } from "./constants.mjs";
import { EvmRpcClient, withTimeout } from "./rpc.mjs";

export const ANCHOR_SCHEMA = "firma.anchor.v1";
export const ANCHOR_PREPARATION_SCHEMA = "firma.anchor-preparation.v1";
export const ANCHOR_PROTOCOL = "FIRMA_EVM_CALLDATA_V1";
export const ANCHOR_PREFIX_HEX = "0x4649524d410001"; // "FIRMA" || 0x00 || version 1
export const PORTALDOT_V3_CHAIN_ID = "420420777";

export const ONCHAIN_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  MISMATCH: "MISMATCH",
  UNAVAILABLE: "UNAVAILABLE",
});

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH_32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

export class AnchorInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnchorInputError";
    this.code = "INVALID_ANCHOR_INPUT";
  }
}

function normalizeAddress(value, label = "EVM account") {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    throw new AnchorInputError(`${label} must be a 20-byte 0x address.`);
  }
  return value.toLowerCase();
}

export function normalizeTransactionHash(value) {
  if (typeof value !== "string" || !HASH_32.test(value)) {
    throw new AnchorInputError("Transaction hash must be a 32-byte 0x value.");
  }
  return value.toLowerCase();
}

function quantity(value, label) {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value)) {
    throw new AnchorInputError(`${label} is not a canonical hexadecimal quantity.`);
  }
  return BigInt(value);
}

export function encodeAnchorCalldata(commitment) {
  if (typeof commitment !== "string" || !HASH_32.test(commitment)) {
    throw new AnchorInputError("Commitment must be a 32-byte 0x value.");
  }
  return `${ANCHOR_PREFIX_HEX}${commitment.slice(2).toLowerCase()}`;
}

export function prepareAnchorTransaction(report, account) {
  if (report?.verdict?.overall !== "PASS") {
    throw new AnchorInputError("Only a genuine FIRMA PASS report can be prepared for EVM anchoring.");
  }
  const original = JSON.stringify(report);
  const prepared = computeReportCommitment(report);
  const from = normalizeAddress(account);
  if (JSON.stringify(report) !== original) throw new Error("Report changed while preparing its commitment.");
  return Object.freeze({
    schema: ANCHOR_PREPARATION_SCHEMA,
    protocol: ANCHOR_PROTOCOL,
    chainId: PORTALDOT_V3_CHAIN_ID,
    commitment: prepared.commitment,
    algorithm: prepared.algorithm,
    domain: prepared.domain,
    transaction: Object.freeze({ from, to: from, value: "0x0", data: encodeAnchorCalldata(prepared.commitment) }),
    warnings: Object.freeze([
      "This transaction records only a deterministic report commitment; it does not prove that the report's claims are true.",
      "Only a genuine FIRMA PASS report is eligible for this preparation.",
      "The transaction must be signed by an EVM account. An SS58 balance is not assumed to fund this account.",
    ]),
  });
}

function check(id, title, status, summary, evidence = {}) {
  return { id, title, status, summary, evidence };
}

function unavailable(id, title, summary, evidence = {}) {
  return check(id, title, ONCHAIN_STATUS.UNAVAILABLE, summary, evidence);
}

function mismatch(id, title, summary, evidence = {}) {
  return check(id, title, ONCHAIN_STATUS.MISMATCH, summary, evidence);
}

function verified(id, title, summary, evidence = {}) {
  return check(id, title, ONCHAIN_STATUS.VERIFIED, summary, evidence);
}

function overallFor(checks) {
  if (checks.some(({ status }) => status === ONCHAIN_STATUS.MISMATCH)) return ONCHAIN_STATUS.MISMATCH;
  if (checks.some(({ status }) => status === ONCHAIN_STATUS.UNAVAILABLE)) return ONCHAIN_STATUS.UNAVAILABLE;
  return ONCHAIN_STATUS.VERIFIED;
}

function summaryFor(status) {
  if (status === ONCHAIN_STATUS.VERIFIED) {
    return "The finalized Portaldot V3 transaction contains the deterministic commitment for the preserved FIRMA report.";
  }
  if (status === ONCHAIN_STATUS.MISMATCH) {
    return "Available blockchain evidence conclusively disagrees with the claimed report anchor.";
  }
  return "Required transaction, receipt, block, or finality evidence could not currently be confirmed.";
}

export async function collectAnchorFinality({ substrateEndpoint, blockNumber, timeoutMs = 15_000 }) {
  const provider = new WsProvider(substrateEndpoint, 2_500);
  let api;
  try {
    api = await withTimeout(ApiPromise.create({ provider, throwOnConnect: true, noInitWarn: true }), timeoutMs, "Substrate connection");
    const finalizedHash = await withTimeout(api.rpc.chain.getFinalizedHead(), timeoutMs, "Finalized-head query");
    const finalizedHeader = await withTimeout(api.rpc.chain.getHeader(finalizedHash), timeoutMs, "Finalized-head header query");
    const latestNumber = BigInt(finalizedHeader.number.toString());
    const requestedNumber = BigInt(blockNumber);
    if (requestedNumber > latestNumber) {
      return {
        available: true,
        finalized: false,
        requestedBlockNumber: requestedNumber.toString(),
        latestFinalized: { number: latestNumber.toString(), hash: finalizedHash.toHex() },
      };
    }
    const requestedHash = await withTimeout(api.rpc.chain.getBlockHash(requestedNumber.toString()), timeoutMs, "Finalized block-hash query");
    const requestedHashHex = requestedHash.toHex();
    if (/^0x0{64}$/i.test(requestedHashHex)) {
      return {
        available: false,
        finalized: false,
        requestedBlockNumber: requestedNumber.toString(),
        latestFinalized: { number: latestNumber.toString(), hash: finalizedHash.toHex() },
        reason: "The native endpoint did not return the requested finalized block hash.",
      };
    }
    return {
      available: true,
      finalized: true,
      requestedBlockNumber: requestedNumber.toString(),
      substrateBlockHash: requestedHashHex,
      latestFinalized: { number: latestNumber.toString(), hash: finalizedHash.toHex() },
    };
  } catch (error) {
    return { available: false, finalized: false, requestedBlockNumber: String(blockNumber), error: compactError(error) };
  } finally {
    if (api) await withTimeout(api.disconnect(), 2_000, "Substrate disconnect").catch(() => {});
    else await withTimeout(provider.disconnect(), 2_000, "Substrate provider disconnect").catch(() => {});
  }
}

function includedTransaction(block, transactionHash) {
  return Array.isArray(block?.transactions) && block.transactions.some((entry) => {
    const hash = typeof entry === "string" ? entry : entry?.hash;
    return typeof hash === "string" && hash.toLowerCase() === transactionHash;
  });
}

export async function verifyOnchainAnchor({
  report,
  transactionHash,
  claimedEvidence = null,
  network = DEFAULTS,
  rpcClient = null,
  collectFinalityFn = collectAnchorFinality,
}) {
  const original = JSON.stringify(report);
  const hash = normalizeTransactionHash(transactionHash);
  const computed = computeReportCommitment(report);
  const expectedData = encodeAnchorCalldata(computed.commitment);
  const client = rpcClient ?? new EvmRpcClient(network.evmEndpoint, {
    timeoutMs: Number(network.timeoutMs ?? DEFAULTS.timeoutMs),
    retries: Number(network.retries ?? DEFAULTS.retries),
  });
  const checks = [];
  const evidence = { transactionHash: hash, commitment: computed.commitment };

  if (claimedEvidence !== null) {
    const claimedCommitment = typeof claimedEvidence?.commitment === "string"
      ? claimedEvidence.commitment.toLowerCase()
      : null;
    checks.push(claimedCommitment === computed.commitment
      ? verified("anchor.evidenceCommitment", "Anchoring evidence commitment", "The anchoring evidence commitment matches the imported report.", { claimed: claimedCommitment, computed: computed.commitment })
      : mismatch("anchor.evidenceCommitment", "Anchoring evidence commitment", "The anchoring evidence commitment does not match the imported report.", { claimed: claimedCommitment, computed: computed.commitment }));
  }

  let chainId;
  try {
    const chainIdHex = await client.call("eth_chainId");
    chainId = quantity(chainIdHex, "RPC chain ID").toString();
    evidence.chainId = chainId;
    evidence.chainIdHex = chainIdHex;
    checks.push(chainId === PORTALDOT_V3_CHAIN_ID
      ? verified("anchor.chain", "Portaldot V3 chain", "The RPC reported Portaldot V3 chain ID 420420777.", { chainId, chainIdHex })
      : mismatch("anchor.chain", "Portaldot V3 chain", "The RPC transaction evidence is from a different chain.", { expected: PORTALDOT_V3_CHAIN_ID, actual: chainId }));
  } catch (error) {
    checks.push(unavailable("anchor.chain", "Portaldot V3 chain", "The EVM chain identity could not be retrieved.", { error: compactError(error) }));
  }

  let transaction;
  try {
    transaction = await client.call("eth_getTransactionByHash", [hash]);
    evidence.transaction = transaction;
    checks.push(transaction
      ? verified("anchor.transaction", "Transaction retrieval", "The transaction was returned by the configured EVM endpoint.", { hash })
      : unavailable("anchor.transaction", "Transaction retrieval", "The transaction is not currently available from the configured EVM endpoint.", { hash }));
  } catch (error) {
    checks.push(unavailable("anchor.transaction", "Transaction retrieval", "The transaction could not be retrieved.", { error: compactError(error) }));
  }

  if (transaction) {
    const from = typeof transaction.from === "string" ? transaction.from.toLowerCase() : null;
    const to = typeof transaction.to === "string" ? transaction.to.toLowerCase() : null;
    const destinationMatches = Boolean(from && to && ADDRESS.test(from) && from === to);
    checks.push(destinationMatches
      ? verified("anchor.destination", "Contractless destination", "The zero-value anchor was sent from the signer to the same EVM account.", { from, to })
      : mismatch("anchor.destination", "Contractless destination", "The transaction destination is not the signing EVM account.", { from, to }));
    let valueMatches = false;
    try { valueMatches = quantity(transaction.value, "Transaction value") === 0n; } catch {}
    checks.push(valueMatches
      ? verified("anchor.value", "Zero transaction value", "The anchoring transaction transfers no token value.", { value: transaction.value })
      : mismatch("anchor.value", "Zero transaction value", "The anchoring transaction has a non-zero or invalid value.", { value: transaction.value ?? null }));
    const actualData = transaction.input ?? transaction.data;
    checks.push(typeof actualData === "string" && actualData.toLowerCase() === expectedData
      ? verified("anchor.commitment", "Recorded report commitment", "The transaction calldata exactly matches the deterministic commitment for the imported report.", { expected: expectedData, actual: actualData })
      : mismatch("anchor.commitment", "Recorded report commitment", "The transaction calldata does not match the imported report commitment.", { expected: expectedData, actual: actualData ?? null }));
    if (transaction.chainId === undefined || transaction.chainId === null) {
      checks.push(unavailable("anchor.transactionChain", "Transaction chain identity", "The transaction does not expose a chain ID that can be checked independently."));
    } else {
      let transactionChainId = null;
      try { transactionChainId = quantity(transaction.chainId, "Transaction chain ID").toString(); } catch {}
      checks.push(transactionChainId === PORTALDOT_V3_CHAIN_ID
        ? verified("anchor.transactionChain", "Transaction chain identity", "The signed transaction identifies Portaldot V3.", { chainId: transactionChainId })
        : mismatch("anchor.transactionChain", "Transaction chain identity", "The signed transaction identifies a different or invalid chain.", { expected: PORTALDOT_V3_CHAIN_ID, actual: transaction.chainId }));
    }
  } else {
    for (const [id, title] of [
      ["anchor.destination", "Contractless destination"],
      ["anchor.value", "Zero transaction value"],
      ["anchor.commitment", "Recorded report commitment"],
      ["anchor.transactionChain", "Transaction chain identity"],
    ]) checks.push(unavailable(id, title, "The transaction is unavailable, so this field cannot be checked."));
  }

  let receipt;
  try {
    receipt = await client.call("eth_getTransactionReceipt", [hash]);
    evidence.receipt = receipt;
    if (!receipt) {
      checks.push(unavailable("anchor.receipt", "Successful transaction receipt", "The transaction receipt is not currently available."));
    } else if (typeof receipt.transactionHash === "string" && receipt.transactionHash.toLowerCase() !== hash) {
      checks.push(mismatch("anchor.receipt", "Successful transaction receipt", "The returned receipt belongs to a different transaction.", { expected: hash, actual: receipt.transactionHash }));
    } else if (receipt.status === "0x1") {
      checks.push(verified("anchor.receipt", "Successful transaction receipt", "The transaction receipt reports successful execution.", { status: receipt.status }));
    } else if (receipt.status === "0x0") {
      checks.push(mismatch("anchor.receipt", "Successful transaction receipt", "The anchoring transaction reverted.", { status: receipt.status }));
    } else {
      checks.push(unavailable("anchor.receipt", "Successful transaction receipt", "The receipt does not contain a recognized execution status.", { status: receipt.status ?? null }));
    }
  } catch (error) {
    checks.push(unavailable("anchor.receipt", "Successful transaction receipt", "The transaction receipt could not be retrieved.", { error: compactError(error) }));
  }

  let block;
  if (receipt?.blockNumber) {
    try {
      block = await client.call("eth_getBlockByNumber", [receipt.blockNumber, false]);
      evidence.block = block ? { number: block.number, hash: block.hash, timestamp: block.timestamp } : null;
      if (!block) {
        checks.push(unavailable("anchor.inclusion", "Canonical block inclusion", "The receipt block is not currently available."));
      } else {
        const sameHash = typeof block.hash === "string" && typeof receipt.blockHash === "string"
          && block.hash.toLowerCase() === receipt.blockHash.toLowerCase();
        const included = includedTransaction(block, hash);
        checks.push(sameHash && included
          ? verified("anchor.inclusion", "Canonical block inclusion", "The canonical EVM block contains the transaction and matches the receipt block hash.", { blockNumber: block.number, blockHash: block.hash })
          : mismatch("anchor.inclusion", "Canonical block inclusion", "The canonical EVM block does not agree with the receipt or does not contain the transaction.", { receiptBlockHash: receipt.blockHash ?? null, blockHash: block.hash ?? null, included }));
      }
    } catch (error) {
      checks.push(unavailable("anchor.inclusion", "Canonical block inclusion", "The receipt block could not be retrieved.", { error: compactError(error) }));
    }
  } else {
    checks.push(unavailable("anchor.inclusion", "Canonical block inclusion", "A receipt block number is unavailable."));
  }

  let finality = null;
  if (receipt?.blockNumber) {
    try {
      const decimalBlock = quantity(receipt.blockNumber, "Receipt block number").toString();
      finality = await collectFinalityFn({
        substrateEndpoint: network.substrateEndpoint,
        blockNumber: decimalBlock,
        timeoutMs: Number(network.timeoutMs ?? DEFAULTS.timeoutMs),
      });
      evidence.finality = finality;
      checks.push(finality?.available === true && finality.finalized === true
        ? verified("anchor.finality", "Native-chain finality", "The corresponding block height is at or below the finalized native head and its native block hash was retrieved.", finality)
        : unavailable("anchor.finality", "Native-chain finality", finality?.finalized === false && finality?.available === true
          ? "The transaction block is not finalized yet."
          : "Native-chain finality evidence is unavailable.", finality ?? {}));
    } catch (error) {
      checks.push(unavailable("anchor.finality", "Native-chain finality", "Native-chain finality could not be checked.", { error: compactError(error) }));
    }
  } else {
    checks.push(unavailable("anchor.finality", "Native-chain finality", "A receipt block number is unavailable."));
  }

  if (JSON.stringify(report) !== original) throw new Error("Imported report changed during on-chain verification.");
  const overall = overallFor(checks);
  const counts = Object.fromEntries(Object.values(ONCHAIN_STATUS).map((status) => [status, checks.filter((item) => item.status === status).length]));
  return {
    schema: ANCHOR_SCHEMA,
    protocol: ANCHOR_PROTOCOL,
    checkedAt: new Date().toISOString(),
    overall,
    summary: summaryFor(overall),
    report: {
      schema: report.schema,
      originalVerdict: report.verdict.overall,
      commitment: computed.commitment,
      algorithm: computed.algorithm,
      domain: computed.domain,
    },
    transactionHash: hash,
    counts,
    checks,
    evidence,
    limitations: [
      "This verifies that a transaction committed to the exact imported report; it does not prove that every report claim is true.",
      "Wallet control does not prove report authorship.",
      "RPC responses are observable evidence, not cryptographic state proofs.",
    ],
  };
}
