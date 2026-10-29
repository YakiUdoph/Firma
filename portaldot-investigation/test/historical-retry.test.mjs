import assert from "node:assert/strict";
import test from "node:test";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { collectSnapshot } from "../src/verifier.mjs";
import { validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const timeoutEvidence = (message) => ({
  reachable: false,
  endpoint: "wss://approved.example.invalid",
  error: { name: "TimeoutError", message },
});

test("historical collection retries one initialization timeout and preserves the exact block", async () => {
  const targets = [];
  const snapshots = [
    timeoutEvidence("Substrate connection timed out."),
    validHistoricalSnapshot().substrate,
  ];
  const result = await collectSnapshot({}, "232113", null, {
    substrateTimeoutRetries: 1,
    collectSubstrateFn: async (_options, target) => {
      targets.push(target);
      return snapshots.shift();
    },
    collectEvmFn: async () => validHistoricalSnapshot().evm,
  });
  assert.deepEqual(targets, ["232113", "232113"]);
  assert.equal(result.snapshot.substrate.reachable, true);
});

test("historical metadata timeout is retried once and exhaustion remains UNAVAILABLE", async () => {
  let calls = 0;
  const report = validImportedReport();
  const result = await independentlyVerifyReport({
    report,
    collectSnapshotFn: (input, target, diagnostics, lifecycle) => collectSnapshot(input, target, diagnostics, {
      ...lifecycle,
      collectSubstrateFn: async () => {
        calls += 1;
        return timeoutEvidence("Substrate identity and metadata queries timed out.");
      },
      collectEvmFn: async () => validHistoricalSnapshot().evm,
    }),
  });
  assert.equal(calls, 2);
  assert.equal(result.independent.overall, "UNAVAILABLE");
  assert.equal(result.historical.counts.MISMATCH, 0);
  assert.ok(result.historical.counts.UNAVAILABLE > 0);
  assert.equal(result.historical.checks.find((check) => check.id === "claim.block.substrate").status, "UNAVAILABLE");
});

test("non-timeout historical failures are not retried", async () => {
  let calls = 0;
  await collectSnapshot({}, "232113", null, {
    substrateTimeoutRetries: 1,
    collectSubstrateFn: async () => {
      calls += 1;
      return { reachable: false, error: { name: "RpcError", message: "endpoint unavailable" } };
    },
    collectEvmFn: async () => validHistoricalSnapshot().evm,
  });
  assert.equal(calls, 1);
});
