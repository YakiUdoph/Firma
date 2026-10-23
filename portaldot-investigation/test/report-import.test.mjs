import assert from "node:assert/strict";
import test from "node:test";
import { MAX_REPORT_BYTES, parseImportedReport, parseImportedReportText } from "../src/report-import.mjs";
import { clone, validImportedReport } from "../test-support/report-fixtures.mjs";

test("strict report import accepts a complete FIRMA report", () => {
  const report = validImportedReport();
  assert.equal(parseImportedReportText(JSON.stringify(report)).schema, report.schema);
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
});

test("wrong-network claims remain importable evidence rather than executable configuration", () => {
  const report = clone(validImportedReport());
  report.evidence.input.substrateEndpoint = "wss://attacker.invalid";
  assert.equal(parseImportedReport(report), report);
});
