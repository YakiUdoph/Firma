import assert from "node:assert/strict";
import test from "node:test";
import { guidanceForCheck, projectInvestigation } from "../public/investigation.js";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { parseImportedReport } from "../src/report-import.mjs";
import { matchingSnapshot } from "../test-support/fixtures.mjs";
import { clone, validImportedReport } from "../test-support/report-fixtures.mjs";

function reportFrom(snapshot) {
  return {
    schema: "firma.report.v1",
    input: snapshot.input,
    verdict: evaluateSnapshot(snapshot),
    evidence: snapshot,
  };
}

function guidance(report, id) {
  const check = report.verdict.checks.find((item) => item.id === id);
  assert.ok(check, `Expected check ${id}`);
  return guidanceForCheck(report, check);
}

test("matching observations produce bounded PASS guidance for every existing check", () => {
  const report = reportFrom(matchingSnapshot());
  const projected = projectInvestigation(report);
  assert.equal(projected.overall, "PASS");
  assert.equal(projected.checks.length, 9);
  assert.match(projected.blockContext, /finalized block 120900/i);
  for (const item of projected.checks) {
    assert.ok(item.guidance.observed.length > 0);
    assert.ok(item.guidance.proves.length > 0);
    assert.ok(item.guidance.doesNotProve.length > 0);
    assert.ok(item.guidance.nextSteps.length > 0);
  }
  assert.match(guidance(report, "asset.supply").doesNotProve, /does not prove.*transfer/i);
  assert.match(guidance(report, "asset.balance").doesNotProve, /does not prove.*ownership/i);
});

test("confirmed supply and balance mismatches quote exact values without assigning a cause", () => {
  const report = reportFrom(matchingSnapshot({
    substrate: {
      asset: { supply: "999999999999999999999999999999999999999" },
      balance: { value: "888888888888888888888888888888888888888" },
    },
  }));
  assert.equal(report.verdict.counts.FAIL, 2);
  const supply = guidance(report, "asset.supply");
  const balance = guidance(report, "asset.balance");
  assert.match(supply.observed, /999999999999999999999999999999999999999/);
  assert.match(supply.observed, /15000000000000000000/);
  assert.match(balance.observed, /888888888888888888888888888888888888888/);
  assert.match(supply.doesNotProve, /does not.*identify.*caused/i);
  assert.match(balance.doesNotProve, /does not.*identify.*caused/i);
  assert.doesNotMatch(`${supply.observed} ${balance.observed}`, /root cause|bug in/i);
});

test("metadata mismatch and consistent metadata absence remain distinct", () => {
  const mismatchReport = reportFrom(matchingSnapshot({
    evm: { calls: { symbol: { ok: true, value: "OTHER" } } },
  }));
  const mismatch = guidance(mismatchReport, "asset.metadata");
  assert.equal(mismatchReport.verdict.checks.find((item) => item.id === "asset.metadata").status, "FAIL");
  assert.match(mismatch.observed, /symbol: native.*TEST.*EVM.*OTHER/i);

  const absentReport = reportFrom(matchingSnapshot({
    substrate: { asset: { metadata: { exists: false, name: null, symbol: null, decimals: null } } },
    evm: { calls: {
      name: { ok: false, kind: "metadata-missing" },
      symbol: { ok: false, kind: "metadata-missing" },
      decimals: { ok: false, kind: "metadata-missing" },
    } },
  }));
  const absent = guidance(absentReport, "asset.metadata");
  assert.equal(absentReport.verdict.checks.find((item) => item.id === "asset.metadata").status, "PASS");
  assert.match(absent.observed, /metadata storage was absent/i);
  assert.match(absent.nextSteps[0], /do not substitute empty/i);

  const emptyNameReport = reportFrom(matchingSnapshot({
    substrate: { asset: { metadata: { name: "" } } },
    evm: { calls: { name: { ok: true, value: "" } } },
  }));
  assert.equal(emptyNameReport.verdict.checks.find((item) => item.id === "asset.metadata").status, "PASS");
  assert.match(guidance(emptyNameReport, "asset.metadata").observed, /metadata matched/i);
});

test("missing native balance records and Revive mappings never become zero", () => {
  const missingBalanceReport = reportFrom(matchingSnapshot({
    substrate: { balance: { exists: false, value: null, storageKey: "0xmissing" } },
  }));
  const missingBalance = guidance(missingBalanceReport, "asset.balance");
  assert.match(missingBalance.observed, /no Assets account record/i);
  assert.match(missingBalance.doesNotProve, /not evidence.*zero/i);

  const missingMappingReport = reportFrom(matchingSnapshot({
    substrate: {
      accountMapping: { exists: false, accountId: null, storageKey: "0xmapping" },
      balance: { exists: false, value: null, storageKey: null },
    },
  }));
  const mapping = guidance(missingMappingReport, "account.mapping");
  assert.match(mapping.observed, /No usable Revive OriginalAccount mapping/i);
  assert.match(mapping.doesNotProve, /either balance is zero/i);
  assert.match(mapping.nextSteps.join(" "), /do not guess or derive/i);
});

test("unsupported runtime guidance preserves the fail-closed gate", () => {
  const report = reportFrom(matchingSnapshot({
    substrate: { runtime: { fingerprint: { runtimeCodeHash: `0x${"99".repeat(32)}` } } },
  }));
  const runtimeCheck = report.verdict.checks.find((item) => item.id === "runtime.support");
  const runtime = guidanceForCheck(report, runtimeCheck);
  assert.equal(runtimeCheck.status, "UNKNOWN");
  assert.match(runtime.observed, /runtimeCodeHash/);
  assert.match(runtime.nextSteps.join(" "), /review and test.*before changing.*fail-closed/i);
  assert.doesNotMatch(runtime.nextSteps.join(" "), /bypass|ignore|force.*pass/i);
  for (const id of ["asset.supply", "account.mapping", "asset.balance", "asset.metadata"]) {
    assert.equal(report.verdict.checks.find((item) => item.id === id).status, "UNKNOWN");
  }
});

