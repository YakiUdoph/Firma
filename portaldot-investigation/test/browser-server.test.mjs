import assert from "node:assert/strict";
import test from "node:test";
import { browserStartupTimeout, startManagedHttpServer } from "../test-support/browser-server.mjs";

test("browser server readiness waits for a delayed successful HTTP response", async () => {
  const script = `
    const http = require("node:http");
    setTimeout(() => {
      http.createServer((_request, response) => response.end("ready"))
        .listen(Number(process.env.PORT), "127.0.0.1", () => console.log("delayed server ready"));
    }, 400);
  `;
  const server = await startManagedHttpServer({ args: ["-e", script], timeoutMs: 2_000 });
  try {
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ready");
  } finally {
    await server.stop();
  }
});

test("browser server readiness times out with diagnostics and cleans up", async () => {
  const script = `console.error("intentionally never ready"); setInterval(() => {}, 1_000);`;
  await assert.rejects(
    startManagedHttpServer({ args: ["-e", script], timeoutMs: 300, pollIntervalMs: 25 }),
    (error) => {
      assert.match(error.message, /did not become ready within 300ms/);
      assert.match(error.message, /intentionally never ready/);
      assert.match(error.message, /Last readiness result:/);
      return true;
    },
  );
});

test("browser server readiness reports an early child exit", async () => {
  const script = `console.log("startup began"); console.error("startup failed"); process.exit(7);`;
  await assert.rejects(
    startManagedHttpServer({ args: ["-e", script], timeoutMs: 2_000 }),
    (error) => {
      assert.match(error.message, /exited before it became ready/);
      assert.match(error.message, /exit code 7/);
      assert.match(error.message, /startup began/);
      assert.match(error.message, /startup failed/);
      return true;
    },
  );
});

test("browser startup timeout is configurable but capped at 15 seconds", () => {
  assert.equal(browserStartupTimeout(), 15_000);
  assert.equal(browserStartupTimeout("2500"), 2_500);
  assert.equal(browserStartupTimeout("60000"), 15_000);
  assert.throws(() => browserStartupTimeout("invalid"), /positive integer/);
});
