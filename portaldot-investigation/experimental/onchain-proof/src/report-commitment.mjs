import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export const COMMITMENT_DOMAIN = "FIRMA_REPORT_COMMITMENT_V1\n";
export const REPORT_SCHEMA = "firma.report.v1";
export const COMMITMENT_ALGORITHM = "RFC8785-JCS+SHA-256";

const VERDICTS = new Set(["PASS", "FAIL", "UNKNOWN"]);

export class InvalidReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidReportError";
    this.code = "INVALID_REPORT";
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertUnicodeScalarString(value, path) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new InvalidReportError(`${path} contains an unpaired Unicode surrogate.`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new InvalidReportError(`${path} contains an unpaired Unicode surrogate.`);
    }
  }
}

function assertJsonValue(value, path = "report", seen = new Set()) {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    assertUnicodeScalarString(value, path);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new InvalidReportError(`${path} contains a non-finite or unsafe JSON number.`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new InvalidReportError(`${path} contains a value that JSON cannot represent.`);
  }
  if (seen.has(value)) throw new InvalidReportError(`${path} contains a circular reference.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`, seen));
  } else {
    if (!isPlainObject(value)) throw new InvalidReportError(`${path} must contain only plain JSON objects.`);
    for (const [key, entry] of Object.entries(value)) {
      assertUnicodeScalarString(key, `${path} key`);
      assertJsonValue(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function assertValidFirmaReport(report) {
  if (!isPlainObject(report)) throw new InvalidReportError("Report must be a JSON object.");
  if (report.schema !== REPORT_SCHEMA) throw new InvalidReportError(`Report schema must be ${REPORT_SCHEMA}.`);
  if (!isPlainObject(report.tool) || report.tool.mode !== "read-only") {
    throw new InvalidReportError("Report must identify FIRMA read-only mode.");
  }
  if (!isPlainObject(report.input)) throw new InvalidReportError("Report input is required.");
  if (!isPlainObject(report.verdict) || !VERDICTS.has(report.verdict.overall)) {
    throw new InvalidReportError("Report verdict must be PASS, FAIL, or UNKNOWN.");
  }
  if (!Array.isArray(report.verdict.checks) || report.verdict.checks.length === 0) {
    throw new InvalidReportError("Report must include at least one verdict check.");
  }
  for (const [index, check] of report.verdict.checks.entries()) {
    if (!isPlainObject(check) || !VERDICTS.has(check.status)) {
      throw new InvalidReportError(`Report check ${index} has an invalid status.`);
    }
  }
  if (!isPlainObject(report.evidence?.substrate) || !isPlainObject(report.evidence?.evm)) {
    throw new InvalidReportError("Report must include Substrate and EVM evidence.");
  }
  if (Object.hasOwn(report, "onChainProof")) {
    throw new InvalidReportError("Hash the original report without an onChainProof attachment.");
  }
  assertJsonValue(report);
  return report;
}

export function canonicalizeFirmaReport(report) {
  assertValidFirmaReport(report);
  const canonical = canonicalize(report);
  if (typeof canonical !== "string") throw new InvalidReportError("Report could not be canonicalized.");
  return canonical;
}

export function computeReportCommitment(report) {
  const canonicalReport = canonicalizeFirmaReport(report);
  const digest = createHash("sha256")
    .update(COMMITMENT_DOMAIN, "utf8")
    .update(canonicalReport, "utf8")
    .digest("hex");
  return {
    algorithm: COMMITMENT_ALGORITHM,
    domain: COMMITMENT_DOMAIN,
    canonicalReport,
    commitment: `0x${digest}`,
  };
}
