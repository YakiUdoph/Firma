import assert from "node:assert/strict";
import test from "node:test";
import { encodeAddress } from "@polkadot/util-crypto";
import {
  NATIVE_ANCHOR_PROTOCOL,
  NATIVE_ANCHOR_SCHEMA,
  NATIVE_ANCHOR_CALL_INDEX,
  NATIVE_PROOF_STATUS,
  encodeNativeAnchorPayload,
  prepareNativeAnchor,
  verifyNativeAnchor,
} from "../src/native-anchor.mjs";
import { PORTALDOT_V3_SUPPORT_PROFILE } from "../src/constants.mjs";
import { validImportedReport } from "../test-support/report-fixtures.mjs";

const signer = encodeAddress(new Uint8Array(32).fill(7), 42);
const otherSigner = encodeAddress(new Uint8Array(32).fill(8), 42);
const transactionHash = `0x${"11".repeat(32)}`;
const blockHash = `0x${"22".repeat(32)}`;
const finalizedHash = `0x${"33".repeat(32)}`;

const hex = (value) => ({ toHex: () => value });
const text = (value) => ({ toString: () => String(value) });

function fixture(overrides = {}) {
  const report = validImportedReport();
  const preparation = prepareNativeAnchor(report, signer);
  const extrinsic = {
    hash: hex(transactionHash),
    isSigned: true,
    signer: text(overrides.actualSigner ?? signer),
    method: {
      section: overrides.section ?? "system",
      method: overrides.method ?? "remarkWithEvent",
      callIndex: overrides.callIndex ?? new Uint8Array([0, 7]),
      args: [hex(overrides.payload ?? preparation.payload)],
    },
  };
  const block = overrides.missingBlock ? null : {
    header: { number: text("100") },
    extrinsics: overrides.extrinsics ?? [extrinsic],
  };
  const eventName = overrides.event ?? "ExtrinsicSuccess";
  const events = overrides.events ?? (eventName ? [{
    phase: { isApplyExtrinsic: true, asApplyExtrinsic: text("0") },
    event: { section: "system", method: eventName, toHuman: () => ({ method: eventName }), toString: () => `system.${eventName}` },
  }] : []);
  const api = {
    rpc: {
      chain: {
        getBlockHash: async (number) => hex(number === 0 ? PORTALDOT_V3_SUPPORT_PROFILE.genesisHash : (overrides.canonicalHash ?? blockHash)),
        getBlock: async () => ({ block }),
        getFinalizedHead: async () => {
          if (overrides.finalityError) throw new Error("finality unavailable");
          return hex(finalizedHash);
        },
        getHeader: async () => ({ number: text(overrides.finalizedNumber ?? "101") }),
      },
      state: {
        getRuntimeVersion: async () => ({
          specName: text(overrides.specName ?? PORTALDOT_V3_SUPPORT_PROFILE.specName),
          specVersion: text(PORTALDOT_V3_SUPPORT_PROFILE.specVersion),
          transactionVersion: text(PORTALDOT_V3_SUPPORT_PROFILE.transactionVersion),
        }),
        getStorageHash: async () => hex(PORTALDOT_V3_SUPPORT_PROFILE.runtimeCodeHash),
      },
    },
    query: { system: { events: { at: async () => {
      if (overrides.eventsError) throw new Error("events unavailable");
      return events;
    } } } },
  };
  const evidence = {
    schema: NATIVE_ANCHOR_SCHEMA,
    protocol: NATIVE_ANCHOR_PROTOCOL,
    signer: overrides.claimedSigner ?? signer,
    commitment: overrides.commitment ?? preparation.commitment,
    payload: overrides.claimedPayload ?? preparation.payload,
    transactionHash: overrides.claimedTransactionHash ?? transactionHash,
    blockNumber: "100",
    blockHash,
    extrinsicIndex: overrides.extrinsicIndex ?? "0",
  };
  return { report, preparation, evidence, api, apiFactory: async () => api };
}

async function verify(value, report = value.report) {
  return verifyNativeAnchor({ report, claimedEvidence: value.evidence, apiFactory: value.apiFactory });
}

test("native preparation is deterministic, versioned, and report-immutable", () => {
  const report = validImportedReport();
  const before = JSON.stringify(report);
  const first = prepareNativeAnchor(report, signer);
  const second = prepareNativeAnchor(report, signer);
  assert.equal(first.commitment, second.commitment);
  assert.equal(first.payload, encodeNativeAnchorPayload(first.commitment));
  assert.match(first.payload, /^0x4649524d410002/);
  assert.equal(JSON.stringify(report), before);
});

test("native preparation rejects non-PASS reports", () => {
  for (const overall of ["UNKNOWN", "FAIL"]) {
    const report = validImportedReport();
    report.verdict.overall = overall;
    assert.throws(() => prepareNativeAnchor(report, signer), /Only a genuine FIRMA PASS report/);
  }
});

test("a canonical successful finalized native remark is VERIFIED", async () => {
  const value = fixture();
  const before = JSON.stringify(value.report);
  const result = await verify(value);
  assert.equal(result.overall, NATIVE_PROOF_STATUS.VERIFIED);
  assert.equal(result.counts.VERIFIED, result.checks.length);
  assert.equal(JSON.stringify(value.report), before);
});

