#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = process.argv[2] ?? "https://test-evm-rpc-v3.portaldot.dev";
const here = dirname(fileURLToPath(import.meta.url));

function assetAddress(index, prefix) {
  return `0x${index.toString(16).padStart(8, "0")}${"0".repeat(24)}${prefix.toString(16).padStart(4, "0")}0000`;
}

const candidates = [
  ...[1, 2, 806707].map((id) => ({ kind: "inline", id, address: assetAddress(id, 1) })),
  ...[
    { index: 0, assetId: 1 },
    { index: 1, assetId: 2 },
    { index: 2, assetId: 806707 },
  ].map(({ index, assetId }) => ({ kind: "mapped", index, assetId, address: assetAddress(index, 2) })),
];

const selectors = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
};

const knownBalances = [
  { assetId: 2, holder: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380", expectedNative: "15000000000000000000" },
  { assetId: 806707, holder: "0x6e285606e63c3359b58e6d106e92d92cd8f7a23a", expectedNative: "7" },
  { assetId: 806707, holder: "0x553d36d0af8dec5704849a87f8a79689511199f1", expectedNative: "2" },
  { assetId: 806707, holder: "0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec", expectedNative: "999997495" },
  { assetId: 806707, holder: "0x162c454a039b4c5c7c1d16868fa1a8d68568957b", expectedNative: "2503" },
];

let id = 1;
const index = new Map();
const payload = [];
for (const candidate of candidates) {
  for (const [method, data] of Object.entries(selectors)) {
    const requestId = id++;
    index.set(requestId, { ...candidate, method });
    payload.push({
      jsonrpc: "2.0",
      id: requestId,
      method: "eth_call",
      params: [{ to: candidate.address, data }, "latest"],
    });
  }
}
for (const check of knownBalances) {
  const requestId = id++;
  const address = assetAddress(check.assetId, 1);
  const data = `0x70a08231${check.holder.slice(2).padStart(64, "0")}`;
  index.set(requestId, { kind: "balance-parity", address, method: "balanceOf", ...check });
  payload.push({ jsonrpc: "2.0", id: requestId, method: "eth_call", params: [{ to: address, data }, "latest"] });
}
{
  const address = assetAddress(2, 1);
  const owner = knownBalances[0].holder.slice(2).padStart(64, "0");
  const zero = "0".repeat(64);
  const readCalls = [
    { method: "nonces", data: `0x7ecebe00${owner}` },
    { method: "DOMAIN_SEPARATOR", data: "0x3644e515" },
    { method: "allowance", data: `0xdd62ed3e${owner}${zero}` },
  ];
  for (const readCall of readCalls) {
    const requestId = id++;
    index.set(requestId, { kind: "permit-read", assetId: 2, address, method: readCall.method });
    payload.push({ jsonrpc: "2.0", id: requestId, method: "eth_call", params: [{ to: address, data: readCall.data }, "latest"] });
  }
}

const observedAt = new Date().toISOString();
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),
});
const rpcResponses = await response.json();
const results = rpcResponses.map((item) => ({ ...index.get(item.id), response: item }));
const evidence = {
  endpoint,
  observedAt,
  httpStatus: response.status,
  addressFormulaTested: "u32 index (big endian) || 12 zero bytes || u16 prefix || 2 zero bytes",
  caveat: "Prefixes 0x0001/0x0002 are hypotheses derived from the matching upstream kitchen-sink runtime layout; a successful ABI response confirms a candidate, but failures do not prove all asset precompiles are absent.",
  results,
};

await mkdir(join(here, "raw"), { recursive: true });
await writeFile(join(here, "raw", "evm-asset-probe.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
