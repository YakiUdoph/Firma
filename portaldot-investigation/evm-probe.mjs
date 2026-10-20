#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = process.argv[2] ?? "https://test-evm-rpc-v3.portaldot.dev";
const here = dirname(fileURLToPath(import.meta.url));
const requestFile = join(here, "requests", "evm-readonly-batch.json");
const payload = JSON.parse(await readFile(requestFile, "utf8"));
const observedAt = new Date().toISOString();
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),
});
const body = await response.json();
const evidence = {
  endpoint,
  observedAt,
  httpStatus: response.status,
  responseHeaders: Object.fromEntries(response.headers.entries()),
  request: payload,
  response: body,
};
await mkdir(join(here, "raw"), { recursive: true });
await writeFile(join(here, "raw", "evm-probe.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
