import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMITMENT_ALGORITHM,
  COMMITMENT_DOMAIN,
  InvalidReportError,
  canonicalizeFirmaReport,
  computeReportCommitment,
} from "../../experimental/onchain-proof/src/report-commitment.mjs";
import { deepFreeze, validReport } from "../../test-support/onchain-proof-fixtures.mjs";

test("RFC 8785 canonicalization makes object insertion order irrelevant", () => {
  const first = validReport();
  const second = {
    limitations: [],
    evidence: first.evidence,
    verdict: first.verdict,
    input: first.input,
    completedAt: first.completedAt,
    startedAt: first.startedAt,
    tool: first.tool,
    schema: first.schema,
  };
  assert.equal(canonicalizeFirmaReport(first), canonicalizeFirmaReport(second));
  assert.equal(computeReportCommitment(first).commitment, computeReportCommitment(second).commitment);
});

test("commitment uses the specified domain-separated SHA-256 construction", () => {
  const result = computeReportCommitment(validReport());
  assert.equal(result.algorithm, COMMITMENT_ALGORITHM);
  assert.equal(result.domain, COMMITMENT_DOMAIN);
  assert.match(result.commitment, /^0x[0-9a-f]{64}$/);
  assert.equal(result.commitment, "0xbddbb2ffa593ce1ec088a9dbdb2a9bf15e25dafc4ecdcb2fc76b2ca04b91615d");
});

test("hashing does not mutate a frozen original report", () => {
  const report = deepFreeze(validReport());
  const before = JSON.stringify(report);
  computeReportCommitment(report);
  assert.equal(JSON.stringify(report), before);
});

test("invalid or already-attached reports are rejected", () => {
  const cases = [
    null,
    {},
    { ...validReport(), schema: "firma.report.v2" },
    { ...validReport(), tool: { mode: "write" } },
    { ...validReport(), verdict: { overall: "MAYBE", checks: [] } },
    { ...validReport(), evidence: {} },
    { ...validReport(), onChainProof: {} },
    { ...validReport(), unsafe: Number.MAX_SAFE_INTEGER + 1 },
    { ...validReport(), negativeZero: -0 },
    { ...validReport(), brokenUnicode: "\ud800" },
    { ...validReport(), impossible: undefined },
  ];
  for (const report of cases) {
    assert.throws(() => computeReportCommitment(report), InvalidReportError);
  }
});
