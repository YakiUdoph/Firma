import assert from "node:assert/strict";
import test from "node:test";
import { assessReportIntegrity, guidanceForCheck, projectInvestigation } from "../public/investigation.js";
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

function setCheckStatus(report, id, status) {
  const check = report.verdict.checks.find((item) => item.id === id);
  assert.ok(check, `Expected check ${id}`);
  check.status = status;
  return check;
}

function alignCounts(report) {
  report.verdict.counts = Object.fromEntries(["PASS", "FAIL", "UNKNOWN"].map((status) => [
    status,
    report.verdict.checks.filter((check) => check?.status === status).length,
  ]));
  return report;
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
  assert.match(shared.observed, /native block 120900 and EVM block 120901 differ/i);
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
  assert.equal(malformed.integrity, "INCONSISTENT");
  assert.match(malformed.observed, /not available|malformed/i);
  assert.match(malformed.proves, /cannot be established/i);
  assert.doesNotMatch(malformed.proves, /values match|exactly the same|reported agreement/i);
});

test("FAIL cannot turn matching chain, supply, balance, mapping, or metadata evidence into a contradiction", () => {
  const cases = [
    ["identity.chainId", /contradicts the configured|chain identity contradicts/i],
    ["asset.supply", /supply values contradict/i],
    ["account.mapping", /No usable Revive|mapping was observed/i],
    ["asset.balance", /balances contradict/i],
    ["asset.metadata", /metadata observations contradicted|fields? (?:differ|missing)/i],
  ];
  for (const [id, unsupportedClaim] of cases) {
    const report = reportFrom(matchingSnapshot());
    const check = setCheckStatus(report, id, "FAIL");
    const before = JSON.stringify(report);
    const projected = guidanceForCheck(report, check);
    assert.equal(check.status, "FAIL");
    assert.equal(projected.integrity, "INCONSISTENT");
    assert.match(projected.observed, /status and supporting evidence cannot be reconciled/i);
    assert.match(projected.nextSteps.join(" "), /independently reproduce/i);
    assert.doesNotMatch(`${projected.observed} ${projected.proves}`, unsupportedClaim);
    assert.equal(JSON.stringify(report), before);
  }
});

test("every status and evidence inconsistency category remains explicit and non-mutating", () => {
  const missing = guidanceForCheck({ evidence: {} }, {
    id: "asset.supply", title: "Total supply parity", status: "FAIL", evidence: {},
  });
  assert.equal(missing.integrity, "INCONSISTENT");
  assert.match(missing.observed, /valid native and EVM integer supply observations is not available/i);
  assert.doesNotMatch(missing.proves, /contradict/i);

  const malformedReport = reportFrom(matchingSnapshot());
  malformedReport.evidence.substrate.asset.supply = "ten";
  const malformedCheck = setCheckStatus(malformedReport, "asset.supply", "FAIL");
  const malformed = guidanceForCheck(malformedReport, malformedCheck);
  assert.equal(malformed.integrity, "INCONSISTENT");
  assert.match(malformed.observed, /valid native and EVM integer/i);
  assert.doesNotMatch(malformed.proves, /contradict/i);

  const genuineMismatch = reportFrom(matchingSnapshot({ substrate: { asset: { supply: "9" } } }));
  const demonstrated = guidance(genuineMismatch, "asset.supply");
  assert.equal(demonstrated.integrity, "SUPPORTED");
  assert.match(demonstrated.proves, /contradict/i);

  const passWithContradiction = clone(genuineMismatch);
  const passCheck = setCheckStatus(passWithContradiction, "asset.supply", "PASS");
  const passBefore = JSON.stringify(passWithContradiction);
  const passGuidance = guidanceForCheck(passWithContradiction, passCheck);
  assert.equal(passGuidance.integrity, "INCONSISTENT");
  assert.match(passGuidance.observed, /native supply 9.*different/i);
  assert.equal(passCheck.status, "PASS");
  assert.equal(JSON.stringify(passWithContradiction), passBefore);

  const unknownWithAgreement = reportFrom(matchingSnapshot());
  const unknownCheck = setCheckStatus(unknownWithAgreement, "asset.supply", "UNKNOWN");
  const unknownGuidance = guidanceForCheck(unknownWithAgreement, unknownCheck);
  assert.equal(unknownGuidance.integrity, "INCONSISTENT");
  assert.match(unknownGuidance.observed, /both supply observations equal/i);
  assert.equal(unknownCheck.status, "UNKNOWN");

  for (const status of [undefined, "BROKEN"]) {
    const report = reportFrom(matchingSnapshot());
    const check = setCheckStatus(report, "asset.supply", status);
    const projected = guidanceForCheck(report, check);
    assert.equal(projected.integrity, "INCONSISTENT");
    assert.match(projected.observed, /labels this check (missing|BROKEN)/i);
    assert.equal(check.status, status);
  }
});

