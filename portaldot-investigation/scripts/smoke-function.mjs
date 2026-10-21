import handler from "../api/verify.mjs";
import { DEFAULTS } from "../src/constants.mjs";

const request = new Request("https://firma.example/api/verify", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
  body: JSON.stringify({ assetId: DEFAULTS.assetId, account: DEFAULTS.account }),
});
const response = await handler.fetch(request);
const body = await response.json();

console.log(JSON.stringify({ httpStatus: response.status, verdict: body.verdict?.overall, block: body.evidence?.substrate?.finalized?.number, requestId: body.requestId }, null, 2));
if (response.status !== 200 || body.verdict?.overall !== "PASS") process.exitCode = 1;
