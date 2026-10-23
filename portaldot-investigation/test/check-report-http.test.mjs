import assert from "node:assert/strict";
import test from "node:test";
import { createCheckReportHandler } from "../api/check-report.mjs";
import { validImportedReport } from "../test-support/report-fixtures.mjs";

function request(body, headers = {}) {
  return new Request("https://firma.example/api/check-report", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10", ...headers },
    body,
  });
}

test("report API parses the original JSON text and passes only validated data onward", async () => {
  let received;
  const handler = createCheckReportHandler({
    defaultsFn: () => ({ evmEndpoint: "https://trusted.example" }),
    verifyFn: async (value) => { received = value; return { independent: { overall: "VERIFIED" } }; },
  });
  const reportText = JSON.stringify(validImportedReport());
  const response = await handler.fetch(request(JSON.stringify({ reportText, expectedCommitment: null })));
  assert.equal(response.status, 200);
  assert.equal(received.report.schema, "firma.report.v1");
  assert.equal(received.network.evmEndpoint, "https://trusted.example");
});

test("report API rejects malformed, duplicate-key, missing, and oversized imports before RPC work", async () => {
  let calls = 0;
  const handler = createCheckReportHandler({ verifyFn: async () => { calls += 1; } });
  const malformed = await handler.fetch(request(JSON.stringify({ reportText: "{" })));
  assert.equal(malformed.status, 400);

  const duplicate = await handler.fetch(request(JSON.stringify({ reportText: '{"schema":"firma.report.v1","schema":"firma.report.v1"}' })));
  assert.equal(duplicate.status, 400);

  const missing = await createCheckReportHandler({ verifyFn: async () => { calls += 1; } }).fetch(request("{}"));
  assert.equal(missing.status, 400);

  const oversized = await createCheckReportHandler().fetch(request("{}", { "content-length": "1048577" }));
  assert.equal(oversized.status, 413);

  const undeclaredOversized = await createCheckReportHandler().fetch(request(JSON.stringify({ reportText: "x".repeat(1_048_576) })));
  assert.equal(undeclaredOversized.status, 413);
  assert.equal(calls, 0);
});

test("report API requires JSON and remains read-only", async () => {
  const handler = createCheckReportHandler();
  const wrongType = await handler.fetch(request("{}", { "content-type": "text/plain" }));
  assert.equal(wrongType.status, 415);
  const get = await handler.fetch(new Request("https://firma.example/api/check-report"));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
});

test("report API rate-limits repeated requests and supplies Retry-After", async () => {
  const handler = createCheckReportHandler();
  for (let index = 0; index < 3; index += 1) {
    const response = await handler.fetch(request("{"));
    assert.equal(response.status, 400);
  }
  const limited = await handler.fetch(request("{"));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
});

test("report API classifies deadlines, endpoint unavailability, and unexpected errors", async () => {
  const body = JSON.stringify({ reportText: JSON.stringify(validImportedReport()) });
  const timeout = createCheckReportHandler({
    verificationTimeoutMs: 5,
    verifyFn: async () => new Promise(() => {}),
  });
  const timedOut = await timeout.fetch(request(body));
  assert.equal(timedOut.status, 504);
  assert.match((await timedOut.json()).error, /timed out/i);

  const unavailable = createCheckReportHandler({
    verifyFn: async () => ({ independent: { overall: "UNAVAILABLE" } }),
  });
  const unavailableResponse = await unavailable.fetch(request(body));
  assert.equal(unavailableResponse.status, 200);
  assert.equal((await unavailableResponse.json()).independent.overall, "UNAVAILABLE");

  const failed = createCheckReportHandler({ verifyFn: async () => { throw new Error("RPC implementation fault"); } });
  const failedResponse = await failed.fetch(request(body));
  assert.equal(failedResponse.status, 500);
  assert.equal((await failedResponse.json()).error, "Independent verification failed unexpectedly.");
});
