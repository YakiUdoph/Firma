import { assertValidFirmaReport, InvalidReportError } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { READ_ONLY_EVM_METHODS } from "./constants.mjs";
import { parseAccount, parseAssetId, parseExpectedChainId } from "./validation.mjs";

export const MAX_REPORT_BYTES = 262_144;
const HASH_32 = /^0x[0-9a-f]{64}$/;
const COMMITMENT = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HASH_20 = /^0x[0-9a-f]{40}$/;
const HASH_32_BARE = /^[0-9a-f]{64}$/;
const HEX = /^0x(?:[0-9a-f]{2})*$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const REQUIRED_CHECKS = Object.freeze([
  "network.substrate",
  "network.evm",
  "identity.chainId",
  "runtime.support",
  "context.block",
  "asset.supply",
  "account.mapping",
  "asset.balance",
  "asset.metadata",
]);

function invalid(message) {
  throw new InvalidReportError(message);
}

function assertAllowedKeys(value, path, allowed) {
  for (const key of Object.keys(objectAt(value, path))) {
    if (!allowed.includes(key)) invalid(`${path}.${key} is not allowed by this report schema.`);
  }
}

function objectAt(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${path} must be an object.`);
  return value;
}

function stringAt(value, path, pattern = null) {
  if (typeof value !== "string" || (pattern && !pattern.test(value))) invalid(`${path} is invalid.`);
  return value;
}

function booleanAt(value, path) {
  if (typeof value !== "boolean") invalid(`${path} must be true or false.`);
  return value;
}

function inspectStructure(value, path = "report", depth = 0, state = { nodes: 0 }) {
  state.nodes += 1;
  if (depth > 40 || state.nodes > 50_000) invalid("Report structure exceeds safe complexity limits.");
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) invalid(`${path} contains a disallowed property name.`);
    inspectStructure(entry, `${path}.${key}`, depth + 1, state);
  }
}

function assertNoDuplicateObjectKeys(text) {
  let index = 0;
  let nodes = 0;

  const whitespace = () => {
    while (/\s/.test(text[index] ?? "")) index += 1;
  };
  const parseString = () => {
    const start = index;
    if (text[index] !== '"') invalid("Uploaded report is not valid JSON.");
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); } catch { invalid("Uploaded report is not valid JSON."); }
      }
      if (character === "\\") {
        index += 1;
        const escape = text[index];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) invalid("Uploaded report is not valid JSON.");
          index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape ?? "")) invalid("Uploaded report is not valid JSON.");
      } else if (character.charCodeAt(0) < 0x20) invalid("Uploaded report is not valid JSON.");
      index += 1;
    }
    invalid("Uploaded report is not valid JSON.");
  };
  const parseValue = (depth = 0) => {
    nodes += 1;
    if (depth > 40 || nodes > 50_000) invalid("Report structure exceeds safe complexity limits.");
    whitespace();
    if (text[index] === '"') return void parseString();
    if (text[index] === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] === "}") { index += 1; return; }
      while (index < text.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) invalid(`Uploaded report contains duplicate object key ${JSON.stringify(key)}.`);
        keys.add(key);
        whitespace();
        if (text[index] !== ":") invalid("Uploaded report is not valid JSON.");
        index += 1;
        parseValue(depth + 1);
        whitespace();
        if (text[index] === "}") { index += 1; return; }
        if (text[index] !== ",") invalid("Uploaded report is not valid JSON.");
        index += 1;
      }
      invalid("Uploaded report is not valid JSON.");
    }
    if (text[index] === "[") {
      index += 1;
      whitespace();
      if (text[index] === "]") { index += 1; return; }
      while (index < text.length) {
        parseValue(depth + 1);
        whitespace();
        if (text[index] === "]") { index += 1; return; }
        if (text[index] !== ",") invalid("Uploaded report is not valid JSON.");
        index += 1;
      }
      invalid("Uploaded report is not valid JSON.");
    }
    const remainder = text.slice(index);
    const token = remainder.match(/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/)?.[0];
    if (!token) invalid("Uploaded report is not valid JSON.");
    index += token.length;
  };

  whitespace();
  parseValue();
  whitespace();
  if (index !== text.length) invalid("Uploaded report is not valid JSON.");
}

function validateClaimShape(report) {
  assertAllowedKeys(report, "report", ["schema", "tool", "startedAt", "completedAt", "input", "verdict", "evidence", "limitations"]);
  assertAllowedKeys(report.tool, "report.tool", ["name", "version", "mode", "allowedEvmMethods"]);
  assertAllowedKeys(report.input, "report.input", ["expectedChainId", "assetId", "account"]);
  assertAllowedKeys(report.verdict, "report.verdict", ["overall", "counts", "checks"]);
  assertAllowedKeys(report.evidence, "report.evidence", ["input", "substrate", "evm"]);
  if (report.tool.name !== "FIRMA") invalid("Report tool name must be FIRMA.");
  stringAt(report.tool.version, "report.tool.version");
  if (!Array.isArray(report.tool.allowedEvmMethods) || report.tool.allowedEvmMethods.some((method) => typeof method !== "string")) {
    invalid("report.tool.allowedEvmMethods must be an array of method names.");
  }
  if (report.tool.allowedEvmMethods.length !== READ_ONLY_EVM_METHODS.length
    || READ_ONLY_EVM_METHODS.some((method) => !report.tool.allowedEvmMethods.includes(method))) {
    invalid("Report EVM methods do not match FIRMA's read-only method set.");
  }
  stringAt(report.startedAt, "report.startedAt", ISO_DATE);
  stringAt(report.completedAt, "report.completedAt", ISO_DATE);
  if (Number.isNaN(Date.parse(report.startedAt)) || Number.isNaN(Date.parse(report.completedAt))) invalid("Report timestamps are invalid.");
  if (Date.parse(report.completedAt) < Date.parse(report.startedAt)) invalid("Report completion time precedes its start time.");

  parseExpectedChainId(report.input.expectedChainId);
  parseAssetId(report.input.assetId);
  parseAccount(report.input.account);

  const checks = report.verdict.checks;
  for (const [index, check] of checks.entries()) {
    assertAllowedKeys(check, `report.verdict.checks[${index}]`, ["id", "title", "status", "summary", "evidence"]);
    stringAt(check.title, `report.verdict.checks[${index}].title`);
    stringAt(check.summary, `report.verdict.checks[${index}].summary`);
    objectAt(check.evidence, `report.verdict.checks[${index}].evidence`);
  }
  const ids = checks.map((check, index) => stringAt(check.id, `report.verdict.checks[${index}].id`));
  if (new Set(ids).size !== ids.length) invalid("Report check identifiers must be unique.");
  for (const id of REQUIRED_CHECKS) if (!ids.includes(id)) invalid(`Report is missing required check ${id}.`);
  const counts = objectAt(report.verdict.counts, "report.verdict.counts");
  for (const status of ["PASS", "FAIL", "UNKNOWN"]) {
    if (!Number.isSafeInteger(counts[status]) || counts[status] < 0) invalid(`report.verdict.counts.${status} is invalid.`);
    if (counts[status] !== checks.filter((check) => check.status === status).length) invalid(`report.verdict.counts.${status} does not match the checks.`);
  }
  const expectedOverall = counts.FAIL > 0 ? "FAIL" : counts.UNKNOWN > 0 ? "UNKNOWN" : "PASS";
  if (report.verdict.overall !== expectedOverall) invalid("report.verdict.overall does not match the check statuses.");

  const substrate = objectAt(report.evidence.substrate, "report.evidence.substrate");
  assertAllowedKeys(substrate, "report.evidence.substrate", ["reachable", "endpoint", "identity", "finalized", "latestFinalized", "runtime", "asset", "accountMapping", "balance"]);
  if (substrate.reachable !== true) invalid("Imported report must contain reachable Substrate evidence.");
  stringAt(substrate.endpoint, "report.evidence.substrate.endpoint");
  const finalized = objectAt(substrate.finalized, "report.evidence.substrate.finalized");
  assertAllowedKeys(finalized, "report.evidence.substrate.finalized", ["number", "hash"]);
  stringAt(finalized.number, "report.evidence.substrate.finalized.number", DECIMAL);
  stringAt(finalized.hash, "report.evidence.substrate.finalized.hash", HASH_32);
  const latestFinalized = objectAt(substrate.latestFinalized, "report.evidence.substrate.latestFinalized");
  assertAllowedKeys(latestFinalized, "report.evidence.substrate.latestFinalized", ["number", "hash"]);
  if (latestFinalized.number !== finalized.number || latestFinalized.hash !== finalized.hash) {
    invalid("The original report's selected block must match its finalized head.");
  }
  const identity = objectAt(substrate.identity, "report.evidence.substrate.identity");
  assertAllowedKeys(identity, "report.evidence.substrate.identity", ["chain", "nodeName", "nodeVersion", "properties"]);
  stringAt(identity.chain, "report.evidence.substrate.identity.chain");
  stringAt(identity.nodeName, "report.evidence.substrate.identity.nodeName");
  stringAt(identity.nodeVersion, "report.evidence.substrate.identity.nodeVersion");
  objectAt(identity.properties, "report.evidence.substrate.identity.properties");
  const runtime = objectAt(substrate.runtime, "report.evidence.substrate.runtime");
  assertAllowedKeys(runtime, "report.evidence.substrate.runtime", ["specName", "specVersion", "transactionVersion", "metadataVersion", "metadataSha256", "pallets", "querySurfaces", "fingerprint"]);
  for (const field of ["specName", "specVersion", "transactionVersion"]) stringAt(runtime[field], `report.evidence.substrate.runtime.${field}`);
  if (!Number.isSafeInteger(runtime.metadataVersion) || runtime.metadataVersion < 0) invalid("Runtime metadata version is invalid.");
  stringAt(runtime.metadataSha256, "report.evidence.substrate.runtime.metadataSha256", HASH_32_BARE);
  if (!Array.isArray(runtime.pallets) || runtime.pallets.some((pallet) => typeof pallet !== "string")) invalid("Runtime pallets are invalid.");
  const querySurfaces = objectAt(runtime.querySurfaces, "report.evidence.substrate.runtime.querySurfaces");
  assertAllowedKeys(querySurfaces, "report.evidence.substrate.runtime.querySurfaces", ["assets.asset", "assets.metadata", "assets.account", "revive.originalAccount"]);
  for (const available of Object.values(querySurfaces)) booleanAt(available, "report.evidence.substrate.runtime.querySurfaces entry");
  const fingerprint = objectAt(runtime.fingerprint, "report.evidence.substrate.runtime.fingerprint");
  assertAllowedKeys(fingerprint, "report.evidence.substrate.runtime.fingerprint", ["genesisHash", "runtimeCodeHash", "runtimeCodeHashAlgorithm", "runtimeCodeStorageKey", "collectedAtBlockHash"]);
  stringAt(fingerprint.genesisHash, "report.evidence.substrate.runtime.fingerprint.genesisHash", HASH_32);
  stringAt(fingerprint.runtimeCodeHash, "report.evidence.substrate.runtime.fingerprint.runtimeCodeHash", HASH_32);
  stringAt(fingerprint.runtimeCodeHashAlgorithm, "report.evidence.substrate.runtime.fingerprint.runtimeCodeHashAlgorithm");
  stringAt(fingerprint.runtimeCodeStorageKey, "report.evidence.substrate.runtime.fingerprint.runtimeCodeStorageKey", HEX);
  stringAt(fingerprint.collectedAtBlockHash, "report.evidence.substrate.runtime.fingerprint.collectedAtBlockHash", HASH_32);

  const asset = objectAt(substrate.asset, "report.evidence.substrate.asset");
  assertAllowedKeys(asset, "report.evidence.substrate.asset", ["exists", "id", "storageKey", "supply", "metadata"]);
  booleanAt(asset.exists, "report.evidence.substrate.asset.exists");
  if (String(asset.id) !== report.input.assetId) invalid("Native asset ID does not match report input.");
  stringAt(asset.storageKey, "report.evidence.substrate.asset.storageKey", HEX);
  if (asset.exists) {
    stringAt(asset.supply, "report.evidence.substrate.asset.supply", DECIMAL);
  } else if (asset.supply !== null) invalid("A missing native asset must have a null supply.");
  const metadata = objectAt(asset.metadata, "report.evidence.substrate.asset.metadata");
  assertAllowedKeys(metadata, "report.evidence.substrate.asset.metadata", ["exists", "storageKey", "name", "symbol", "decimals"]);
  booleanAt(metadata.exists, "report.evidence.substrate.asset.metadata.exists");
  stringAt(metadata.storageKey, "report.evidence.substrate.asset.metadata.storageKey", HEX);
  for (const field of ["name", "symbol", "decimals"]) {
    if (metadata.exists) stringAt(metadata[field], `report.evidence.substrate.asset.metadata.${field}`);
    else if (metadata[field] !== null) invalid(`Missing metadata ${field} must be null.`);
  }
  const mapping = objectAt(substrate.accountMapping, "report.evidence.substrate.accountMapping");
  assertAllowedKeys(mapping, "report.evidence.substrate.accountMapping", ["exists", "h160", "accountId", "storageKey"]);
  booleanAt(mapping.exists, "report.evidence.substrate.accountMapping.exists");
  if (mapping.h160 !== report.input.account) invalid("Mapped EVM address does not match report input.");
  stringAt(mapping.storageKey, "report.evidence.substrate.accountMapping.storageKey", HEX);
  if (mapping.exists) stringAt(mapping.accountId, "report.evidence.substrate.accountMapping.accountId");
  else if (mapping.accountId !== null) invalid("A missing account mapping must have a null AccountId.");
  const balance = objectAt(substrate.balance, "report.evidence.substrate.balance");
  assertAllowedKeys(balance, "report.evidence.substrate.balance", ["exists", "value", "storageKey"]);
  booleanAt(balance.exists, "report.evidence.substrate.balance.exists");
  if (balance.storageKey !== null) stringAt(balance.storageKey, "report.evidence.substrate.balance.storageKey", HEX);
  if (balance.exists) stringAt(balance.value, "report.evidence.substrate.balance.value", DECIMAL);
  else if (balance.value !== null && balance.value !== "0") invalid("A missing balance must be null or zero.");

  const evm = objectAt(report.evidence.evm, "report.evidence.evm");
  assertAllowedKeys(evm, "report.evidence.evm", ["reachable", "endpoint", "identity", "block", "calls", "requests", "precompileAddress"]);
  if (evm.reachable !== true) invalid("Imported report must contain reachable EVM evidence.");
  stringAt(evm.endpoint, "report.evidence.evm.endpoint");
  const evmIdentity = objectAt(evm.identity, "report.evidence.evm.identity");
  assertAllowedKeys(evmIdentity, "report.evidence.evm.identity", ["chainId", "chainIdHex", "clientVersion"]);
  stringAt(evm.identity?.chainId, "report.evidence.evm.identity.chainId", DECIMAL);
  stringAt(evmIdentity.chainIdHex, "report.evidence.evm.identity.chainIdHex", HEX_QUANTITY);
  stringAt(evmIdentity.clientVersion, "report.evidence.evm.identity.clientVersion");
  const block = objectAt(evm.block, "report.evidence.evm.block");
  assertAllowedKeys(block, "report.evidence.evm.block", ["number", "hash", "requestedTag", "available"]);
  booleanAt(block.available, "report.evidence.evm.block.available");
  if (!block.available) invalid("Imported report does not contain an available historical EVM block.");
  stringAt(block.number, "report.evidence.evm.block.number", DECIMAL);
  stringAt(block.hash, "report.evidence.evm.block.hash", HASH_32);
  stringAt(block.requestedTag, "report.evidence.evm.block.requestedTag", HEX_QUANTITY);
  stringAt(evm.precompileAddress, "report.evidence.evm.precompileAddress", HASH_20);
  const calls = objectAt(evm.calls, "report.evidence.evm.calls");
  assertAllowedKeys(calls, "report.evidence.evm.calls", ["totalSupply", "balanceOf", "name", "symbol", "decimals"]);
  for (const field of ["totalSupply", "balanceOf", "name", "symbol", "decimals"]) {
    const call = objectAt(calls[field], `report.evidence.evm.calls.${field}`);
    assertAllowedKeys(call, `report.evidence.evm.calls.${field}`, ["ok", "value", "raw", "kind", "error", "rpcError"]);
    booleanAt(call.ok, `report.evidence.evm.calls.${field}.ok`);
    if (call.ok) {
      stringAt(call.value, `report.evidence.evm.calls.${field}.value`);
      stringAt(call.raw, `report.evidence.evm.calls.${field}.raw`, HEX);
    }
    else stringAt(call.kind, `report.evidence.evm.calls.${field}.kind`);
  }
  if (!Array.isArray(evm.requests)) invalid("report.evidence.evm.requests must be an array.");
  if (block.number !== finalized.number) invalid("Imported native and EVM block numbers differ.");
  if (fingerprint.collectedAtBlockHash !== finalized.hash) invalid("Runtime fingerprint is not tied to the imported finalized block.");

  const evidenceInput = objectAt(report.evidence.input, "report.evidence.input");
  assertAllowedKeys(evidenceInput, "report.evidence.input", ["substrateEndpoint", "evmEndpoint", "expectedChainId", "assetId", "account", "timeoutMs", "retries"]);
  stringAt(evidenceInput.substrateEndpoint, "report.evidence.input.substrateEndpoint");
  stringAt(evidenceInput.evmEndpoint, "report.evidence.input.evmEndpoint");
  if (!Number.isSafeInteger(evidenceInput.timeoutMs) || !Number.isSafeInteger(evidenceInput.retries)) invalid("Evidence timeout or retry configuration is invalid.");
  for (const field of ["expectedChainId", "assetId", "account"]) {
    if (evidenceInput[field] !== report.input[field]) invalid(`Evidence input ${field} does not match report input.`);
  }
  if (!Array.isArray(report.limitations) || report.limitations.some((item) => typeof item !== "string")) {
    invalid("report.limitations must be an array of strings.");
  }
}

export function parseImportedReport(value) {
  inspectStructure(value);
  assertValidFirmaReport(value);
  validateClaimShape(value);
  return value;
}

export function parseImportedReportText(text) {
  if (typeof text !== "string") invalid("Uploaded report must be UTF-8 JSON text.");
  if (Buffer.byteLength(text, "utf8") > MAX_REPORT_BYTES) invalid("Uploaded report exceeds 256 KiB.");
  const normalized = text.replace(/^\uFEFF/, "");
  assertNoDuplicateObjectKeys(normalized);
  let value;
  try {
    value = JSON.parse(normalized);
  } catch {
    invalid("Uploaded report is not valid JSON.");
  }
  return parseImportedReport(value);
}

export function parseExpectedCommitment(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).toLowerCase();
  if (!COMMITMENT.test(normalized)) invalid("Expected commitment must be a 32-byte 0x-prefixed hash.");
  return normalized;
}
