import assert from "node:assert/strict";
import test from "node:test";
import { Interface } from "ethers";
import {
  ProofTransactionError,
  REPORT_COMMITTED_EVENT,
  assertPortaldotV3Chain,
  submitReportCommitment,
  validateCommitReceipt,
} from "../../experimental/onchain-proof/src/proof-transaction.mjs";
import { validReport } from "../../test-support/onchain-proof-fixtures.mjs";

const registryAddress = "0x1000000000000000000000000000000000000001";
const submitter = "0x2000000000000000000000000000000000000002";
const commitment = `0x${"42".repeat(32)}`;
const iface = new Interface([REPORT_COMMITTED_EVENT]);

function receipt(overrides = {}) {
  const blockNumber = overrides.blockNumber ?? 77;
  const encoded = iface.encodeEventLog(iface.getEvent("ReportCommitted"), [
    overrides.commitment ?? commitment,
    submitter,
    blockNumber,
    1_792_719_906,
  ]);
  return {
    status: 1,
    to: registryAddress,
    transactionHash: `0x${"11".repeat(32)}`,
    blockHash: `0x${"22".repeat(32)}`,
    blockNumber,
    gasUsed: 123n,
    effectiveGasPrice: 45n,
    logs: [{ address: registryAddress, ...encoded }],
    ...overrides,
  };
}

test("wrong-chain detection accepts only Portaldot V3", () => {
  assert.equal(assertPortaldotV3Chain("0x190f1ca9"), 420420777n);
  assert.throws(
    () => assertPortaldotV3Chain(1),
    (error) => error instanceof ProofTransactionError && error.code === "WRONG_CHAIN",
  );
});

test("receipt validation requires success, audited registry, matching event, and block", () => {
  const proof = validateCommitReceipt(receipt(), { registryAddress, commitment });
  assert.equal(proof.commitment, commitment);
  assert.equal(proof.submitter, submitter);
  assert.equal(proof.blockNumber, "77");
  assert.equal(proof.gasUsed, "123");

  const failures = [
    [receipt({ status: 0 }), "TRANSACTION_REVERTED"],
    [receipt({ to: "0x3000000000000000000000000000000000000003" }), "WRONG_REGISTRY"],
    [receipt({ logs: [] }), "MISSING_EVENT"],
    [receipt({ commitment: `0x${"43".repeat(32)}` }), "MISSING_EVENT"],
    [receipt({ blockNumber: 78, logs: receipt({ blockNumber: 77 }).logs }), "BLOCK_MISMATCH"],
  ];
  for (const [candidate, code] of failures) {
    assert.throws(
      () => validateCommitReceipt(candidate, { registryAddress, commitment }),
      (error) => error instanceof ProofTransactionError && error.code === code,
    );
  }
});

test("transaction failures are typed and never mutate the original report", async () => {
  const report = validReport();
  const before = JSON.stringify(report);
  await assert.rejects(
    submitReportCommitment({
      report,
      provider: { getNetwork: async () => ({ chainId: 420420777n }) },
      registryAddress,
      sendTransaction: async () => { throw new Error("wallet rejected"); },
    }),
    (error) => error instanceof ProofTransactionError && error.code === "TRANSACTION_FAILED",
  );
  assert.equal(JSON.stringify(report), before);
  assert.equal(Object.hasOwn(report, "onChainProof"), false);
});

test("wrong chain stops before the transaction callback", async () => {
  let called = false;
  await assert.rejects(
    submitReportCommitment({
      report: validReport(),
      provider: { getNetwork: async () => ({ chainId: 1n }) },
      registryAddress,
      sendTransaction: async () => { called = true; },
    }),
    (error) => error instanceof ProofTransactionError && error.code === "WRONG_CHAIN",
  );
  assert.equal(called, false);
});