test("wrong chain, signer, method, payload, transaction hash, and failed execution are MISMATCH", async () => {
  const cases = [
    fixture({ specName: "other-chain" }),
    fixture({ actualSigner: otherSigner }),
    fixture({ method: "remark" }),
    fixture({ callIndex: new Uint8Array([0, 8]) }),
    fixture({ payload: `0x${"44".repeat(39)}` }),
    fixture({ claimedTransactionHash: `0x${"55".repeat(32)}` }),
    fixture({ event: "ExtrinsicFailed" }),
  ];
  for (const value of cases) assert.equal((await verify(value)).overall, NATIVE_PROOF_STATUS.MISMATCH);
});

test("native proof uses the shared bounded connection path and disconnects it", async () => {
  const value = fixture();
  let receivedOptions;
  let disconnects = 0;
  value.apiFactory = null;
  value.api.disconnect = async () => { disconnects += 1; };
  const result = await verifyNativeAnchor({
    report: value.report,
    claimedEvidence: value.evidence,
    network: { substrateEndpoint: "wss://approved.example.invalid", timeoutMs: 321, retries: 2 },
    connectionFactory: async (options) => {
      receivedOptions = options;
      return { api: value.api, provider: {} };
    },
  });
  assert.equal(result.overall, NATIVE_PROOF_STATUS.VERIFIED);
  assert.equal(result.evidence.callIndex, NATIVE_ANCHOR_CALL_INDEX);
  assert.equal(receivedOptions.timeoutMs, 321);
  assert.equal(receivedOptions.retries, 2);
  assert.equal(disconnects, 1);
});

test("native proof keeps connection failures and timeouts UNAVAILABLE", async () => {
  for (const error of [
    Object.assign(new Error("WebSocket disconnected during initialization"), { name: "ConnectionError" }),
    Object.assign(new Error("connection timed out"), { name: "TimeoutError" }),
  ]) {
    const value = fixture();
    const result = await verifyNativeAnchor({
      report: value.report,
      claimedEvidence: value.evidence,
      network: { substrateEndpoint: "wss://approved.example.invalid", timeoutMs: 10, retries: 1 },
      connectionFactory: async () => { throw error; },
    });
    assert.equal(result.overall, NATIVE_PROOF_STATUS.UNAVAILABLE);
    assert.equal(result.checks.find(({ id }) => id === "native.chain").evidence.error.name, error.name);
  }
});

test("wrong canonical block hash and included but unfinalized blocks cannot verify", async () => {
  assert.equal((await verify(fixture({ canonicalHash: `0x${"99".repeat(32)}` }))).overall, NATIVE_PROOF_STATUS.MISMATCH);
  const unfinalized = await verify(fixture({ finalizedNumber: "99" }));
  assert.equal(unfinalized.overall, NATIVE_PROOF_STATUS.UNAVAILABLE);
  assert.equal(unfinalized.checks.find(({ id }) => id === "native.finality").status, NATIVE_PROOF_STATUS.UNAVAILABLE);
});

test("missing block, execution events, finality, or extrinsic remain UNAVAILABLE unless contradicted", async () => {
  assert.equal((await verify(fixture({ missingBlock: true }))).overall, NATIVE_PROOF_STATUS.UNAVAILABLE);
  assert.equal((await verify(fixture({ events: [] }))).checks.find(({ id }) => id === "native.execution").status, NATIVE_PROOF_STATUS.UNAVAILABLE);
  assert.equal((await verify(fixture({ finalityError: true }))).overall, NATIVE_PROOF_STATUS.UNAVAILABLE);
  const missingExtrinsic = await verify(fixture({ extrinsics: [], extrinsicIndex: "0" }));
  assert.equal(missingExtrinsic.checks.find(({ id }) => id === "native.transaction").status, NATIVE_PROOF_STATUS.MISMATCH);
});

test("altered reports and altered sidecars cannot verify", async () => {
  const value = fixture();
  const altered = structuredClone(value.report);
  altered.completedAt = "2026-10-30T23:59:59.000Z";
  assert.equal((await verify(value, altered)).overall, NATIVE_PROOF_STATUS.MISMATCH);
  assert.equal((await verify(fixture({ commitment: `0x${"66".repeat(32)}` }))).overall, NATIVE_PROOF_STATUS.MISMATCH);
  assert.equal((await verify(fixture({ claimedPayload: `0x${"77".repeat(39)}` }))).overall, NATIVE_PROOF_STATUS.MISMATCH);
  assert.equal((await verify(fixture({ claimedSigner: otherSigner }))).overall, NATIVE_PROOF_STATUS.MISMATCH);
});

test("invalid SS58 accounts and malformed native evidence are rejected", async () => {
  assert.throws(() => prepareNativeAnchor(validImportedReport(), "0x1234"), /SS58/);
  const value = fixture();
  value.evidence.extrinsicIndex = "-1";
  await assert.rejects(verify(value), /Extrinsic index/);
});
