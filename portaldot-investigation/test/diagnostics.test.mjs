import assert from "node:assert/strict";
import test from "node:test";
import { createVerificationDiagnostics, VERIFICATION_DIAGNOSTIC_STAGES } from "../src/diagnostics.mjs";
import { parseImportedReport } from "../src/report-import.mjs";
import { verify } from "../src/verifier.mjs";
import { matchingSnapshot } from "../test-support/fixtures.mjs";
import { validImportedReport } from "../test-support/report-fixtures.mjs";

const input = {
  expectedChainId: "420420777",
  assetId: "2",
  account: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380",
};

function options() {
  return {
    ...input,
    substrateEndpoint: "wss://secret-user:secret-token@example.invalid/private",
    evmEndpoint: "https://example.invalid/rpc?token=secret-token",
  };
}

function clock() {
  let tick = 0;
  return () => (tick += 5);
}

function completeAllStages(diagnostics) {
  for (const stage of VERIFICATION_DIAGNOSTIC_STAGES) {
    diagnostics.start(stage);
    diagnostics.end("ok");
  }
}

test("successful verification emits bounded stage timings and verdict counts", async () => {
  const entries = [];
  const diagnostics = createVerificationDiagnostics({ requestId: "request-123", logger: (entry) => entries.push(entry), now: clock() });
  const report = await verify(input, {
    diagnostics,
    collectSnapshotFn: async (_input, _target, activeDiagnostics) => {
      completeAllStages(activeDiagnostics);
      return { options: options(), snapshot: matchingSnapshot() };
    },
  });

  diagnostics.emit(report.verdict);

  assert.equal(report.verdict.overall, "PASS");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, "firma.verification.timing.v1");
  assert.equal(entries[0].requestId, "request-123");
  assert.deepEqual(entries[0].counts, { PASS: 9, FAIL: 0, UNKNOWN: 0 });
  assert.deepEqual(Object.keys(entries[0].stages), [...VERIFICATION_DIAGNOSTIC_STAGES]);
  for (const stage of Object.values(entries[0].stages)) {
    assert.equal(stage.outcome, "ok");
    assert.ok(Number.isSafeInteger(stage.durationMs));
    assert.ok(stage.durationMs >= 0);
  }
  assert.ok(entries[0].totalDurationMs >= 0);
  assert.equal(entries[0].failure, null);
});

test("Substrate initialization timeout is sanitized and UNKNOWN remains UNKNOWN", async () => {
  const entries = [];
  const sensitiveError = new Error(`Substrate connection failed for ${options().substrateEndpoint} and ${input.account}`);
  sensitiveError.name = "TimeoutError";
  const diagnostics = createVerificationDiagnostics({ requestId: "request-timeout", logger: (entry) => entries.push(entry), now: clock() });
  const report = await verify(input, {
    diagnostics,
    collectSnapshotFn: async (_input, _target, activeDiagnostics) => {
      activeDiagnostics.start("substrate.connection");
      activeDiagnostics.fail(sensitiveError);
      return {
        options: options(),
        snapshot: matchingSnapshot({
          substrate: {
            reachable: false,
            identity: null,
            finalized: null,
            runtime: null,
            asset: null,
            accountMapping: null,
            balance: null,
            error: { name: "TimeoutError", message: sensitiveError.message },
          },
          evm: { reachable: true, identity: { chainId: "420420777" }, block: null, calls: {} },
        }),
      };
    },
  });

  diagnostics.emit(report.verdict);

  assert.equal(report.verdict.overall, "UNKNOWN");
  assert.equal(report.verdict.counts.FAIL, 0);
  assert.deepEqual(entries[0].failure, { stage: "substrate.connection", category: "timeout" });
  assert.equal(entries[0].stages["substrate.connection"].outcome, "error");
  assert.equal(entries[0].stages["substrate.connection"].category, "timeout");
  const logged = JSON.stringify(entries[0]);
  assert.ok(logged.length < 4_096);
  assert.doesNotMatch(logged, /578f0a6155551b3b7c7ff255ea7dc2b08968e380/i);
  assert.doesNotMatch(logged, /example\.invalid|secret-token|secret-user/i);
});

test("diagnostics do not change the report schema and logging failures are fail-open", async () => {
  const diagnostics = createVerificationDiagnostics({
    requestId: "request-logger-failure",
    logger: () => { throw new Error("logging backend unavailable"); },
    now: clock(),
  });
  const report = await verify(input, {
    diagnostics,
    collectSnapshotFn: async (_input, _target, activeDiagnostics) => {
      completeAllStages(activeDiagnostics);
      return { options: options(), snapshot: matchingSnapshot() };
    },
  });

  assert.doesNotThrow(() => diagnostics.emit(report.verdict));
  assert.equal(report.verdict.overall, "PASS");
  assert.equal(Object.hasOwn(report, "diagnostics"), false);
  const existingReport = validImportedReport();
  assert.equal(parseImportedReport(existingReport), existingReport);
});
