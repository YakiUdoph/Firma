import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_REPORT_BYTES, parseImportedReport, parseImportedReportText } from "../src/report-import.mjs";
import { clone, validImportedReport } from "../test-support/report-fixtures.mjs";

test("strict report import accepts a complete FIRMA report", () => {
  const report = validImportedReport();
  assert.equal(parseImportedReportText(JSON.stringify(report)).schema, report.schema);
});

test("strict report import accepts the preserved authentic historical report", () => {
  const text = readFileSync(new URL("../evidence/final-live-2026-10-31-02.json", import.meta.url), "utf8");
  const report = parseImportedReportText(text);
  assert.equal(report.schema, "firma.report.v1");
  assert.equal(report.verdict.overall, "PASS");
});

test("malformed and duplicate-key JSON fail before verification", () => {
  assert.throws(() => parseImportedReportText('{"schema":'), /not valid JSON/);
  assert.throws(() => parseImportedReportText('{"schema":"firma.report.v1","schema":"firma.report.v1"}'), /duplicate object key/);
  assert.throws(() => parseImportedReportText('{"__proto__":{}}'), /disallowed property name/);
});

test("oversized imports are rejected using UTF-8 byte length", () => {
  assert.throws(() => parseImportedReportText(`"${"é".repeat(MAX_REPORT_BYTES)}"`), /exceeds 256 KiB/);
});

test("incomplete, internally inconsistent, and extended core schemas fail safely", () => {
  const missingFingerprint = validImportedReport();
  delete missingFingerprint.evidence.substrate.runtime.fingerprint;
  assert.throws(() => parseImportedReport(missingFingerprint), /fingerprint/);

  const wrongBlock = validImportedReport();
  wrongBlock.evidence.evm.block.number = "121097";
  assert.throws(() => parseImportedReport(wrongBlock), /block numbers differ/);

  const wrongInput = validImportedReport();
  wrongInput.evidence.input.assetId = "3";
  assert.throws(() => parseImportedReport(wrongInput), /does not match report input/);

  const unexpected = validImportedReport();
  unexpected.execute = "never";
  assert.throws(() => parseImportedReport(unexpected), /not allowed/);

  const transportMetadata = validImportedReport();
  transportMetadata.requestId = "transport-only";
  assert.throws(() => parseImportedReport(transportMetadata), /requestId is not allowed/);

  const nestedUnexpected = validImportedReport();
  nestedUnexpected.evidence.substrate.asset.unverifiedClaim = "trusted";
  assert.throws(() => parseImportedReport(nestedUnexpected), /not allowed/);

  const tamperedCounts = validImportedReport();
  tamperedCounts.verdict.counts.PASS -= 1;
  assert.throws(() => parseImportedReport(tamperedCounts), /does not match the checks/);

  const unfinalizedOriginal = validImportedReport();
  unfinalizedOriginal.evidence.substrate.latestFinalized.number = (BigInt(unfinalizedOriginal.evidence.substrate.finalized.number) - 1n).toString();
  assert.throws(() => parseImportedReport(unfinalizedOriginal), /must match its finalized head/);
});

test("wrong-network claims remain importable evidence rather than executable configuration", () => {
  const report = clone(validImportedReport());
  report.evidence.input.substrateEndpoint = "wss://attacker.invalid";
  assert.equal(parseImportedReport(report), report);
});
