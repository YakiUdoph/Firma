import assert from "node:assert/strict";
import test from "node:test";
import { classifyDiagnosticError } from "../src/diagnostics.mjs";
import { EvmRpcClient, ResponseTooLargeError, RpcError } from "../src/rpc.mjs";

function response(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchFn, { timeoutMs = 100, retries = 0 } = {}) {
  return new EvmRpcClient("https://approved.example.invalid", {
    timeoutMs,
    retries,
    fetchFn,
    delayFn: async () => {},
  });
}

test("successful and slow RPC responses are recorded as real observations", async () => {
  const immediate = client(async (_url, init) => {
    const request = JSON.parse(init.body);
    return response({ jsonrpc: "2.0", id: request.id, result: "0x1" });
  });
  assert.equal(await immediate.call("eth_chainId"), "0x1");
  assert.equal(immediate.history.length, 1);
  assert.equal(immediate.history[0].response.result, "0x1");

  const slow = client(async (_url, init) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const request = JSON.parse(init.body);
    return response({ jsonrpc: "2.0", id: request.id, result: "0x2" });
  }, { timeoutMs: 200 });
  assert.equal(await slow.call("eth_chainId"), "0x2");
  assert.equal(slow.history.length, 1);
});

test("timeouts and aborted requests remain failures and never invent responses", async () => {
  const timeoutClient = client((_url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }), { timeoutMs: 20 });
  await assert.rejects(timeoutClient.call("eth_chainId"), (error) => {
    assert.equal(classifyDiagnosticError(error), "timeout");
    return true;
  });
  assert.equal(timeoutClient.history.length, 1);
  assert.equal(Object.hasOwn(timeoutClient.history[0], "response"), false);

  const aborted = client(async () => { throw new DOMException("request aborted", "AbortError"); });
  await assert.rejects(aborted.call("eth_chainId"), (error) => {
    assert.equal(classifyDiagnosticError(error), "cancelled");
    return true;
  });
  assert.equal(Object.hasOwn(aborted.history[0], "response"), false);
});

test("connection, DNS, malformed, HTTP, and RPC method failures stay classified and bounded", async () => {
  for (const message of ["connect ECONNREFUSED 127.0.0.1", "getaddrinfo ENOTFOUND rpc.invalid"]) {
    const transport = client(async () => { throw new TypeError(message); });
    await assert.rejects(transport.call("eth_chainId"), (error) => {
      assert.equal(classifyDiagnosticError(error), "transport_error");
      return true;
    });
    assert.equal(transport.history.length, 1);
  }

  const malformed = client(async () => response("{"));
  await assert.rejects(malformed.call("eth_chainId"), (error) => {
    assert.equal(classifyDiagnosticError(error), "malformed_response");
    return true;
  });

  let httpAttempts = 0;
  const http = client(async () => {
    httpAttempts += 1;
    return response({ error: "temporarily unavailable" }, 503);
  }, { retries: 2 });
  await assert.rejects(http.call("eth_chainId"), (error) => {
    assert.equal(classifyDiagnosticError(error), "http_error");
    return true;
  });
  assert.equal(httpAttempts, 3);
  assert.equal(http.history.length, 3);

  let rpcAttempts = 0;
  const rpc = client(async (_url, init) => {
    rpcAttempts += 1;
    const request = JSON.parse(init.body);
    return response({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: "method failed" } });
  }, { retries: 2 });
  await assert.rejects(rpc.call("eth_chainId"), RpcError);
  assert.equal(rpcAttempts, 1);
  assert.equal(rpc.history.length, 1);
});

test("retry exhaustion records every attempt and simultaneous requests retain separate histories", async () => {
  let attempts = 0;
  const exhausted = client(async () => {
    attempts += 1;
    throw new TypeError("network unavailable");
  }, { retries: 2 });
  await assert.rejects(exhausted.call("eth_chainId"), TypeError);
  assert.equal(attempts, 3);
  assert.deepEqual(exhausted.history.map((entry) => entry.attempt), [0, 1, 2]);

  const concurrent = client(async (_url, init) => {
    const request = JSON.parse(init.body);
    await Promise.resolve();
    return response({ jsonrpc: "2.0", id: request.id, result: `result-${request.id}` });
  });
  const values = await Promise.all([
    concurrent.call("eth_chainId"),
    concurrent.call("web3_clientVersion"),
    concurrent.call("eth_getBlockByNumber", ["0x1", false]),
  ]);
  assert.deepEqual(values, ["result-1", "result-2", "result-3"]);
  assert.equal(concurrent.history.length, 3);
  assert.deepEqual(new Set(concurrent.history.map((entry) => entry.request.id)), new Set([1, 2, 3]));

  const concurrentFailures = client(async () => {
    await Promise.resolve();
    throw new TypeError("network unavailable");
  });
  const failures = await Promise.allSettled([
    concurrentFailures.call("eth_chainId"),
    concurrentFailures.call("web3_clientVersion"),
    concurrentFailures.call("eth_getBlockByNumber", ["0x1", false]),
  ]);
  assert.ok(failures.every((result) => result.status === "rejected"));
  assert.equal(concurrentFailures.history.length, 3);
  assert.deepEqual(new Set(concurrentFailures.history.map((entry) => entry.request.id)), new Set([1, 2, 3]));
});

test("JSON-RPC response bodies and envelopes are bounded before evidence is accepted", async () => {
  let oversizedCalls = 0;
  const oversized = new EvmRpcClient("https://approved.example.invalid", {
    timeoutMs: 100,
    retries: 2,
    maxResponseBytes: 64,
    delayFn: async () => {},
    fetchFn: async () => {
      oversizedCalls += 1;
      return response({ jsonrpc: "2.0", id: 1, result: "x".repeat(128) });
    },
  });
  await assert.rejects(oversized.call("eth_chainId"), ResponseTooLargeError);
  assert.equal(oversizedCalls, 1);
  assert.equal(oversized.history.length, 1);
  assert.equal(Object.hasOwn(oversized.history[0], "response"), false);
  assert.equal(classifyDiagnosticError(oversized.history[0].error), "response_too_large");

  for (const body of [
    { jsonrpc: "2.0", id: 99, result: "0x1" },
    { jsonrpc: "1.0", id: 1, result: "0x1" },
    { jsonrpc: "2.0", id: 1 },
    { jsonrpc: "2.0", id: 1, result: "0x1", error: { code: -1, message: "both" } },
    [],
  ]) {
    const malformed = client(async () => response(body));
    await assert.rejects(malformed.call("eth_chainId"), SyntaxError);
    assert.equal(Object.hasOwn(malformed.history.at(-1), "response"), true);
  }
});
