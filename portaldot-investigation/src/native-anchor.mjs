import { u8aEq, u8aToHex } from "@polkadot/util";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { computeReportCommitment } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { compactError } from "./codec.mjs";
import { DEFAULTS, PORTALDOT_V3_SUPPORT_PROFILE, RUNTIME_CODE_STORAGE_KEY } from "./constants.mjs";
import { withTimeout } from "./rpc.mjs";
import { connectSubstrateApi } from "./verifier.mjs";

export const NATIVE_ANCHOR_SCHEMA = "firma.anchor.native.v1";
export const NATIVE_ANCHOR_CHECK_SCHEMA = "firma.anchor-check.native.v1";
export const NATIVE_ANCHOR_PREPARATION_SCHEMA = "firma.anchor-preparation.native.v1";
export const NATIVE_ANCHOR_PROTOCOL = "FIRMA_NATIVE_REMARK_V1";
export const NATIVE_ANCHOR_PREFIX_HEX = "0x4649524d410002"; // "FIRMA" || 0x00 || native protocol version 2
export const NATIVE_ANCHOR_METHOD = "system.remarkWithEvent";
export const NATIVE_ANCHOR_CALL_INDEX = "0x0007";

export const NATIVE_PROOF_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  MISMATCH: "MISMATCH",
  UNAVAILABLE: "UNAVAILABLE",
});

const HASH_32 = /^0x[0-9a-fA-F]{64}$/;
const INDEX = /^(?:0|[1-9][0-9]*)$/;

export class NativeAnchorInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "NativeAnchorInputError";
    this.code = "INVALID_NATIVE_ANCHOR_INPUT";
  }
}

export function normalizeNativeAddress(value, label = "Native account") {
  if (typeof value !== "string" || value.length < 3 || value.length > 64) {
    throw new NativeAnchorInputError(`${label} must be a valid SS58 address.`);
  }
  try {
    const publicKey = decodeAddress(value);
    if (publicKey.length !== 32) throw new Error("Unexpected account length");
    return encodeAddress(publicKey, 42);
  } catch {
    throw new NativeAnchorInputError(`${label} must be a valid 32-byte SS58 account.`);
  }
}

export function encodeNativeAnchorPayload(commitment) {
  if (typeof commitment !== "string" || !HASH_32.test(commitment)) {
    throw new NativeAnchorInputError("Commitment must be a 32-byte 0x value.");
  }
  return `${NATIVE_ANCHOR_PREFIX_HEX}${commitment.slice(2).toLowerCase()}`;
}

export function prepareNativeAnchor(report, account) {
  if (report?.verdict?.overall !== "PASS") {
    throw new NativeAnchorInputError("Only a genuine FIRMA PASS report can be prepared for native anchoring.");
  }
  const original = JSON.stringify(report);
  const prepared = computeReportCommitment(report);
  const signer = normalizeNativeAddress(account);
  if (JSON.stringify(report) !== original) throw new Error("Report changed while preparing its native commitment.");
  return Object.freeze({
    schema: NATIVE_ANCHOR_PREPARATION_SCHEMA,
    protocol: NATIVE_ANCHOR_PROTOCOL,
    chain: "PortaldotV3 Test",
    genesisHash: PORTALDOT_V3_SUPPORT_PROFILE.genesisHash,
    runtimeProfile: PORTALDOT_V3_SUPPORT_PROFILE.id,
    method: NATIVE_ANCHOR_METHOD,
    signer,
    commitment: prepared.commitment,
    algorithm: prepared.algorithm,
    domain: prepared.domain,
    payload: encodeNativeAnchorPayload(prepared.commitment),
    value: "0",
    warnings: Object.freeze([
      "This transaction records only a deterministic report commitment; it does not prove that the report's claims are true.",
      "Only a genuine FIRMA PASS report is eligible for this preparation.",
      "The selected SubWallet account signs and submits directly in the browser. FIRMA never receives signing material.",
    ]),
  });
}

function check(id, title, status, summary, evidence = {}) {
  return { id, title, status, summary, evidence };
}

function verified(id, title, summary, evidence = {}) {
  return check(id, title, NATIVE_PROOF_STATUS.VERIFIED, summary, evidence);
}

function mismatch(id, title, summary, evidence = {}) {
  return check(id, title, NATIVE_PROOF_STATUS.MISMATCH, summary, evidence);
}

function unavailable(id, title, summary, evidence = {}) {
  return check(id, title, NATIVE_PROOF_STATUS.UNAVAILABLE, summary, evidence);
}

