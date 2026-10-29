import assert from "node:assert/strict";
import test from "node:test";
import { computeReportCommitment } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { BLOCK_NUMBER, clone, validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const collector = (snapshot, inspect = () => {}) => async (input, targetBlock) => {
  inspect(input, targetBlock);
  return { options: input, snapshot };
};

test("a complete exact-block reproduction is REPRODUCED but UNANCHORED and preserves the import", async () => {
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
  assert.equal(result.independent.overall, "REPRODUCED");
  assert.equal(result.historical.overall, "VERIFIED");
  assert.equal(result.authentication.status, "UNANCHORED");
  assert.equal(result.historical.counts.MISMATCH, 0);
  assert.equal(result.historical.counts.UNAVAILABLE, 0);
  assert.equal(JSON.stringify(report), before);
  assert.deepEqual(result.importedReport, report);
  assert.deepEqual(result.importedVerdict, report.verdict);
});

test("a manipulated observation is MISMATCH without changing the original verdict", async () => {
  const report = validImportedReport();
  report.evidence.substrate.asset.supply = "1";
  report.verdict = evaluateSnapshot(report.evidence);
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(result.independent.overall, "MISMATCH");
  assert.equal(result.importedVerdict.overall, "FAIL");
  assert.equal(result.historical.checks.find((check) => check.id === "claim.asset.native").status, "MISMATCH");
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
  assert.ok(result.historical.counts.UNAVAILABLE > 0);
  assert.equal(result.historical.counts.MISMATCH, 0);
  assert.equal(result.historical.checks.find((check) => check.id === "claim.block.substrate").status, "UNAVAILABLE");
});

test("wrong-network identity and genesis evidence are MISMATCH", async () => {
  const report = validImportedReport();
  const wrongNetwork = validHistoricalSnapshot();
  wrongNetwork.evm.identity.chainId = "1";
  wrongNetwork.substrate.runtime.fingerprint.genesisHash = `0x${"11".repeat(32)}`;
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(wrongNetwork) });
  assert.equal(result.independent.overall, "MISMATCH");
  assert.equal(result.historical.checks.find((check) => check.id === "claim.network.evm").status, "MISMATCH");
  assert.equal(result.historical.checks.find((check) => check.id === "claim.runtime.fingerprint").status, "MISMATCH");
});

test("a retrievable block newer than the finalized head is UNAVAILABLE", async () => {
  const report = validImportedReport();
  const merelyRetrievable = validHistoricalSnapshot();
  merelyRetrievable.substrate.latestFinalized.number = (BigInt(BLOCK_NUMBER) - 1n).toString();
  merelyRetrievable.substrate.historical.finalized = false;
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(merelyRetrievable) });
  assert.equal(result.independent.overall, "UNAVAILABLE");
  assert.equal(result.historical.counts.MISMATCH, 0);
  assert.equal(result.historical.checks.find((check) => check.id === "claim.block.substrate").status, "UNAVAILABLE");
});

test("internally contradictory adversarial report mutations are rejected before reproduction", async (t) => {
  const mutations = [
    ["native network identity", "claim.network.substrate", (report) => { report.evidence.substrate.identity.chain = "Imposter Testnet"; }],
    ["EVM network identity", "claim.network.evm", (report) => { report.evidence.evm.identity.chainId = "1"; }],
    ["native block hash", "claim.block.substrate", (report) => {
      report.evidence.substrate.finalized.hash = `0x${"11".repeat(32)}`;
      report.evidence.substrate.latestFinalized.hash = report.evidence.substrate.finalized.hash;
      report.evidence.substrate.runtime.fingerprint.collectedAtBlockHash = report.evidence.substrate.finalized.hash;
    }],
    ["EVM block hash", "claim.block.evm", (report) => { report.evidence.evm.block.hash = `0x${"22".repeat(32)}`; }],
    ["runtime version", "claim.runtime.version", (report) => { report.evidence.substrate.runtime.specVersion = "9999"; }],
    ["runtime fingerprint", "claim.runtime.fingerprint", (report) => { report.evidence.substrate.runtime.fingerprint.runtimeCodeHash = `0x${"33".repeat(32)}`; }],
    ["asset identifier", "claim.asset.identifier", (report) => { report.evidence.evm.precompileAddress = `0x${"44".repeat(20)}`; }],
    ["account mapping", "claim.account.mapping", (report) => { report.evidence.substrate.accountMapping.accountId = "5FakeAccount"; }],
    ["native balance", "claim.asset.balance.native", (report) => { report.evidence.substrate.balance.value = "7"; }],
    ["native metadata", "claim.asset.metadata.native", (report) => { report.evidence.substrate.asset.metadata.symbol = "FAKE"; }],
    ["EVM metadata", "claim.evm.symbol", (report) => { report.evidence.evm.calls.symbol.value = "FAKE"; }],
    ["EVM raw return bytes", "claim.evm.totalSupply", (report) => { report.evidence.evm.calls.totalSupply.raw = "0xff"; }],
    ["reported check status", "verdict.asset.balance", (report) => {
      report.verdict.checks.find((check) => check.id === "asset.balance").status = "UNKNOWN";
      report.verdict.counts = { PASS: 8, FAIL: 0, UNKNOWN: 1 };
      report.verdict.overall = "UNKNOWN";
    }],
  ];

  for (const [name, , mutate] of mutations) {
    await t.test(name, async () => {
      const report = validImportedReport();
      mutate(report);
      await assert.rejects(
        independentlyVerifyReport({ report, collectSnapshotFn: collector(validHistoricalSnapshot()) }),
        { name: "InvalidReportError" },
      );
    });
  }
});

test("semantically valid storage-key changes are caught by historical reproduction", async () => {
  const report = validImportedReport();
  report.evidence.substrate.balance.storageKey = "0xee";
  const result = await independentlyVerifyReport({ report, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(result.independent.overall, "MISMATCH");
  assert.equal(result.historical.checks.find((check) => check.id === "claim.asset.balance.native").status, "MISMATCH");
});

test("the Phase 7B deterministic commitment is independently recomputed and compared", async () => {
  const report = validImportedReport();
  const expected = computeReportCommitment(report).commitment;
  const matching = await independentlyVerifyReport({ report, expectedCommitment: expected, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(matching.independent.overall, "AUTHENTICATED");
  assert.equal(matching.authentication.status, "AUTHENTICATED");

  const wrong = await independentlyVerifyReport({ report, expectedCommitment: `0x${"00".repeat(32)}`, collectSnapshotFn: collector(validHistoricalSnapshot()) });
  assert.equal(wrong.independent.overall, "MISMATCH");
  assert.equal(wrong.authentication.status, "MISMATCH");
});

test("endpoint URLs embedded in a report are never passed to the collector", async () => {
  const report = validImportedReport();
  report.evidence.input.substrateEndpoint = "wss://attacker.invalid";
  report.evidence.input.evmEndpoint = "https://attacker.invalid";
  report.evidence.substrate.endpoint = "wss://attacker.invalid";
  report.evidence.evm.endpoint = "https://attacker.invalid";
  await independentlyVerifyReport({
    report,
    network: { substrateEndpoint: "wss://trusted.example", evmEndpoint: "https://trusted.example" },
    collectSnapshotFn: collector(validHistoricalSnapshot(), (input) => {
      assert.equal(input.substrateEndpoint, "wss://trusted.example");
      assert.equal(input.evmEndpoint, "https://trusted.example");
    }),
  });
});
