import assert from "node:assert/strict";
import test from "node:test";
import { createOnchainProofHandler } from "../api/onchain-proof.mjs";
import { validImportedReport } from "../test-support/report-fixtures.mjs";

const reportText = JSON.stringify(validImportedReport());
const hash = `0x${"11".repeat(32)}`;

function request(body, headers = {}) {
  return new Request("https://firma.example/api/onchain-proof", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.70", ...headers },
  });
}

test("proof API prepares validated reports without signing or mutating them", async () => {
  let received;
  const handler = createOnchainProofHandler({ prepareFn: (report, account) => { received = { report, account }; return { commitment: "0xprepared" }; } });
  const account = "0x2000000000000000000000000000000000000002";
  const response = await handler.fetch(request(JSON.stringify({ action: "prepare", reportText, account })));
  assert.equal(response.status, 200);
  assert.equal(received.account, account);
  assert.equal(received.report.schema, "firma.report.v1");
});

test("proof API prepares and verifies versioned native SubWallet evidence separately", async () => {
  const account = "5En7dwvXVjsHA8AEjWwdLNFf1TnxiiRSE3VUXiX7S9Pr4QUz";
  let preparedAccount;
  let verifiedEvidence;
  const handler = createOnchainProofHandler({
    prepareNativeFn: (_report, value) => { preparedAccount = value; return { schema: "firma.anchor-preparation.native.v1" }; },
    verifyNativeFn: async ({ claimedEvidence }) => { verifiedEvidence = claimedEvidence; return { overall: "VERIFIED" }; },
  });
  const prepared = await handler.fetch(request(JSON.stringify({ action: "prepare-native", reportText, account }), { "x-forwarded-for": "198.51.100.74" }));
  assert.equal(prepared.status, 200);
  assert.equal(preparedAccount, account);

  const evidence = { schema: "firma.anchor.native.v1", transactionHash: hash };
  const verified = await handler.fetch(request(JSON.stringify({ action: "verify", reportText, anchorEvidenceText: JSON.stringify(evidence) }), { "x-forwarded-for": "198.51.100.75" }));
  assert.equal(verified.status, 200);
  assert.deepEqual(verifiedEvidence, evidence);
});

test("proof API accepts either a hash or evidence and passes claimed evidence to verification", async () => {
  const received = [];
  const handler = createOnchainProofHandler({ verifyFn: async (input) => { received.push(input); return { overall: "VERIFIED" }; } });
  const direct = await handler.fetch(request(JSON.stringify({ action: "verify", reportText, transactionHash: hash })));
  assert.equal(direct.status, 200);
  assert.equal(received[0].transactionHash, hash);
  assert.equal(received[0].claimedEvidence, null);

  const evidence = { schema: "firma.anchor.v1", transactionHash: hash, commitment: `0x${"22".repeat(32)}` };
  const fromFile = await handler.fetch(request(JSON.stringify({ action: "verify", reportText, anchorEvidenceText: JSON.stringify(evidence) }), { "x-forwarded-for": "198.51.100.71" }));
  assert.equal(fromFile.status, 200);
  assert.deepEqual(received[1].claimedEvidence, evidence);
});

test("proof API rejects invalid, oversized, timed-out, and unsupported requests safely", async () => {
  const handler = createOnchainProofHandler();
  assert.equal((await handler.fetch(new Request("https://firma.example/api/onchain-proof"))).status, 405);
  assert.equal((await handler.fetch(request("{}", { "content-type": "text/plain" }))).status, 415);
  assert.equal((await handler.fetch(request(JSON.stringify({ action: "verify", reportText, transactionHash: "bad" })))).status, 400);
  assert.equal((await createOnchainProofHandler().fetch(request("{}", { "content-length": "1048577", "x-forwarded-for": "198.51.100.72" }))).status, 413);

  const timeout = createOnchainProofHandler({ verifyTimeoutMs: 5, verifyFn: async () => new Promise(() => {}) });
  const timedOut = await timeout.fetch(request(JSON.stringify({ action: "verify", reportText, transactionHash: hash }), { "x-forwarded-for": "198.51.100.73" }));
  assert.equal(timedOut.status, 504);
});

test("proof API bounds duplicate verification requests from one client", async () => {
  const handler = createOnchainProofHandler({ verifyFn: async () => ({ overall: "VERIFIED" }) });
  const body = JSON.stringify({ action: "verify", reportText, transactionHash: hash });
  for (let index = 0; index < 6; index += 1) {
    const response = await handler.fetch(request(body, { "x-forwarded-for": "198.51.100.76" }));
    assert.equal(response.status, 200);
  }
  const duplicate = await handler.fetch(request(body, { "x-forwarded-for": "198.51.100.76" }));
  assert.equal(duplicate.status, 429);
  assert.ok(Number(duplicate.headers.get("retry-after")) >= 1);
});
