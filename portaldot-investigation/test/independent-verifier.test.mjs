import assert from "node:assert/strict";
import test from "node:test";
import { computeReportCommitment } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { BLOCK_NUMBER, clone, validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const collector = (snapshot, inspect = () => {}) => async (input, targetBlock) => {
  inspect(input, targetBlock);
  return { options: input, snapshot };
};

test("a complete exact-block reproduction is VERIFIED and preserves the import", async () => {
  const report = validImportedReport();
  const before = JSON.stringify(report);
  const result = await independentlyVerifyReport({
    report,
    collectSnapshotFn: collector(validHistoricalSnapshot(), (input, targetBlock) => {
      assert.equal(targetBlock, BLOCK_NUMBER);
      assert.equal(input.assetId, report.input.assetId);
      assert.equal(input.account, report.input.account);
    }),
  });
  assert.equal(result.independent.overall, "VERIFIED");
  assert.equal(result.independent.counts.MISMATCH, 0);
  assert.equal(result.independent.counts.UNAVAILABLE, 0);
  assert.equal(JSON.stringify(report), before);
  assert.deepEqual(result.importedReport, report);
  assert.deepEqual(result.importedVerdict, report.verdict);
});

test("a manipulated observation is MISMATCH without changing the original verdict", async () => {
  const report = validImportedReport();
  report.evidence.substrate.asset.supply = "1";
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(result.independent.overall, "MISMATCH");
  assert.equal(result.importedVerdict.overall, "PASS");
  assert.equal(result.independent.checks.find((check) => check.id === "claim.asset.native").status, "MISMATCH");
});

test("missing historical state is UNAVAILABLE, never VERIFIED or a synthetic mismatch", async () => {
  const report = validImportedReport();
  const unavailable = validHistoricalSnapshot();
  unavailable.substrate = {
    reachable: true,
    endpoint: "wss://trusted.example",
    finalized: null,
    latestFinalized: { number: "158174", hash: `0x${"99".repeat(32)}` },
    historical: { requestedNumber: BLOCK_NUMBER, available: false },
    error: { name: "HistoricalStateUnavailable", message: "State already discarded." },
  };
  unavailable.evm.block = { requestedNumber: BLOCK_NUMBER, available: false };
  unavailable.evm.calls = {};
  delete unavailable.evm.precompileAddress;
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(unavailable) });
  assert.equal(result.independent.overall, "UNAVAILABLE");
  assert.ok(result.independent.counts.UNAVAILABLE > 0);
  assert.equal(result.independent.counts.MISMATCH, 0);
  assert.equal(result.independent.checks.find((check) => check.id === "claim.block.substrate").status, "UNAVAILABLE");
});

test("wrong-network identity and genesis evidence are MISMATCH", async () => {
  const report = validImportedReport();
  const wrongNetwork = validHistoricalSnapshot();
  wrongNetwork.evm.identity.chainId = "1";
  wrongNetwork.substrate.runtime.fingerprint.genesisHash = `0x${"11".repeat(32)}`;
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(wrongNetwork) });
  assert.equal(result.independent.overall, "MISMATCH");
  assert.equal(result.independent.checks.find((check) => check.id === "claim.network.evm").status, "MISMATCH");
  assert.equal(result.independent.checks.find((check) => check.id === "claim.runtime.fingerprint").status, "MISMATCH");
});

test("the Phase 7B deterministic commitment is independently recomputed and compared", async () => {
  const report = validImportedReport();
  const expected = computeReportCommitment(report).commitment;
  const matching = await independentlyVerifyReport({ report, expectedCommitment: expected, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(matching.independent.checks.find((check) => check.id === "report.commitment").status, "VERIFIED");

  const wrong = await independentlyVerifyReport({ report, expectedCommitment: `0x${"00".repeat(32)}`, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(wrong.independent.overall, "MISMATCH");
  assert.equal(wrong.independent.checks.find((check) => check.id === "report.commitment").status, "MISMATCH");
});

test("endpoint URLs embedded in a report are never passed to the collector", async () => {
  const report = validImportedReport();
  report.evidence.input.substrateEndpoint = "wss://attacker.invalid";
  report.evidence.input.evmEndpoint = "https://attacker.invalid";
  await independentlyVerifyReport({
    report,
    network: { substrateEndpoint: "wss://trusted.example", evmEndpoint: "https://trusted.example" },
    collectSnapshotFn: collector(validHistoricalSnapshot(), (input) => {
      assert.equal(input.substrateEndpoint, "wss://trusted.example");
      assert.equal(input.evmEndpoint, "https://trusted.example");
    }),
  });
});