test("report integrity reconciles overall verdicts, required checks, statuses, counts, and evidence", () => {
  const valid = reportFrom(matchingSnapshot());
  assert.deepEqual(assessReportIntegrity(valid), {
    trusted: true,
    reportedOverall: "PASS",
    checkOverall: "PASS",
    evidenceSupportedOverall: "PASS",
    issues: [],
  });

  const cases = [
    ["PASS overall with FAIL check", (report) => {
      report.evidence.substrate.asset.supply = "9";
      report.verdict = evaluateSnapshot(report.evidence);
      report.verdict.overall = "PASS";
    }, /reported overall PASS.*individual check result FAIL/i],
    ["PASS overall with UNKNOWN check", (report) => {
      setCheckStatus(report, "asset.supply", "UNKNOWN");
      alignCounts(report);
      report.verdict.overall = "PASS";
    }, /reported overall PASS.*individual check result UNKNOWN/i],
    ["FAIL overall with only PASS checks", (report) => { report.verdict.overall = "FAIL"; }, /reported overall FAIL.*individual check result PASS/i],
    ["UNKNOWN overall with all PASS checks", (report) => { report.verdict.overall = "UNKNOWN"; }, /reported overall UNKNOWN.*individual check result PASS/i],
    ["missing required check", (report) => {
      report.verdict.checks = report.verdict.checks.filter((check) => check.id !== "asset.supply");
      alignCounts(report);
    }, /required check asset\.supply is missing/i],
    ["duplicate check", (report) => {
      report.verdict.checks.push(clone(report.verdict.checks[0]));
      alignCounts(report);
    }, /appears more than once/i],
    ["unknown check ID", (report) => { report.verdict.checks[0].id = "unknown.check"; }, /unknown ID unknown\.check/i],
    ["malformed check status", (report) => { report.verdict.checks[0].status = "BROKEN"; }, /missing or unexpected status/i],
    ["missing verdict", (report) => { delete report.verdict; }, /verdict is missing or malformed/i],
    ["malformed verdict", (report) => { report.verdict = []; }, /verdict is missing or malformed/i],
    ["conflicting integrity signals", (report) => {
      setCheckStatus(report, "asset.supply", "FAIL");
      alignCounts(report);
      report.verdict.overall = "FAIL";
    }, /status or evidence that cannot be reconciled/i],
  ];

  for (const [label, mutate, expected] of cases) {
    const report = reportFrom(matchingSnapshot());
    mutate(report);
    const before = JSON.stringify(report);
    const integrity = assessReportIntegrity(report);
    assert.equal(integrity.trusted, false, label);
    assert.match(integrity.issues.join("; "), expected, label);
    assert.equal(integrity.evidenceSupportedOverall, null, label);
    assert.equal(JSON.stringify(report), before, `${label} mutated the report`);
  }

  const multipleFailures = reportFrom(matchingSnapshot({
    substrate: { asset: { supply: "9", metadata: { symbol: "OTHER" } }, balance: { value: "8" } },
  }));
  const before = JSON.stringify(multipleFailures);
  const integrity = assessReportIntegrity(multipleFailures);
  assert.equal(integrity.trusted, true);
  assert.equal(integrity.reportedOverall, "FAIL");
  assert.equal(integrity.checkOverall, "FAIL");
  assert.equal(integrity.evidenceSupportedOverall, "FAIL");
  assert.equal(JSON.stringify(multipleFailures), before);
});