test("unexpected chain identity is a demonstrated contradiction with a configuration-first next step", () => {
  const report = reportFrom(matchingSnapshot({ evm: { identity: { chainId: "1" } } }));
  const identity = guidance(report, "identity.chainId");
  assert.equal(report.verdict.checks.find((item) => item.id === "identity.chainId").status, "FAIL");
  assert.match(identity.observed, /reported chain ID 1.*expected 420420777/i);
  assert.match(identity.nextSteps[0], /operator-controlled EVM endpoint/i);
  assert.match(identity.doesNotProve, /does not.*asset-state mismatch/i);
});

test("historical unavailability and shared-block failure never substitute current state", () => {
  const historicalReport = {
    input: { expectedChainId: "420420777", assetId: "2", account: "0x0000000000000000000000000000000000000001" },
    evidence: {
      substrate: {
        reachable: true,
        finalized: null,
        historical: { requestedNumber: "100", available: false, finalized: true },
        error: { name: "HistoricalStateUnavailable", message: "Block 100 is unavailable." },
      },
      evm: { reachable: true, block: { requestedNumber: "100", available: false } },
    },
  };
  const historical = guidanceForCheck(historicalReport, { id: "context.block", title: "Shared block context", status: "UNKNOWN", evidence: {} });
  assert.match(historical.observed, /historical block 100.*not available/i);
  assert.match(historical.nextSteps.join(" "), /Do not substitute current state/i);

  const differentBlocks = reportFrom(matchingSnapshot({ evm: { block: { number: "120901" } } }));
  const shared = guidance(differentBlocks, "context.block");
  assert.match(shared.observed, /Native block: 120900; EVM block: 120901/i);
  assert.match(shared.doesNotProve, /not a demonstrated.*contradiction/i);
});

test("RPC timeout and malformed observations remain inconclusive", () => {
  const timeoutReport = reportFrom(matchingSnapshot({
    substrate: {
      reachable: false,
      identity: null,
      finalized: null,
      runtime: null,
      asset: null,
      accountMapping: null,
      balance: null,
      error: { name: "TimeoutError", message: "Connection timed out after 15000 ms." },
    },
  }));
  const endpoint = guidance(timeoutReport, "network.substrate");
  assert.match(endpoint.observed, /TimeoutError/);
  assert.match(endpoint.nextSteps[0], /reachable and responsive/i);
  assert.match(endpoint.doesNotProve, /does not demonstrate a chain defect/i);

  const malformed = guidanceForCheck({ evidence: {} }, {
    id: "asset.supply",
    title: "Total supply parity",
    status: "PASS",
    evidence: {},
  });
  assert.match(malformed.observed, /unavailable or malformed/i);
  assert.match(malformed.proves, /cannot establish/i);
  assert.doesNotMatch(malformed.proves, /values match|exactly the same|reported agreement/i);
});

test("summary precedence is FAIL then UNKNOWN then PASS across simultaneous results", () => {
  const failed = reportFrom(matchingSnapshot({
    substrate: {
      asset: { supply: "1", metadata: { symbol: "NATIVE" } },
      balance: { value: "2" },
    },
  }));
  const failedSummary = projectInvestigation(failed);
  assert.equal(failed.verdict.counts.FAIL, 3);
  assert.equal(failedSummary.overall, "FAIL");
  assert.match(failedSummary.priorityIssue, /contradiction takes priority/i);

  const unknown = reportFrom(matchingSnapshot({
    evm: {
      calls: {
        totalSupply: { ok: false, kind: "rpc-error", error: { name: "RpcError", message: "unavailable" } },
        balanceOf: { ok: false, kind: "rpc-error", error: { name: "RpcError", message: "unavailable" } },
      },
    },
  }));
  const unknownSummary = projectInvestigation(unknown);
  assert.ok(unknown.verdict.counts.UNKNOWN >= 2);
  assert.equal(unknownSummary.overall, "UNKNOWN");
  assert.match(unknownSummary.priorityIssue, /does not claim success/i);

  assert.equal(projectInvestigation(reportFrom(matchingSnapshot())).overall, "PASS");
});

test("projection leaves valid firma.report.v1 evidence byte-for-byte unchanged", () => {
  const report = validImportedReport();
  const before = JSON.stringify(report);
  assert.equal(parseImportedReport(report), report);
  projectInvestigation(report);
  for (const check of report.verdict.checks) guidanceForCheck(report, check);
  assert.equal(JSON.stringify(report), before);
  assert.equal(parseImportedReport(report), report);
  assert.equal(Object.hasOwn(report, "investigation"), false);
});

test("hostile evidence text remains inert presentation data", () => {
  const payload = `</p><script data-injected>globalThis.__firmaInjected=true</script>`;
  const report = clone(validImportedReport());
  report.evidence.substrate.asset.metadata.name = payload;
  report.evidence.evm.calls.name.value = payload;
  report.verdict = evaluateSnapshot(report.evidence);
  const metadata = guidance(report, "asset.metadata");
  assert.match(metadata.observed, /<script data-injected>/);
  assert.equal(globalThis.__firmaInjected, undefined);
});
