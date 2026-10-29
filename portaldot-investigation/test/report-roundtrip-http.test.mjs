import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createCheckReportHandler } from "../api/check-report.mjs";
import { createVerifyHandler } from "../api/verify.mjs";
import { computeReportCommitment } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { serializeFirmaReport, splitVerificationResponse } from "../public/report-transport.js";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { parseImportedReportText } from "../src/report-import.mjs";
import { verify } from "../src/verifier.mjs";
import { clone, validImportedReport } from "../test-support/report-fixtures.mjs";

async function startHttpServer(routes) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: ["GET", "HEAD"].includes(incoming.method) ? undefined : Buffer.concat(chunks),
        duplex: "half",
      });
      const handler = routes.get(new URL(request.url).pathname);
      if (!handler) {
        outgoing.writeHead(404).end();
        return;
      }
      const response = await handler.fetch(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500, { "content-type": "text/plain" });
      outgoing.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not allocate a port.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function snapshotFor(overall) {
  const snapshot = clone(validImportedReport().evidence);
  if (overall === "FAIL") {
    const raw = `0x${"1".padStart(64, "0")}`;
    snapshot.evm.calls.totalSupply = { ok: true, value: "1", raw };
    snapshot.evm.requests.find((record) => record.request.id === 4).response.result = raw;
  }
  if (overall === "UNKNOWN") snapshot.substrate.runtime.specName = "unreviewed-runtime";
  return snapshot;
}

function jsonPost(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.40" },
    body: JSON.stringify(body),
  });
}

test("real HTTP verification exports canonical PASS, FAIL, and UNKNOWN reports that independently recheck", async (t) => {
  const snapshots = ["PASS", "FAIL", "UNKNOWN"].map(snapshotFor);
  let verificationIndex = 0;
  const defaults = snapshots[0].input;
  const verifyHandler = createVerifyHandler({
    defaultsFn: () => defaults,
    verifyFn: async (input, options) => {
      const snapshot = snapshots[verificationIndex++];
      const report = await verify(input, {
        ...options,
        collectSnapshotFn: async () => ({ options: snapshot.input, snapshot: clone(snapshot) }),
      });
      for (const record of report.evidence.evm.requests) record.startedAt = report.startedAt;
      return report;
    },
    diagnosticsFn: () => ({ emit() {} }),
  });
  const checkHandler = createCheckReportHandler({
    defaultsFn: () => defaults,
    verifyFn: (input) => independentlyVerifyReport({
      ...input,
      collectSnapshotFn: async () => ({ options: input.network, snapshot: clone(input.report.evidence) }),
    }),
  });
  const invalidHandler = createCheckReportHandler({ verifyFn: async () => { throw new Error("invalid report reached verification"); } });
  const server = await startHttpServer(new Map([
    ["/api/verify", verifyHandler],
    ["/api/check-report", checkHandler],
    ["/api/check-invalid", invalidHandler],
  ]));
  t.after(() => server.close());

  let lastExport = null;
  for (const expectedOverall of ["PASS", "FAIL", "UNKNOWN"]) {
    const verificationResponse = await jsonPost(`${server.url}/api/verify`, {
      assetId: defaults.assetId,
      account: defaults.account,
    });
    assert.equal(verificationResponse.status, 200);
    const transportBody = await verificationResponse.json();
    assert.equal(typeof transportBody.requestId, "string");

    const { report, requestId } = splitVerificationResponse(transportBody);
    assert.equal(requestId, transportBody.requestId);
    assert.equal(report.verdict.overall, expectedOverall);
    assert.equal(Object.hasOwn(report, "requestId"), false);
    const beforeExport = computeReportCommitment(report).commitment;
    const exportedText = serializeFirmaReport(report);
    assert.equal(exportedText.includes("requestId"), false);
    const imported = parseImportedReportText(exportedText);
    assert.deepEqual(imported, report);
    assert.equal(computeReportCommitment(imported).commitment, beforeExport);

    const checkedResponse = await jsonPost(`${server.url}/api/check-report`, {
      reportText: exportedText,
      expectedCommitment: beforeExport,
    });
    assert.equal(checkedResponse.status, 200);
    const checked = await checkedResponse.json();
    assert.equal(checked.independent.overall, "AUTHENTICATED");
    assert.equal(checked.historical.overall, "VERIFIED");
    assert.equal(checked.authentication.status, "AUTHENTICATED");
    assert.equal(checked.commitment.computed, beforeExport);
    assert.deepEqual(checked.importedReport, report);
    assert.equal(Object.hasOwn(checked.importedReport, "requestId"), false);
    lastExport = exportedText;

    const injectedTransportField = splitVerificationResponse({ ...transportBody, diagnostic: "not evidence" }).report;
    assert.throws(() => parseImportedReportText(serializeFirmaReport(injectedTransportField)), /not allowed/);
  }

  const malformed = await jsonPost(`${server.url}/api/check-invalid`, { reportText: "{" });
  assert.equal(malformed.status, 400);

  const extra = JSON.parse(lastExport);
  extra.unverifiedClaim = true;
  const extraResponse = await jsonPost(`${server.url}/api/check-invalid`, { reportText: serializeFirmaReport(extra) });
  assert.equal(extraResponse.status, 400);
  assert.match((await extraResponse.json()).error, /not allowed/);

  const missing = JSON.parse(lastExport);
  delete missing.tool;
  const missingResponse = await jsonPost(`${server.url}/api/check-invalid`, { reportText: serializeFirmaReport(missing) });
  assert.equal(missingResponse.status, 400);
});
