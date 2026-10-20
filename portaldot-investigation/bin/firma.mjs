#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEFAULTS, STATUS, VERSION } from "../src/constants.mjs";
import { verify } from "../src/verifier.mjs";
import { InputError } from "../src/validation.mjs";

const HELP = `FIRMA ${VERSION} — read-only Portaldot V3 interoperability verifier

Usage: node bin/firma.mjs [options]

Options:
  --asset <u32>          Native asset ID (default: ${DEFAULTS.assetId})
  --account <H160>       EVM address to map and compare
  --substrate <wss-url>  Substrate WebSocket endpoint
  --evm <https-url>      EVM JSON-RPC endpoint
  --chain-id <integer>   Expected EVM chain ID (default: ${DEFAULTS.expectedChainId})
  --timeout <ms>         Per-operation timeout, 1000–60000
  --retries <0..2>       Bounded transport retries (default: ${DEFAULTS.retries})
  --output <file>        Save the complete JSON evidence report
  --json                 Print JSON instead of the human summary
  --help                 Show this help

Exit codes: 0 PASS, 1 FAIL, 2 UNKNOWN, 64 invalid input, 70 internal error.
FIRMA never signs, submits, deploys, or calls a write RPC method.`;

function parseArgs(args) {
  const options = { ...DEFAULTS };
  let json = false;
  let output;
  const names = {
    "--asset": "assetId", "--account": "account", "--substrate": "substrateEndpoint",
    "--evm": "evmEndpoint", "--chain-id": "expectedChainId", "--timeout": "timeoutMs", "--retries": "retries",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") return { help: true };
    if (arg === "--json") { json = true; continue; }
    if (arg === "--output") {
      if (!args[index + 1]) throw new InputError("--output requires a file path.");
      output = args[++index];
      continue;
    }
    const key = names[arg];
    if (!key) throw new InputError(`Unknown option: ${arg}`);
    if (!args[index + 1]) throw new InputError(`${arg} requires a value.`);
    options[key] = args[++index];
  }
  return { options, json, output };
}

function printHuman(report) {
  const icon = { PASS: "✓", FAIL: "✗", UNKNOWN: "?" };
  console.log(`FIRMA ${report.tool.version}  ${report.verdict.overall}`);
  console.log(`Asset ${report.input.assetId} · ${report.input.account}`);
  console.log(`Pinned block: ${report.evidence.substrate.finalized?.number ?? "unavailable"}`);
  console.log("");
  for (const item of report.verdict.checks) console.log(`${icon[item.status]} ${item.status.padEnd(7)} ${item.title}: ${item.summary}`);
  console.log("");
  console.log("Read-only: no transaction was created, signed, simulated as a write, or submitted.");
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(HELP);
    process.exitCode = 0;
  } else {
    const report = await verify(parsed.options);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (parsed.output) {
      const target = resolve(parsed.output);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, serialized, { encoding: "utf8", flag: "wx" });
      if (!parsed.json) console.log(`Evidence saved to ${target}`);
    }
    if (parsed.json) process.stdout.write(serialized); else printHuman(report);
    process.exitCode = report.verdict.overall === STATUS.PASS ? 0 : report.verdict.overall === STATUS.FAIL ? 1 : 2;
  }
} catch (error) {
  if (error instanceof InputError) {
    console.error(`Input error: ${error.message}\nRun with --help for usage.`);
    process.exitCode = 64;
  } else if (error?.code === "EEXIST") {
    console.error("Output file already exists; FIRMA will not overwrite evidence.");
    process.exitCode = 64;
  } else {
    console.error(`Internal error: ${error?.message ?? error}`);
    process.exitCode = 70;
  }
}

