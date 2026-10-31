import assert from "node:assert/strict";
import test from "node:test";
import {
  ONCHAIN_STATUS,
  encodeAnchorCalldata,
  prepareAnchorTransaction,
  verifyOnchainAnchor,
} from "../src/onchain-anchor.mjs";
import { validImportedReport } from "../test-support/report-fixtures.mjs";

const account = "0x2000000000000000000000000000000000000002";
const hash = `0x${"11".repeat(32)}`;
const blockHash = `0x${"22".repeat(32)}`;

function fixture(overrides = {}) {
  const report = validImportedReport();
  const prepared = prepareAnchorTransaction(report, account);
  const transaction = {
    hash,
    from: account,
    to: account,
    value: "0x0",
    input: encodeAnchorCalldata(prepared.commitment),
    chainId: "0x190f1ca9",
    blockNumber: "0x64",
    ...overrides.transaction,
  };
  const receipt = {
    transactionHash: hash,
    status: "0x1",
    blockNumber: "0x64",
    blockHash,
    to: account,
    ...overrides.receipt,
  };
  const block = {
    number: "0x64",
    hash: blockHash,
    timestamp: "0x1",
    transactions: [hash],
    ...overrides.block,
  };
  const responses = {
    eth_chainId: "0x190f1ca9",
    eth_getTransactionByHash: transaction,
    eth_getTransactionReceipt: receipt,
    eth_getBlockByNumber: block,
    ...overrides.responses,
  };
  return {
    report,
    prepared,
    rpcClient: { async call(method) { const value = responses[method]; if (value instanceof Error) throw value; return value; } },
    collectFinalityFn: overrides.collectFinalityFn ?? (async () => ({ available: true, finalized: true, requestedBlockNumber: "100", substrateBlockHash: blockHash })),
  };
}

async function verify(value, extra = {}) {
  return verifyOnchainAnchor({
    report: value.report,
    transactionHash: hash,
    rpcClient: value.rpcClient,
    collectFinalityFn: value.collectFinalityFn,
    ...extra,
  });
}

test("EVM preparation rejects non-PASS reports", () => {
  for (const overall of ["UNKNOWN", "FAIL"]) {
    const report = validImportedReport();
    report.verdict.overall = overall;
    assert.throws(() => prepareAnchorTransaction(report, account), /Only a genuine FIRMA PASS report/);
  }
});

test("a correct contractless transaction is VERIFIED and leaves the report unchanged", async () => {
  const value = fixture();
  const before = JSON.stringify(value.report);
  const result = await verify(value);
  assert.equal(result.overall, ONCHAIN_STATUS.VERIFIED);
  assert.equal(result.counts.VERIFIED, result.checks.length);
  assert.equal(JSON.stringify(value.report), before);
  assert.equal(Object.hasOwn(value.report, "onChainProof"), false);
});

test("wrong chain, failed execution, destination, calldata, and altered reports are MISMATCH", async () => {
  const cases = [
    fixture({ responses: { eth_chainId: "0x1" } }),
    fixture({ receipt: { status: "0x0" } }),
    fixture({ transaction: { to: "0x3000000000000000000000000000000000000003" } }),
    fixture({ transaction: { input: `0x${"00".repeat(39)}` } }),
  ];
  for (const value of cases) assert.equal((await verify(value)).overall, ONCHAIN_STATUS.MISMATCH);

  const value = fixture();
  const altered = structuredClone(value.report);
  altered.completedAt = "2026-10-30T00:00:00.000Z";
  const result = await verify(value, { report: altered });
  assert.equal(result.checks.find(({ id }) => id === "anchor.commitment").status, ONCHAIN_STATUS.MISMATCH);
});

test("RPC timeout, missing receipt, and unavailable historical finality remain UNAVAILABLE", async () => {
  const timeout = fixture({ responses: { eth_getTransactionByHash: new Error("timeout") } });
  assert.equal((await verify(timeout)).overall, ONCHAIN_STATUS.UNAVAILABLE);

  const missing = fixture({ responses: { eth_getTransactionReceipt: null } });
  assert.equal((await verify(missing)).checks.find(({ id }) => id === "anchor.receipt").status, ONCHAIN_STATUS.UNAVAILABLE);

  const finality = fixture({ collectFinalityFn: async () => ({ available: false, finalized: false }) });
  assert.equal((await verify(finality)).checks.find(({ id }) => id === "anchor.finality").status, ONCHAIN_STATUS.UNAVAILABLE);
});

test("a reorganization or receipt substitution is a demonstrated MISMATCH", async () => {
  const reorg = fixture({ block: { hash: `0x${"33".repeat(32)}`, transactions: [] } });
  assert.equal((await verify(reorg)).checks.find(({ id }) => id === "anchor.inclusion").status, ONCHAIN_STATUS.MISMATCH);

  const substituted = fixture({ receipt: { transactionHash: `0x${"44".repeat(32)}` } });
  assert.equal((await verify(substituted)).checks.find(({ id }) => id === "anchor.receipt").status, ONCHAIN_STATUS.MISMATCH);
});

test("altered anchoring evidence is MISMATCH even when its transaction hash is real", async () => {
  const value = fixture();
  const result = await verify(value, { claimedEvidence: { transactionHash: hash, commitment: `0x${"55".repeat(32)}` } });
  assert.equal(result.checks.find(({ id }) => id === "anchor.evidenceCommitment").status, ONCHAIN_STATUS.MISMATCH);
});
