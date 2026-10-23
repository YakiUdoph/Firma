import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productionEntries = [
  new URL("../api/verify.mjs", import.meta.url),
  new URL("../api/check-report.mjs", import.meta.url),
  new URL("../server.mjs", import.meta.url),
  new URL("../public/app.js", import.meta.url),
];

test("production routes cannot reach experimental signing, broadcasting, or deployment code", async () => {
  const sources = (await Promise.all(productionEntries.map((url) => readFile(url, "utf8")))).join("\n");
  for (const forbidden of [
    "proof-transaction.mjs",
    "submitReportCommitment",
    "sendTransaction",
    "eth_sendTransaction",
    "eth_sendRawTransaction",
    "build-contract.mjs",
    "estimate-deployment.mjs",
  ]) {
    assert.doesNotMatch(sources, new RegExp(forbidden.replaceAll(".", "\\.")));
  }

  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(vercel.functions).sort(), ["api/check-report.mjs", "api/verify.mjs"]);
});