test("shared-block evidence fails closed on unavailable, missing, malformed, or contradictory context", () => {
  const cases = [
    ["EVM unavailable", (report) => { report.evidence.evm.block.available = false; }, /not affirmatively recorded as available/i],
    ["missing native finality", (report) => { report.evidence.substrate.finalized = null; }, /native finalized-block observation is missing/i],
    ["native historical block not finalized", (report) => {
      report.evidence.substrate.historical = { requestedNumber: "120900", available: true, finalized: false };
    }, /native historical-block finality evidence is missing, unavailable, or malformed/i],
    ["missing EVM block", (report) => { report.evidence.evm.block = null; }, /EVM block observation is missing/i],
    ["malformed native block", (report) => { report.evidence.substrate.finalized.number = "12.5"; }, /native finalized-block observation is missing or malformed/i],
    ["malformed EVM block", (report) => { report.evidence.evm.block.number = "0x1"; }, /EVM block observation is missing or malformed/i],
    ["contradictory EVM tag", (report) => { report.evidence.evm.block.requestedTag = "0x1"; }, /requested EVM block tag does not match/i],
    ["contradictory finalized head", (report) => {
      report.evidence.substrate.latestFinalized = { ...report.evidence.substrate.finalized, hash: "0xdifferent" };
    }, /selected native block hash conflicts/i],
  ];
  for (const [label, mutate, expected] of cases) {
    const report = reportFrom(matchingSnapshot({ substrate: { asset: { supply: "9" }, balance: { value: "8" } } }));
    mutate(report);
    for (const id of ["context.block", "asset.supply", "asset.balance"]) {
      const projected = guidance(report, id);
      assert.match(projected.observed, expected, `${label}: ${id}`);
      assert.doesNotMatch(`${projected.observed} ${projected.proves}`, /values contradict|balances contradict|same-block contradiction/i, `${label}: ${id}`);
    }
  }

  const genuine = reportFrom(matchingSnapshot({ substrate: { asset: { supply: "9" }, balance: { value: "8" } } }));
  assert.match(guidance(genuine, "asset.supply").proves, /supply values contradict/i);
  assert.match(guidance(genuine, "asset.balance").proves, /balances contradict/i);
});

test("Revive guidance distinguishes valid, missing, malformed, mismatched, and unavailable observations", () => {
  const valid = reportFrom(matchingSnapshot());
  assert.match(guidance(valid, "account.mapping").observed, /Revive storage mapped/i);

  const missing = reportFrom(matchingSnapshot({
    substrate: { accountMapping: { exists: false, accountId: null }, balance: { exists: false, value: null } },
  }));
  assert.match(guidance(missing, "account.mapping").observed, /No usable Revive OriginalAccount mapping was observed/i);

  const cases = [
    ["malformed H160", (report) => { report.evidence.substrate.accountMapping.h160 = "0x1234"; }, /observed mapping H160 is missing or malformed/i],
    ["malformed AccountId", (report) => { report.evidence.substrate.accountMapping.accountId = "not-an-account"; }, /mapped AccountId is missing or malformed/i],
    ["input mismatch", (report) => { report.evidence.substrate.accountMapping.h160 = "0x1111111111111111111111111111111111111111"; }, /does not match the requested account/i],
    ["decode failure", (report) => { delete report.evidence.substrate.accountMapping; }, /observed Revive mapping is missing or malformed/i],
  ];
  for (const [label, mutate, expected] of cases) {
    const report = reportFrom(matchingSnapshot());
    mutate(report);
    const mapping = guidance(report, "account.mapping");
    const balance = guidance(report, "asset.balance");
    assert.match(mapping.observed, expected, label);
    assert.match(balance.observed, expected, `${label}: dependent balance`);
    assert.doesNotMatch(`${mapping.observed} ${mapping.proves}`, /Revive storage mapped/i, label);
    if (label === "decode failure") assert.doesNotMatch(mapping.observed, /No usable Revive OriginalAccount mapping was observed/i);
    assert.doesNotMatch(`${balance.observed} ${balance.proves}`, /balances (?:match|contradict)/i, label);
  }

  const inconsistent = reportFrom(matchingSnapshot());
  setCheckStatus(inconsistent, "account.mapping", "FAIL");
  assert.equal(guidance(inconsistent, "account.mapping").integrity, "INCONSISTENT");
});

