import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, css, client] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

test("the working verifier is presented before the detailed method", () => {
  assert.ok(html.indexOf('id="verify-form"') > -1);
  assert.ok(html.indexOf('id="verify-form"') < html.indexOf('class="method"'));
  assert.match(html, /same token information agrees across Portaldot’s native and Ethereum-compatible interfaces/i);
});

test("advanced terminology is available without leading the main journey", () => {
  assert.match(html, /<details class="field-help">/);
  assert.match(html, /<details class="technical-details">/);
  assert.match(html, /The evidence retains the nine technical/);
});

test("human verdict labels retain the evidence status codes", () => {
  assert.match(client, /PASS: "Passed"/);
  assert.match(client, /FAIL: "Failed"/);
  assert.match(client, /UNKNOWN: "Couldn't verify"/);
  assert.match(client, /statusCode\.textContent = item\.status/);
});

test("responsive layouts avoid fixed narrow explanation columns", () => {
  assert.match(css, /\.method ol \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.method ol \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(css, /\.method li \{[^}]*grid-template-columns: 100px 1fr/s);
});
