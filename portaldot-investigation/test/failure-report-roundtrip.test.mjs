import assert from "node:assert/strict";
import test from "node:test";
import { serializeFirmaReport } from "../public/report-transport.js";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { parseImportedReportText } from "../src/report-import.mjs";
import { verify } from "../src/verifier.mjs";
import { clone, validImportedReport } from "../test-support/report-fixtures.mjs";

function identityRequests(snapshot) {
  return clone(snapshot.evm.requests.filter((record) => record.request.id <= 2));
}

async function exportedFailureReport(error) {
  const successful = validImportedReport().evidence;
  const snapshot = {
    input: clone(successful.input),
    substrate: {
      reachable: false,
      endpoint: successful.input.substrateEndpoint,
      error,
    },
    evm: {
      reachable: true,
      endpoint: successful.input.evmEndpoint,
      identity: clone(successful.evm.identity),
      block: null,
      calls: {},
      requests: identityRequests(successful),
    },
  };
  const report = await verify(snapshot.input, {
    collectSnapshotFn: async () => ({ options: snapshot.input, snapshot: clone(snapshot) }),
  });
  for (const request of report.evidence.evm.requests) request.startedAt = report.startedAt;
  return report;
}

test("actual FIRMA exports remain importable for supported unavailable-evidence states", async () => {
  const cases = [
    { name: "ConnectionError", message: "The Substrate WebSocket connection closed before readiness." },
    { name: "RuntimeIdentityUnavailable", message: "Runtime identity was unavailable." },
    { name: "FinalizedBlockUnavailable", message: "The finalized Substrate block was unavailable." },
    { name: "TimeoutError", message: "Substrate connection timed out." },
  ];
  for (const error of cases) {
    const report = await exportedFailureReport(error);
    const imported = parseImportedReportText(serializeFirmaReport(report));
    assert.deepEqual(imported, report);
    assert.equal(imported.verdict.overall, "UNKNOWN");
    assert.deepEqual(imported.evidence.substrate.error, error);
    assert.equal(imported.evidence.evm.identity.chainId, "420420777");
    assert.equal(imported.evidence.evm.block, null);
  }
});

test("an actual EVM transport-failure export preserves its bounded partial transcript", async () => {
  const successful = validImportedReport().evidence;
  const error = { name: "TimeoutError", message: "eth_chainId timed out." };
  const snapshot = clone(successful);
  snapshot.evm = {
    reachable: false,
    endpoint: successful.input.evmEndpoint,
    identity: null,
    block: null,
    calls: {},
    requests: [{
      startedAt: "2026-10-20T18:53:10.000Z",
      attempt: 0,
      request: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      error,
    }],
    error,
  };
  const report = await verify(snapshot.input, {
    collectSnapshotFn: async () => ({ options: snapshot.input, snapshot: clone(snapshot) }),
  });
  report.evidence.evm.requests[0].startedAt = report.startedAt;
  const imported = parseImportedReportText(serializeFirmaReport(report));
  assert.deepEqual(imported, report);
  assert.equal(imported.verdict.overall, "UNKNOWN");
  assert.deepEqual(imported.evidence.evm.error, error);
});

test("partial runtime fingerprint and unsupported-runtime exports remain importable UNKNOWN reports", async () => {
  for (const variant of ["fingerprint", "unsupported-runtime"]) {
    const snapshot = clone(validImportedReport().evidence);
    if (variant === "fingerprint") {
      snapshot.substrate.runtime.fingerprint.genesisHash = null;
      snapshot.substrate.runtime.fingerprint.errors = {
        genesisHash: { name: "TimeoutError", message: "Genesis-hash query timed out." },
      };
    } else {
      snapshot.substrate.runtime.querySurfaces["assets.account"] = false;
      snapshot.substrate.asset = { exists: false, unsupportedRuntime: true };
      snapshot.substrate.accountMapping = { exists: false, unsupportedRuntime: true };
      snapshot.substrate.balance = { exists: false, value: null };
    }
    const report = await verify(snapshot.input, {
      collectSnapshotFn: async () => ({ options: snapshot.input, snapshot: clone(snapshot) }),
    });
    for (const request of report.evidence.evm.requests) request.startedAt = report.startedAt;
    const imported = parseImportedReportText(serializeFirmaReport(report));
    assert.deepEqual(imported, report);
    assert.equal(imported.verdict.overall, "UNKNOWN");
  }
});

test("unavailable reports validate but never invent historical reproduction or authentication", async () => {
  const report = await exportedFailureReport({ name: "TimeoutError", message: "Substrate connection timed out." });
  let collectorCalls = 0;
  const checked = await independentlyVerifyReport({
    report: parseImportedReportText(serializeFirmaReport(report)),
    collectSnapshotFn: async () => {
      collectorCalls += 1;
      throw new Error("Historical collection must not run without a finalized block.");
    },
  });
  assert.equal(collectorCalls, 0);
  assert.equal(checked.reportValidation.evidenceConsistency, "VALID");
  assert.equal(checked.authentication.status, "UNANCHORED");
  assert.equal(checked.historical.overall, "UNAVAILABLE");
  assert.equal(checked.independent.overall, "UNAVAILABLE");
  assert.equal(checked.historical.reproducedEvidence, null);
  assert.equal(checked.historical.reproducedVerdict, null);
});

test("malformed and tampered failure evidence remains strictly rejected", async () => {
  const report = await exportedFailureReport({ name: "TimeoutError", message: "Substrate connection timed out." });

  const extraField = clone(report);
  extraField.evidence.substrate.error.endpoint = "wss://attacker.invalid";
  assert.throws(() => parseImportedReportText(serializeFirmaReport(extraField)), /not allowed/);

  const malformedCode = clone(report);
  malformedCode.evidence.substrate.error.code = { nested: true };
  assert.throws(() => parseImportedReportText(serializeFirmaReport(malformedCode)), /code is invalid/);

  const tampered = clone(report);
  tampered.evidence.substrate.reachable = true;
  assert.throws(() => parseImportedReportText(serializeFirmaReport(tampered)), /selected block|finalized/i);
});
