const TRANSPORT_FIELDS = new Set(["requestId"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function splitVerificationResponse(value) {
  if (!isRecord(value)) return { report: value, requestId: null };
  const report = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!TRANSPORT_FIELDS.has(key)) report[key] = entry;
  }
  return {
    report,
    requestId: typeof value.requestId === "string" ? value.requestId : null,
  };
}

export function serializeFirmaReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
