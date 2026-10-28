import assert from "node:assert/strict";
import test from "node:test";
import { closeSubstrateSession, openSubstrateSession } from "../src/verifier.mjs";

function fakes(readinessFactory) {
  const instances = { apis: [], providers: [] };
  class FakeProvider {
    constructor(endpoint, retryDelay) {
      this.endpoint = endpoint;
      this.retryDelay = retryDelay;
      this.disconnectCalls = 0;
      instances.providers.push(this);
    }

    async disconnect() {
      this.disconnectCalls += 1;
    }
  }

  class FakeApi {
    constructor({ provider }) {
      this.provider = provider;
      this.disconnectCalls = 0;
      this.isReadyOrError = readinessFactory(this);
      instances.apis.push(this);
    }

    async disconnect() {
      this.disconnectCalls += 1;
    }
  }
  return { instances, FakeApi, FakeProvider };
}

const options = { substrateEndpoint: "wss://approved.example.invalid", timeoutMs: 10 };

test("timed-out Substrate initialization disconnects the in-progress API and provider", async () => {
  const { instances, FakeApi, FakeProvider } = fakes(() => new Promise(() => {}));
  await assert.rejects(
    openSubstrateSession(options, { ApiPromiseClass: FakeApi, WsProviderClass: FakeProvider }),
    (error) => error?.name === "TimeoutError",
  );
  assert.equal(instances.apis.length, 1);
  assert.equal(instances.providers.length, 1);
  assert.equal(instances.apis[0].disconnectCalls, 1);
  assert.equal(instances.providers[0].disconnectCalls, 1);
});

test("successful and repeated Substrate sessions release every API and provider", async () => {
  const { instances, FakeApi, FakeProvider } = fakes((api) => Promise.resolve(api));
  for (let index = 0; index < 4; index += 1) {
    const session = await openSubstrateSession(options, { ApiPromiseClass: FakeApi, WsProviderClass: FakeProvider });
    await closeSubstrateSession(session);
  }
  assert.equal(instances.apis.length, 4);
  assert.equal(instances.providers.length, 4);
  assert.ok(instances.apis.every((api) => api.disconnectCalls === 1));
  assert.ok(instances.providers.every((provider) => provider.disconnectCalls === 1));
});

test("a readiness promise settling after the deadline cannot leave an owned connection", async () => {
  let resolveReadiness;
  const { instances, FakeApi, FakeProvider } = fakes((api) => new Promise((resolve) => {
    resolveReadiness = () => resolve(api);
  }));
  await assert.rejects(
    openSubstrateSession(options, { ApiPromiseClass: FakeApi, WsProviderClass: FakeProvider }),
    (error) => error?.name === "TimeoutError",
  );
  resolveReadiness();
  await Promise.resolve();
  assert.equal(instances.apis[0].disconnectCalls, 1);
  assert.equal(instances.providers[0].disconnectCalls, 1);
});
