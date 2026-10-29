import assert from "node:assert/strict";
import test from "node:test";
import { computeReportCommitment, InvalidReportError } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { parseImportedReport, parseImportedReportText } from "../src/report-import.mjs";
import { clone, validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const collector = async () => ({ snapshot: validHistoricalSnapshot() });

function rejectedMutation(mutate, pattern) {
  const report = validImportedReport();
  mutate(report);
  assert.throws(() => parseImportedReport(report), pattern ?? InvalidReportError);
}

test("requested block tags are tied to the imported finalized height", () => {
  rejectedMutation((report) => { report.evidence.evm.block.requestedTag = "0x1"; }, /requested EVM block tag/i);
});

test("fabricated, duplicated, and missing request-history entries are rejected", async (t) => {
  await t.test("fabricated", () => rejectedMutation((report) => {
    report.evidence.evm.requests.push({
      startedAt: report.startedAt,
      attempt: 0,
      request: { jsonrpc: "2.0", id: 9, method: "eth_sendRawTransaction", params: ["0xdead"] },
      httpStatus: 200,
      response: { jsonrpc: "2.0", id: 9, result: "0x1" },
    });
  }, /read-only allowlist|unsupported request ID/i));
  await t.test("duplicated", () => rejectedMutation((report) => {
    report.evidence.evm.requests.push(clone(report.evidence.evm.requests[3]));
  }, /duplicated or missing retry attempts|retried after a successful/i));
  await t.test("missing", () => rejectedMutation((report) => {
    report.evidence.evm.requests = report.evidence.evm.requests.filter((entry) => entry.request.id !== 4);
  }, /missing eth_call request ID 4/i));
});

test("mutated methods, parameters, IDs, and responses are rejected", async (t) => {
  await t.test("allowed but wrong method", () => rejectedMutation((report) => {
    report.evidence.evm.requests[3].request.method = "eth_chainId";
  }, /method or parameters contradict/i));
  await t.test("parameters", () => rejectedMutation((report) => {
    report.evidence.evm.requests[3].request.params[1] = "0x1";
  }, /method or parameters contradict/i));
  await t.test("response ID", () => rejectedMutation((report) => {
    report.evidence.evm.requests[3].response.id = 99;
  }, /does not match the recorded request ID/i));
  await t.test("response value", () => rejectedMutation((report) => {
    report.evidence.evm.requests[3].response.result = `0x${"00".repeat(32)}`;
  }, /contradicts decoded EVM call evidence/i));
});

test("legitimate bounded retries and read-only JSON-RPC errors remain compatible", async (t) => {
  await t.test("transport retry", () => {
    const report = validImportedReport();
    const successful = report.evidence.evm.requests.find((entry) => entry.request.id === 4);
    const failed = clone(successful);
    delete failed.httpStatus;
    delete failed.response;
    failed.error = { name: "TypeError", message: "fetch failed" };
    successful.attempt = 1;
    report.evidence.evm.requests.splice(report.evidence.evm.requests.indexOf(successful), 0, failed);
    assert.equal(parseImportedReport(report), report);
  });

  await t.test("metadata-missing RPC response", () => {
    const report = validImportedReport();
    const rpcError = { code: -32000, message: "metadata not found" };
    report.evidence.evm.calls.name = {
      ok: false,
      kind: "metadata-missing",
      error: { name: "RpcError", message: "eth_call: metadata not found", code: -32000 },
      rpcError,
    };
    const record = report.evidence.evm.requests.find((entry) => entry.request.id === 6);
    delete record.response.result;
    record.response.error = rpcError;
    report.verdict = evaluateSnapshot(report.evidence);
    assert.equal(parseImportedReport(report), report);
  });
});

test("contradictory duplicate verdict content is rejected", async (t) => {
  await t.test("check evidence", () => rejectedMutation((report) => {
    report.verdict.checks.find((check) => check.id === "asset.supply").evidence.native = "1";
  }, /duplicated verdict/i));
  await t.test("check summary", () => rejectedMutation((report) => {
    report.verdict.checks.find((check) => check.id === "asset.supply").summary = "Everything is probably fine.";
  }, /duplicated verdict/i));
  await t.test("count", () => rejectedMutation((report) => {
    report.verdict.counts.PASS -= 1;
  }, /does not match the checks/i));
});

test("genuine reports distinguish historical reproduction from authentication", async () => {
  const report = validImportedReport();
  const unanchored = await independentlyVerifyReport({ report, collectSnapshotFn: collector });
  assert.equal(unanchored.schema, "firma.independent-verification.v2");
  assert.equal(unanchored.reportValidation.structure, "VALID");
  assert.equal(unanchored.reportValidation.evidenceConsistency, "VALID");
  assert.equal(unanchored.historical.overall, "VERIFIED");
  assert.equal(unanchored.authentication.status, "UNANCHORED");
  assert.equal(unanchored.independent.overall, "REPRODUCED");

  const trusted = computeReportCommitment(report).commitment;
  const authenticated = await independentlyVerifyReport({ report, expectedCommitment: trusted, collectSnapshotFn: collector });
  assert.equal(authenticated.historical.overall, "VERIFIED");
  assert.equal(authenticated.authentication.status, "AUTHENTICATED");
  assert.equal(authenticated.independent.overall, "AUTHENTICATED");
});

test("altered, malformed, and absent trusted commitments never imply authentication", async () => {
  const report = validImportedReport();
  const altered = await independentlyVerifyReport({
    report,
    expectedCommitment: `0x${"00".repeat(32)}`,
    collectSnapshotFn: collector,
  });
  assert.equal(altered.historical.overall, "VERIFIED");
  assert.equal(altered.authentication.status, "MISMATCH");
  assert.equal(altered.independent.overall, "MISMATCH");
  await assert.rejects(
    independentlyVerifyReport({ report, expectedCommitment: "0x1234", collectSnapshotFn: collector }),
    InvalidReportError,
  );
});

test("unsupported report versions and malformed reports are rejected", () => {
  const unsupported = validImportedReport();
  unsupported.schema = "firma.report.v2";
  assert.throws(() => parseImportedReport(unsupported), /schema must be firma\.report\.v1/i);
  assert.throws(() => parseImportedReportText("{"), /not valid JSON/i);
  const missing = validImportedReport();
  delete missing.evidence.evm.requests;
  assert.throws(() => parseImportedReport(missing), /requests must be an array/i);
});