function overallFor(checks) {
  if (checks.some(({ status }) => status === NATIVE_PROOF_STATUS.MISMATCH)) return NATIVE_PROOF_STATUS.MISMATCH;
  if (checks.some(({ status }) => status === NATIVE_PROOF_STATUS.UNAVAILABLE)) return NATIVE_PROOF_STATUS.UNAVAILABLE;
  return NATIVE_PROOF_STATUS.VERIFIED;
}

function normalizeHash(value, label) {
  if (typeof value !== "string" || !HASH_32.test(value)) throw new NativeAnchorInputError(`${label} must be a 32-byte 0x value.`);
  return value.toLowerCase();
}

function normalizeIndex(value) {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !INDEX.test(text) || BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new NativeAnchorInputError("Extrinsic index must be a non-negative safe integer.");
  }
  return Number(text);
}

function eventAtIndex(record, index) {
  return record?.phase?.isApplyExtrinsic === true && Number(record.phase.asApplyExtrinsic.toString()) === index;
}

function sameAccount(left, right) {
  try {
    return u8aEq(decodeAddress(left), decodeAddress(right));
  } catch {
    return false;
  }
}

function runtimeIdentity(runtime, genesisHash, runtimeCodeHash) {
  return {
    genesisHash,
    runtimeCodeHash,
    specName: runtime?.specName?.toString?.() ?? null,
    specVersion: runtime?.specVersion?.toString?.() ?? null,
    transactionVersion: runtime?.transactionVersion?.toString?.() ?? null,
  };
}

function supportedRuntime(identity) {
  const expected = PORTALDOT_V3_SUPPORT_PROFILE;
  return identity.genesisHash === expected.genesisHash
    && identity.runtimeCodeHash === expected.runtimeCodeHash
    && identity.specName === expected.specName
    && identity.specVersion === expected.specVersion
    && identity.transactionVersion === expected.transactionVersion;
}