test("different or malformed block contexts cannot establish cross-interface contradictions", () => {
  const cases = [
    ["asset.supply", { substrate: { asset: { supply: "9" } } }],
    ["asset.balance", { substrate: { balance: { value: "9" } } }],
    ["asset.metadata", { substrate: { asset: { metadata: { symbol: "OTHER" } } } }],
  ];
  for (const [id, overrides] of cases) {
    const report = reportFrom(matchingSnapshot(overrides));
    const check = report.verdict.checks.find((item) => item.id === id);
    assert.equal(check.status, "FAIL");
    report.evidence.evm.block.number = "120901";
    const before = JSON.stringify(report);
    const projected = guidanceForCheck(report, check);
    assert.equal(projected.integrity, "INCONSISTENT");
    assert.match(projected.observed, /not tied to one verified shared finalized block/i);
    assert.doesNotMatch(`${projected.observed} ${projected.proves}`, /contradict(?:ion|s|ed)?/i);
    assert.equal(check.status, "FAIL");
    assert.equal(JSON.stringify(report), before);
  }
});

test("malformed Revive mapping fields cannot be presented as a valid mapping", () => {
  const report = reportFrom(matchingSnapshot());
  report.evidence.substrate.accountMapping.h160 = "0x1234";
  report.evidence.substrate.accountMapping.accountId = "not-an-account-id";
  const check = report.verdict.checks.find((item) => item.id === "account.mapping");
  assert.equal(check.status, "PASS");
  const before = JSON.stringify(report);
  const projected = guidanceForCheck(report, check);
  assert.equal(projected.integrity, "INCONSISTENT");
  assert.match(projected.observed, /observed mapping H160 is missing or malformed/i);
  assert.doesNotMatch(projected.observed, /evidence contains a Revive mapping/i);
  assert.equal(check.status, "PASS");
  assert.equal(JSON.stringify(report), before);
});

test("inconsistent metadata guidance neither invents differing fields nor executes hostile text", () => {
  const payload = `</p><script data-remediation-injected>globalThis.__firmaRemediationInjected=true</script>`;
  const report = reportFrom(matchingSnapshot({
    substrate: { asset: { metadata: { name: payload } } },
    evm: { calls: { name: { ok: true, value: payload } } },
  }));
  const check = setCheckStatus(report, "asset.metadata", "FAIL");
  const before = JSON.stringify(report);
  const metadata = guidanceForCheck(report, check);
  assert.equal(metadata.integrity, "INCONSISTENT");
  assert.match(metadata.observed, /available native and EVM metadata fields match exactly/i);
  assert.doesNotMatch(metadata.observed, /fields? (?:differ|missing)/i);
  assert.equal(globalThis.__firmaRemediationInjected, undefined);
  assert.equal(JSON.stringify(report), before);
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
  assert.equal(report.schema, "firma.report.v1");
  assert.equal(parseImportedReport(report), report);
  projectInvestigation(report);
  assert.equal(assessReportIntegrity(report).trusted, true);
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
