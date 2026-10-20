#!/usr/bin/env node

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const endpoint = process.argv[2] ?? "wss://test-node-v3.portaldot.dev";
const here = dirname(fileURLToPath(import.meta.url));
const rawDir = join(here, "raw");
const timeoutMs = 20_000;

const requests = [
  ["system_chain", []],
  ["system_name", []],
  ["system_version", []],
  ["system_properties", []],
  ["state_getRuntimeVersion", []],
  ["chain_getHeader", []],
  ["chain_getFinalizedHead", []],
  ["rpc_methods", []],
  ["state_getMetadata", []],
];

const ws = new WebSocket(endpoint);
const pending = new Map();
let nextId = 1;

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method}: timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    pending.set(id, { method, resolve, reject, timer });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

ws.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(message.id);
  if (message.error) item.reject(new Error(`${item.method}: ${JSON.stringify(message.error)}`));
  else item.resolve(message.result);
});

ws.addEventListener("open", async () => {
  const observedAt = new Date().toISOString();
  const results = { endpoint, observedAt, responses: {} };
  try {
    for (const [method, params] of requests) {
      try {
        results.responses[method] = { result: await rpc(method, params) };
      } catch (error) {
        results.responses[method] = { error: String(error.message ?? error) };
      }
    }
    await mkdir(rawDir, { recursive: true });
    const metadata = results.responses.state_getMetadata?.result;
    if (typeof metadata === "string") {
      await writeFile(join(rawDir, "substrate-metadata.hex"), `${metadata}\n`, "utf8");
      results.responses.state_getMetadata = {
        result: `<saved to raw/substrate-metadata.hex; ${metadata.length} characters; prefix ${metadata.slice(0, 34)}>`,
      };
    }
    await writeFile(join(rawDir, "substrate-probe.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    ws.close();
  }
});

ws.addEventListener("error", (event) => {
  console.error(`WebSocket error while connecting to ${endpoint}`, event.error ?? "");
  process.exitCode = 1;
});

const overallTimer = setTimeout(() => {
  if (ws.readyState !== WebSocket.CLOSED) {
    console.error(`Probe exceeded ${timeoutMs * requests.length} ms overall`);
    ws.close();
    process.exitCode = 1;
  }
}, timeoutMs * requests.length);

ws.addEventListener("close", () => clearTimeout(overallTimer));
