import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/verify.mjs";

function request(method, body, ip = "198.51.100.1", headers = {}) {
  return new Request("https://firma.example/api/verify", {
    method,
    body,
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
  });
}

test("production handler rejects non-POST methods", async () => {
  const response = await handler.fetch(request("GET"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("production handler rejects malformed input before network access", async () => {
  const response = await handler.fetch(request("POST", JSON.stringify({ assetId: "-1", account: "nope" }), "198.51.100.2"));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /unsigned base-10/);
  assert.ok(body.requestId);
});

test("production handler classifies non-object JSON as invalid input", async () => {
  const response = await handler.fetch(request("POST", "null", "198.51.100.5"));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /JSON object/);
});

test("production handler rejects oversized bodies", async () => {
  const response = await handler.fetch(request("POST", "{}", "198.51.100.3", { "content-length": "9000" }));
  assert.equal(response.status, 413);
});

test("production handler applies a per-instance request limit", async () => {
  const ip = "198.51.100.4";
  for (let index = 0; index < 5; index += 1) {
    const response = await handler.fetch(request("POST", "{", ip));
    assert.equal(response.status, 400);
  }
  const limited = await handler.fetch(request("POST", "{", ip));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
});

