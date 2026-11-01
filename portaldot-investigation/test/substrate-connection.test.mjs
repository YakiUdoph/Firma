import assert from "node:assert/strict";
import test from "node:test";
import { connectSubstrateApi } from "../src/verifier.mjs";

function fakeProvider() {
  const listeners = new Map();
  return {
    connectCalls: 0,
    disconnectCalls: 0,
    async connect() { this.connectCalls += 1; },
    async disconnect() { this.disconnectCalls += 1; },
    emit(type, value) { listeners.get(type)?.(value); },
    on(type, listener) {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
  };
}

function options(retries) {
  return {
    substrateEndpoint: "wss://approved.example.invalid",
    timeoutMs: 1_000,
    retries,
  };
}

test("Substrate initialization retries are bounded and clean up failed providers", async () => {
  const providers = [fakeProvider(), fakeProvider()];
  const delays = [];
  let created = 0;
  const api = { disconnect: async () => {} };

  const connected = await connectSubstrateApi(options(1), {
    providerFactory: () => providers[created++],
    apiCreate: async (provider) => {
      if (provider === providers[0]) {
        provider.emit("disconnected");
        throw new Error("");
      }
      return api;
    },
    delayFn: async (milliseconds) => { delays.push(milliseconds); },
  });

  assert.equal(created, 2);
  assert.deepEqual(delays, [250]);
  assert.equal(providers[0].disconnectCalls, 1);
  assert.equal(providers[1].disconnectCalls, 0);
  assert.equal(connected.provider, providers[1]);
  assert.equal(connected.api, api);
});

test("Substrate initialization exhaustion remains an explicit connection failure", async () => {
  const providers = [fakeProvider(), fakeProvider(), fakeProvider()];
  const delays = [];
  let created = 0;

  await assert.rejects(connectSubstrateApi(options(2), {
    providerFactory: () => providers[created++],
    apiCreate: async (provider) => {
      provider.emit("disconnected");
      throw new Error("");
    },
    delayFn: async (milliseconds) => { delays.push(milliseconds); },
  }), (error) => {
    assert.equal(error.name, "ConnectionError");
    assert.equal(error.message, "Substrate WebSocket disconnected during initialization.");
    return true;
  });

  assert.equal(created, 3);
  assert.deepEqual(delays, [250, 500]);
  assert.deepEqual(providers.map((provider) => provider.disconnectCalls), [1, 1, 1]);
});