export async function verifyNativeAnchor({
  report,
  claimedEvidence,
  network = DEFAULTS,
  apiFactory = null,
  connectionFactory = connectSubstrateApi,
}) {
  const original = JSON.stringify(report);
  if (!claimedEvidence || typeof claimedEvidence !== "object" || Array.isArray(claimedEvidence)) {
    throw new NativeAnchorInputError("Native anchoring evidence must be a JSON object.");
  }
  if (claimedEvidence.schema !== NATIVE_ANCHOR_SCHEMA || claimedEvidence.protocol !== NATIVE_ANCHOR_PROTOCOL) {
    throw new NativeAnchorInputError(`Native anchoring evidence must use ${NATIVE_ANCHOR_SCHEMA} and ${NATIVE_ANCHOR_PROTOCOL}.`);
  }
  const blockHash = normalizeHash(claimedEvidence.blockHash, "Native block hash");
  const transactionHash = normalizeHash(claimedEvidence.transactionHash, "Native transaction hash");
  const extrinsicIndex = normalizeIndex(claimedEvidence.extrinsicIndex);
  const blockNumber = String(claimedEvidence.blockNumber);
  if (!INDEX.test(blockNumber)) throw new NativeAnchorInputError("Native block number must be a non-negative decimal integer.");
  const claimedSigner = normalizeNativeAddress(claimedEvidence.signer, "Claimed signer");
  const computed = computeReportCommitment(report);
  const expectedPayload = encodeNativeAnchorPayload(computed.commitment);
  const checks = [];
  const evidence = { blockHash, extrinsicIndex: String(extrinsicIndex), transactionHash };

  checks.push(claimedEvidence.commitment?.toLowerCase?.() === computed.commitment
    ? verified("native.evidenceCommitment", "Anchoring evidence commitment", "The sidecar commitment matches the imported report.", { claimed: claimedEvidence.commitment, computed: computed.commitment })
    : mismatch("native.evidenceCommitment", "Anchoring evidence commitment", "The sidecar commitment does not match the imported report.", { claimed: claimedEvidence.commitment ?? null, computed: computed.commitment }));
  checks.push(claimedEvidence.payload?.toLowerCase?.() === expectedPayload
    ? verified("native.evidencePayload", "Anchoring evidence payload", "The sidecar payload matches the versioned commitment payload.", { payload: expectedPayload })
    : mismatch("native.evidencePayload", "Anchoring evidence payload", "The sidecar payload does not match the imported report.", { claimed: claimedEvidence.payload ?? null, expected: expectedPayload }));

  let provider = null;
  let api;
  try {
    if (apiFactory) api = await apiFactory();
    else ({ api, provider } = await connectionFactory({
      ...network,
      timeoutMs: Number(network.timeoutMs ?? DEFAULTS.timeoutMs),
      retries: Number(network.retries ?? DEFAULTS.retries),
    }));
    const timeoutMs = Number(network.timeoutMs ?? DEFAULTS.timeoutMs);
    const [genesis, runtime, codeHash, signedBlock, canonicalHash, finalizedHash] = await Promise.all([
      withTimeout(api.rpc.chain.getBlockHash(0), timeoutMs, "Genesis-hash query"),
      withTimeout(api.rpc.state.getRuntimeVersion(blockHash), timeoutMs, "Historical runtime query"),
      withTimeout(api.rpc.state.getStorageHash(RUNTIME_CODE_STORAGE_KEY, blockHash), timeoutMs, "Historical runtime-code query"),
      withTimeout(api.rpc.chain.getBlock(blockHash), timeoutMs, "Native block query"),
      withTimeout(api.rpc.chain.getBlockHash(blockNumber), timeoutMs, "Canonical block-hash query"),
      withTimeout(api.rpc.chain.getFinalizedHead(), timeoutMs, "Finalized-head query"),
    ]);
    const identity = runtimeIdentity(runtime, genesis.toHex().toLowerCase(), codeHash.toHex().toLowerCase());
    evidence.runtime = identity;
    checks.push(supportedRuntime(identity)
      ? verified("native.chain", "Portaldot runtime identity", "The historical block belongs to the reviewed Portaldot V3 runtime.", identity)
      : mismatch("native.chain", "Portaldot runtime identity", "The chain or historical runtime does not match the reviewed Portaldot V3 support profile.", { expected: PORTALDOT_V3_SUPPORT_PROFILE, actual: identity }));

    const block = signedBlock?.block;
    if (!block?.header || !block.extrinsics || typeof block.extrinsics.length !== "number") {
      throw new Error("The claimed native block is unavailable from the configured endpoint.");
    }
    const actualNumber = block?.header?.number?.toString?.() ?? null;
    const canonical = canonicalHash?.toHex?.()?.toLowerCase?.() ?? null;
    const claimedNumber = blockNumber;
    const canonicalMatches = canonical === blockHash && actualNumber === claimedNumber;
    checks.push(canonicalMatches
      ? verified("native.inclusion", "Canonical block inclusion", "The claimed block is canonical at the claimed native height.", { blockNumber: actualNumber, blockHash })
      : mismatch("native.inclusion", "Canonical block inclusion", "The claimed block hash or number is not canonical.", { claimedNumber, actualNumber, claimedHash: blockHash, canonicalHash: canonical }));

    const extrinsic = block?.extrinsics?.[extrinsicIndex];
    if (!extrinsic) {
      checks.push(mismatch("native.transaction", "Native transaction", "The claimed extrinsic index does not exist in the canonical block.", { extrinsicIndex }));
      for (const [id, title] of [["native.signer", "Native signer"], ["native.method", "Native call"], ["native.commitment", "Recorded report commitment"], ["native.execution", "Transaction execution"]]) {
        checks.push(unavailable(id, title, "The claimed extrinsic is absent, so this field cannot be checked."));
      }
    } else {
      const actualTransactionHash = extrinsic.hash.toHex().toLowerCase();
      evidence.actualTransactionHash = actualTransactionHash;
      checks.push(actualTransactionHash === transactionHash
        ? verified("native.transaction", "Native transaction", "The canonical extrinsic hash matches the sidecar.", { transactionHash })
        : mismatch("native.transaction", "Native transaction", "The canonical extrinsic hash does not match the sidecar.", { claimed: transactionHash, actual: actualTransactionHash }));

      const actualSigner = extrinsic.isSigned ? extrinsic.signer.toString() : null;
      checks.push(actualSigner && sameAccount(actualSigner, claimedSigner)
        ? verified("native.signer", "Native signer", "The signed extrinsic account matches the sidecar signer.", { claimed: claimedSigner, actual: actualSigner })
        : mismatch("native.signer", "Native signer", "The extrinsic is unsigned or was signed by a different account.", { claimed: claimedSigner, actual: actualSigner }));

      const section = extrinsic.method?.section;
      const method = extrinsic.method?.method;
      const actualCallIndex = extrinsic.method?.callIndex ? u8aToHex(extrinsic.method.callIndex).toLowerCase() : null;
      evidence.callIndex = actualCallIndex;
      checks.push(section === "system" && method === "remarkWithEvent" && actualCallIndex === NATIVE_ANCHOR_CALL_INDEX
        ? verified("native.method", "Native call", "The transaction uses system.remarkWithEvent at the reviewed call index.", { section, method, callIndex: actualCallIndex })
        : mismatch("native.method", "Native call", "The transaction does not use the approved system.remarkWithEvent call and reviewed call index.", { section, method, expectedCallIndex: NATIVE_ANCHOR_CALL_INDEX, actualCallIndex }));
      const actualPayload = extrinsic.method?.args?.[0]?.toHex?.()?.toLowerCase?.() ?? null;
      checks.push(actualPayload === expectedPayload
        ? verified("native.commitment", "Recorded report commitment", "The on-chain remark exactly matches the deterministic report commitment.", { expected: expectedPayload, actual: actualPayload })
        : mismatch("native.commitment", "Recorded report commitment", "The on-chain remark does not match the imported report commitment.", { expected: expectedPayload, actual: actualPayload }));

      let records;
      try {
        records = await withTimeout(api.query.system.events.at(blockHash), timeoutMs, "Execution-event query");
      } catch (error) {
        records = null;
        evidence.eventsError = compactError(error);
      }
      const scoped = records ? [...records].filter((record) => eventAtIndex(record, extrinsicIndex)) : [];
      const failed = scoped.find(({ event }) => event.section === "system" && event.method === "ExtrinsicFailed");
      const succeeded = scoped.find(({ event }) => event.section === "system" && event.method === "ExtrinsicSuccess");
      checks.push(failed
        ? mismatch("native.execution", "Transaction execution", "The canonical execution event reports ExtrinsicFailed.", { event: failed.event.toHuman?.() ?? "system.ExtrinsicFailed" })
        : succeeded
          ? verified("native.execution", "Transaction execution", "The canonical execution event reports ExtrinsicSuccess.", { event: "system.ExtrinsicSuccess" })
          : unavailable("native.execution", "Transaction execution", "No authoritative success or failure event was available for this extrinsic.", evidence.eventsError ? { error: evidence.eventsError } : {}));
    }

    const finalizedHeader = await withTimeout(api.rpc.chain.getHeader(finalizedHash), timeoutMs, "Finalized-head header query");
    const finalizedNumber = finalizedHeader.number.toString();
    evidence.finality = { latestFinalizedNumber: finalizedNumber, latestFinalizedHash: finalizedHash.toHex() };
    checks.push(canonicalMatches && BigInt(actualNumber) <= BigInt(finalizedNumber)
      ? verified("native.finality", "Native-chain finality", "The canonical transaction block is at or below the finalized native head.", { blockNumber: actualNumber, finalizedNumber })
      : unavailable("native.finality", "Native-chain finality", "The claimed block is not currently confirmed as canonical and finalized.", { blockNumber: actualNumber, finalizedNumber }));
  } catch (error) {
    const detail = { error: compactError(error) };
    checks.push(unavailable("native.chain", "Portaldot runtime identity", "The native chain identity could not be retrieved.", detail));
    for (const [id, title] of [["native.inclusion", "Canonical block inclusion"], ["native.transaction", "Native transaction"], ["native.signer", "Native signer"], ["native.method", "Native call"], ["native.commitment", "Recorded report commitment"], ["native.execution", "Transaction execution"], ["native.finality", "Native-chain finality"]]) {
      checks.push(unavailable(id, title, "The required native-chain evidence could not be retrieved.", detail));
    }
  } finally {
    if (!apiFactory) {
      if (api) await withTimeout(api.disconnect(), 2_000, "Native proof disconnect").catch(() => {});
      else if (provider) await withTimeout(provider.disconnect(), 2_000, "Native provider disconnect").catch(() => {});
    }
  }

  if (JSON.stringify(report) !== original) throw new Error("Imported report changed during native proof verification.");
  const overall = overallFor(checks);
  return {
    schema: NATIVE_ANCHOR_CHECK_SCHEMA,
    protocol: NATIVE_ANCHOR_PROTOCOL,
    checkedAt: new Date().toISOString(),
    overall,
    summary: overall === NATIVE_PROOF_STATUS.VERIFIED
      ? "The finalized native Portaldot transaction contains the deterministic commitment for the preserved FIRMA report."
      : overall === NATIVE_PROOF_STATUS.MISMATCH
        ? "Available native-chain evidence conclusively disagrees with the claimed report anchor."
        : "Required native transaction, execution, or finality evidence could not currently be confirmed.",
    report: { schema: report.schema, originalVerdict: report.verdict.overall, commitment: computed.commitment, algorithm: computed.algorithm, domain: computed.domain },
    transactionHash,
    anchorType: "native",
    signer: claimedSigner,
    counts: Object.fromEntries(Object.values(NATIVE_PROOF_STATUS).map((status) => [status, checks.filter((item) => item.status === status).length])),
    checks,
    evidence,
    limitations: [
      "This verifies that a finalized transaction committed to the exact imported report; it does not prove every report claim is true.",
      "Control of the signing account does not prove report authorship or real-world identity.",
      "RPC responses are observable evidence, not cryptographic state proofs.",
    ],
  };
}
