import { isDeepStrictEqual } from "node:util";
import { assertValidFirmaReport, InvalidReportError } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { assetPrecompileAddress, decodeAbiString, decodeUint256, encodeBalanceOf, numberToHex } from "./codec.mjs";
import { EVM_ASSET_SELECTORS, READ_ONLY_EVM_METHODS } from "./constants.mjs";
import { evaluateSnapshot } from "./evaluate.mjs";
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

export const NOT_HISTORICALLY_REPRODUCIBLE_FIELDS = Object.freeze([
  "report.startedAt",
  "report.completedAt",
  "report.tool.version",
  "report.evidence.input.substrateEndpoint",
  "report.evidence.input.evmEndpoint",
  "report.evidence.input.timeoutMs",
  "report.evidence.input.retries",
  "report.evidence.substrate.endpoint",
  "report.evidence.substrate.identity.nodeName",
  "report.evidence.substrate.identity.nodeVersion",
  "report.evidence.evm.endpoint",
  "report.evidence.evm.identity.clientVersion",
  "report.evidence.evm.requests[*].startedAt",
  "report.evidence.evm.requests[*].attempt",
  "report.evidence.evm.requests[*].httpStatus",
  "report.limitations",
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

function integerAt(value, path, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(`${path} is invalid.`);
  return value;
}

function assertDeepEqual(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) invalid(message);
}

function validateCompactError(value, path) {
  const error = objectAt(value, path);
  assertAllowedKeys(error, path, ["name", "message", "code"]);
  stringAt(error.name, `${path}.name`);
  stringAt(error.message, `${path}.message`);
  if (error.code !== undefined && typeof error.code !== "string" && !Number.isSafeInteger(error.code)) {
    invalid(`${path}.code is invalid.`);
  }
  return error;
}

function validateJsonRpcResponse(value, path, requestId) {
  const response = objectAt(value, path);
  assertAllowedKeys(response, path, ["jsonrpc", "id", "result", "error"]);
  if (response.jsonrpc !== "2.0") invalid(`${path}.jsonrpc must be 2.0.`);
  if (response.id !== requestId) invalid(`${path}.id does not match the recorded request ID.`);
  const hasResult = Object.hasOwn(response, "result");
  const hasError = Object.hasOwn(response, "error");
  if (hasResult === hasError) invalid(`${path} must contain exactly one of result or error.`);
  if (hasError) {
    const error = objectAt(response.error, `${path}.error`);
    assertAllowedKeys(error, `${path}.error`, ["code", "message", "data"]);
    integerAt(error.code, `${path}.error.code`, { minimum: Number.MIN_SAFE_INTEGER });
    stringAt(error.message, `${path}.error.message`);
  }
  return response;
}

function validateRpcErrorDetail(value, path) {
  const error = objectAt(value, path);
  assertAllowedKeys(error, path, ["code", "message", "data"]);
  integerAt(error.code, `${path}.code`, { minimum: Number.MIN_SAFE_INTEGER });
  stringAt(error.message, `${path}.message`);
  return error;
}

function expectedRequestSpecs(report) {
  const evm = report.evidence.evm;
  const specs = new Map([
    [1, { method: "eth_chainId", params: [], evidence: "identity.chainIdHex" }],
    [2, { method: "web3_clientVersion", params: [], evidence: "identity.clientVersion" }],
  ]);
  if (!evm.identity) {
    const observedIds = new Set(evm.requests.map((record) => record?.request?.id));
    for (const id of [1, 2]) if (!observedIds.has(id)) specs.delete(id);
  }
  if (evm.block) {
    const tag = evm.block.requestedTag ?? numberToHex(evm.block.requestedNumber);
    specs.set(3, { method: "eth_getBlockByNumber", params: [tag, false], evidence: "block" });
  }
  if (Object.keys(evm.calls).length) {
    const tag = evm.block.requestedTag;
    const to = evm.precompileAddress;
    specs.set(4, { method: "eth_call", params: [{ to, data: EVM_ASSET_SELECTORS.totalSupply }, tag], call: "totalSupply" });
    specs.set(5, { method: "eth_call", params: [{ to, data: encodeBalanceOf(report.input.account) }, tag], call: "balanceOf" });
    specs.set(6, { method: "eth_call", params: [{ to, data: EVM_ASSET_SELECTORS.name }, tag], call: "name" });
    specs.set(7, { method: "eth_call", params: [{ to, data: EVM_ASSET_SELECTORS.symbol }, tag], call: "symbol" });
    specs.set(8, { method: "eth_call", params: [{ to, data: EVM_ASSET_SELECTORS.decimals }, tag], call: "decimals" });
  }
  return specs;
}

function validateFinalRequestObservation(report, id, spec, finalRecord) {
  const response = finalRecord.response;
  const successfulResult = response && finalRecord.httpStatus >= 200 && finalRecord.httpStatus < 300
    && Object.hasOwn(response, "result");
  if (id === 1 || id === 2) {
    if (!report.evidence.evm.identity) return;
    if (!successfulResult) invalid(`The final ${spec.method} request must contain a successful result.`);
    const expected = id === 1 ? report.evidence.evm.identity.chainIdHex : report.evidence.evm.identity.clientVersion;
    assertDeepEqual(response.result, expected, `The recorded ${spec.method} response contradicts EVM identity evidence.`);
    return;
  }
  if (id === 3) {
    if (!successfulResult) invalid("The final eth_getBlockByNumber request must contain a successful result.");
    if (report.evidence.evm.block.available === false) {
      if (response.result !== null) invalid("An unavailable EVM block must have a null final RPC result.");
      return;
    }
    const result = objectAt(response.result, "report.evidence.evm.requests final block result");
    if (result.number !== report.evidence.evm.block.requestedTag || result.hash !== report.evidence.evm.block.hash) {
      invalid("The recorded eth_getBlockByNumber response contradicts EVM block evidence.");
    }
    return;
  }

  const call = report.evidence.evm.calls[spec.call];
  if (call.ok) {
    if (!successfulResult || response.result !== call.raw) {
      invalid(`The recorded ${spec.call} response contradicts decoded EVM call evidence.`);
    }
    return;
  }
  if (response && !(finalRecord.httpStatus >= 200 && finalRecord.httpStatus < 300)) {
    assertDeepEqual(call.error, {
      name: "Error",
      message: `eth_call: HTTP ${finalRecord.httpStatus}`,
    }, `The recorded ${spec.call} HTTP error contradicts call evidence.`);
    if (call.rpcError !== undefined || call.kind !== "rpc-error") {
      invalid(`The recorded ${spec.call} HTTP error fields are inconsistent.`);
    }
    return;
  }
  if (response?.error) {
    assertDeepEqual(call.rpcError, response.error, `The recorded ${spec.call} RPC error contradicts call evidence.`);
    assertDeepEqual(call.error, {
      name: "RpcError",
      message: `eth_call: ${response.error.message}`,
      code: response.error.code,
    }, `The recorded ${spec.call} compact RPC error contradicts its response.`);
    const expectedKind = /metadata not found/i.test(JSON.stringify(response.error)) ? "metadata-missing" : "rpc-error";
    if (call.kind !== expectedKind) invalid(`The recorded ${spec.call} error kind is inconsistent.`);
    return;
  }
  if (finalRecord.error) {
    assertDeepEqual(call.error, finalRecord.error, `The recorded ${spec.call} transport error contradicts call evidence.`);
    if (call.kind !== "rpc-error") invalid(`The recorded ${spec.call} transport error kind is inconsistent.`);
    return;
  }
  invalid(`The unsuccessful ${spec.call} evidence has no matching final request observation.`);
}

function validateRequestHistory(report, evidenceInput) {
  const requests = report.evidence.evm.requests;
  if (!Array.isArray(requests)) invalid("report.evidence.evm.requests must be an array.");
  const specs = expectedRequestSpecs(report);
  if (!specs.size) invalid("Report request history contains no supported EVM observation.");
  const groups = new Map();
  for (const [index, recordValue] of requests.entries()) {
    const path = `report.evidence.evm.requests[${index}]`;
    const record = objectAt(recordValue, path);
    assertAllowedKeys(record, path, ["startedAt", "attempt", "request", "httpStatus", "response", "error"]);
    stringAt(record.startedAt, `${path}.startedAt`, ISO_DATE);
    const startedAt = Date.parse(record.startedAt);
    if (Number.isNaN(startedAt) || startedAt < Date.parse(report.startedAt) || startedAt > Date.parse(report.completedAt)) {
      invalid(`${path}.startedAt is outside the report interval.`);
    }
    integerAt(record.attempt, `${path}.attempt`, { maximum: evidenceInput.retries });
    const request = objectAt(record.request, `${path}.request`);
    assertAllowedKeys(request, `${path}.request`, ["jsonrpc", "id", "method", "params"]);
    if (request.jsonrpc !== "2.0") invalid(`${path}.request.jsonrpc must be 2.0.`);
    integerAt(request.id, `${path}.request.id`, { minimum: 1 });
    stringAt(request.method, `${path}.request.method`);
    if (!READ_ONLY_EVM_METHODS.includes(request.method)) invalid(`${path} contains a method outside FIRMA's read-only allowlist.`);
    if (!Array.isArray(request.params)) invalid(`${path}.request.params must be an array.`);
    const spec = specs.get(request.id);
    if (!spec) invalid(`${path} contains an unsupported request ID for firma.report.v1.`);
    if (request.method !== spec.method || !isDeepStrictEqual(request.params, spec.params)) {
      invalid(`${path} method or parameters contradict the reported verification workflow.`);
    }
    const hasResponse = Object.hasOwn(record, "response");
    const hasError = Object.hasOwn(record, "error");
    if (hasResponse === hasError) invalid(`${path} must contain exactly one of response or error.`);
    if (hasResponse) {
      integerAt(record.httpStatus, `${path}.httpStatus`, { minimum: 100, maximum: 599 });
      validateJsonRpcResponse(record.response, `${path}.response`, request.id);
    } else {
      if (record.httpStatus !== undefined) invalid(`${path}.httpStatus requires a recorded response.`);
      validateCompactError(record.error, `${path}.error`);
    }
    const group = groups.get(request.id) ?? [];
    group.push(record);
    groups.set(request.id, group);
  }

  for (const [id, spec] of specs) {
    const group = groups.get(id);
    if (!group?.length) invalid(`Report request history is missing ${spec.method} request ID ${id}.`);
    group.sort((left, right) => left.attempt - right.attempt);
    group.forEach((record, attempt) => {
      if (record.attempt !== attempt) invalid(`Request ID ${id} has duplicated or missing retry attempts.`);
      if (!isDeepStrictEqual(record.request, group[0].request)) invalid(`Request ID ${id} changed across retries.`);
      if (attempt < group.length - 1 && record.response?.error) invalid(`Request ID ${id} retried after a terminal JSON-RPC error.`);
      if (attempt < group.length - 1 && record.response && record.httpStatus >= 200 && record.httpStatus < 300) {
        invalid(`Request ID ${id} retried after a successful JSON-RPC response.`);
      }
    });
    validateFinalRequestObservation(report, id, spec, group.at(-1));
  }
  if (!report.evidence.evm.identity) {
    const hasFailedIdentityObservation = [...groups.entries()].some(([id, group]) => {
      if (id !== 1 && id !== 2) return false;
      const record = group.at(-1);
      return Boolean(record.error || record.response?.error || !(record.httpStatus >= 200 && record.httpStatus < 300));
    });
    if (!hasFailedIdentityObservation) invalid("Missing EVM identity requires a matching failed identity request.");
  }
}

function validateEvidenceConsistency(report) {
  const evidence = report.evidence;
  const input = evidence.input;
  if (evidence.substrate.endpoint !== input.substrateEndpoint || evidence.evm.endpoint !== input.evmEndpoint) {
    invalid("Recorded endpoint evidence does not match the report evidence input.");
  }
  if (input.timeoutMs < 1_000 || input.timeoutMs > 60_000) invalid("Evidence timeout is outside FIRMA's supported range.");
  integerAt(input.retries, "report.evidence.input.retries", { maximum: 2 });
  if (evidence.evm.identity && evidence.evm.identity.chainId !== BigInt(evidence.evm.identity.chainIdHex).toString()) {
    invalid("EVM chain ID decimal and hexadecimal evidence disagree.");
  }
  if (evidence.evm.block?.available === true && evidence.evm.block.requestedTag !== numberToHex(evidence.evm.block.number)) {
    invalid("The requested EVM block tag does not match the reported block number.");
  }
  if (evidence.evm.precompileAddress !== undefined && evidence.evm.precompileAddress !== assetPrecompileAddress(report.input.assetId)) {
    invalid("The EVM precompile address does not match the report asset ID.");
  }
  const decoders = { totalSupply: decodeUint256, balanceOf: decodeUint256, name: decodeAbiString, symbol: decodeAbiString, decimals: decodeUint256 };
  for (const [name, decode] of Object.entries(decoders)) {
    const call = evidence.evm.calls[name];
    if (!call) continue;
    if (!call.ok) continue;
    let decoded;
    try { decoded = decode(call.raw); } catch { invalid(`report.evidence.evm.calls.${name}.raw cannot be decoded.`); }
    if (decoded !== call.value) invalid(`report.evidence.evm.calls.${name}.value contradicts its raw response.`);
  }
  validateRequestHistory(report, input);
  const recomputedVerdict = evaluateSnapshot(evidence);
  if (!isDeepStrictEqual(report.verdict, recomputedVerdict)) {
    invalid("The duplicated verdict, checks, summaries, or check evidence contradict the report evidence.");
  }
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

function validateIncompleteEvmEvidence(report) {
  const evm = objectAt(report.evidence.evm, "report.evidence.evm");
  assertAllowedKeys(evm, "report.evidence.evm", ["reachable", "endpoint", "identity", "block", "calls", "requests", "precompileAddress", "error"]);
  booleanAt(evm.reachable, "report.evidence.evm.reachable");
  stringAt(evm.endpoint, "report.evidence.evm.endpoint");
  if (evm.error !== undefined) validateCompactError(evm.error, "report.evidence.evm.error");
  if (evm.reachable === false && evm.error === undefined) invalid("Unreachable EVM evidence must preserve its error observation.");
  if (evm.identity !== null) {
    const identity = objectAt(evm.identity, "report.evidence.evm.identity");
    assertAllowedKeys(identity, "report.evidence.evm.identity", ["chainId", "chainIdHex", "clientVersion"]);
    stringAt(identity.chainId, "report.evidence.evm.identity.chainId", DECIMAL);
    stringAt(identity.chainIdHex, "report.evidence.evm.identity.chainIdHex", HEX_QUANTITY);
    stringAt(identity.clientVersion, "report.evidence.evm.identity.clientVersion");
    if (!evm.reachable) invalid("Unreachable EVM evidence cannot contain a successful identity observation.");
  } else if (evm.reachable) invalid("Reachable EVM evidence must preserve its identity.");
  if (evm.block !== null) {
    const block = objectAt(evm.block, "report.evidence.evm.block");
    assertAllowedKeys(block, "report.evidence.evm.block", ["requestedNumber", "available"]);
    stringAt(block.requestedNumber, "report.evidence.evm.block.requestedNumber", DECIMAL);
    if (block.available !== false) invalid("Incomplete EVM evidence cannot claim an available block.");
  }
  const calls = objectAt(evm.calls, "report.evidence.evm.calls");
  if (Object.keys(calls).length) invalid("EVM calls cannot be present without an available historical block.");
  if (evm.precompileAddress !== undefined) invalid("A precompile address cannot be claimed without EVM call evidence.");
  validateRequestHistory(report, report.evidence.input);
}

function validateUnavailableEvidenceShape(report) {
  const substrate = objectAt(report.evidence.substrate, "report.evidence.substrate");
  assertAllowedKeys(substrate, "report.evidence.substrate", ["reachable", "endpoint", "identity", "finalized", "latestFinalized", "historical", "runtime", "asset", "accountMapping", "balance", "error"]);
  booleanAt(substrate.reachable, "report.evidence.substrate.reachable");
  stringAt(substrate.endpoint, "report.evidence.substrate.endpoint");
  if (substrate.error === undefined) invalid("Unavailable Substrate evidence must preserve its error observation.");
  validateCompactError(substrate.error, "report.evidence.substrate.error");
  if (substrate.reachable === false) {
    for (const field of ["identity", "finalized", "latestFinalized", "historical", "runtime", "asset", "accountMapping", "balance"]) {
      if (substrate[field] !== undefined && substrate[field] !== null) invalid(`Unreachable Substrate evidence cannot contain ${field}.`);
    }
  } else {
    if (substrate.finalized !== null) invalid("Unavailable historical Substrate evidence must have a null selected block.");
    const latest = objectAt(substrate.latestFinalized, "report.evidence.substrate.latestFinalized");
    assertAllowedKeys(latest, "report.evidence.substrate.latestFinalized", ["number", "hash"]);
    stringAt(latest.number, "report.evidence.substrate.latestFinalized.number", DECIMAL);
    stringAt(latest.hash, "report.evidence.substrate.latestFinalized.hash", HASH_32);
    const historical = objectAt(substrate.historical, "report.evidence.substrate.historical");
    assertAllowedKeys(historical, "report.evidence.substrate.historical", ["requestedNumber", "available", "finalized"]);
    stringAt(historical.requestedNumber, "report.evidence.substrate.historical.requestedNumber", DECIMAL);
    if (historical.available !== false) invalid("Unavailable historical Substrate evidence cannot claim availability.");
    booleanAt(historical.finalized, "report.evidence.substrate.historical.finalized");
    for (const field of ["identity", "runtime", "asset", "accountMapping", "balance"]) {
      if (substrate[field] !== undefined && substrate[field] !== null) invalid(`Unavailable historical Substrate evidence cannot contain ${field}.`);
    }
  }
  validateIncompleteEvmEvidence(report);
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

  const substrateCandidate = objectAt(report.evidence.substrate, "report.evidence.substrate");
  const unavailableEvidence = substrateCandidate.reachable !== true || !substrateCandidate.finalized;
  if (unavailableEvidence) {
    validateUnavailableEvidenceShape(report);
    const evidenceInput = objectAt(report.evidence.input, "report.evidence.input");
    assertAllowedKeys(evidenceInput, "report.evidence.input", ["substrateEndpoint", "evmEndpoint", "expectedChainId", "assetId", "account", "timeoutMs", "retries"]);
    stringAt(evidenceInput.substrateEndpoint, "report.evidence.input.substrateEndpoint");
    stringAt(evidenceInput.evmEndpoint, "report.evidence.input.evmEndpoint");
    if (!Number.isSafeInteger(evidenceInput.timeoutMs) || !Number.isSafeInteger(evidenceInput.retries)) invalid("Evidence timeout or retry configuration is invalid.");
    for (const field of ["expectedChainId", "assetId", "account"]) {
      if (evidenceInput[field] !== report.input[field]) invalid(`Evidence input ${field} does not match report input.`);
    }
    if (!Array.isArray(report.limitations) || report.limitations.some((item) => typeof item !== "string")) invalid("report.limitations must be an array of strings.");
    validateEvidenceConsistency(report);
    return;
  }

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
  assertAllowedKeys(fingerprint, "report.evidence.substrate.runtime.fingerprint", ["genesisHash", "runtimeCodeHash", "runtimeCodeHashAlgorithm", "runtimeCodeStorageKey", "collectedAtBlockHash", "errors"]);
  if (fingerprint.genesisHash !== null) stringAt(fingerprint.genesisHash, "report.evidence.substrate.runtime.fingerprint.genesisHash", HASH_32);
  if (fingerprint.runtimeCodeHash !== null) stringAt(fingerprint.runtimeCodeHash, "report.evidence.substrate.runtime.fingerprint.runtimeCodeHash", HASH_32);
  stringAt(fingerprint.runtimeCodeHashAlgorithm, "report.evidence.substrate.runtime.fingerprint.runtimeCodeHashAlgorithm");
  stringAt(fingerprint.runtimeCodeStorageKey, "report.evidence.substrate.runtime.fingerprint.runtimeCodeStorageKey", HEX);
  stringAt(fingerprint.collectedAtBlockHash, "report.evidence.substrate.runtime.fingerprint.collectedAtBlockHash", HASH_32);
  if (fingerprint.errors !== undefined) {
    const errors = objectAt(fingerprint.errors, "report.evidence.substrate.runtime.fingerprint.errors");
    assertAllowedKeys(errors, "report.evidence.substrate.runtime.fingerprint.errors", ["genesisHash", "runtimeCodeHash"]);
    if (!Object.keys(errors).length) invalid("Runtime fingerprint errors cannot be empty.");
    for (const field of Object.keys(errors)) validateCompactError(errors[field], `report.evidence.substrate.runtime.fingerprint.errors.${field}`);
  }
  for (const field of ["genesisHash", "runtimeCodeHash"]) {
    if ((fingerprint[field] === null) !== Boolean(fingerprint.errors?.[field])) {
      invalid(`Runtime fingerprint ${field} and its error observation are inconsistent.`);
    }
  }

  const asset = objectAt(substrate.asset, "report.evidence.substrate.asset");
  if (asset.unsupportedRuntime === true) {
    assertAllowedKeys(asset, "report.evidence.substrate.asset", ["exists", "unsupportedRuntime"]);
    if (asset.exists !== false) invalid("Unsupported-runtime asset evidence cannot claim existence.");
    const mapping = objectAt(substrate.accountMapping, "report.evidence.substrate.accountMapping");
    assertAllowedKeys(mapping, "report.evidence.substrate.accountMapping", ["exists", "unsupportedRuntime"]);
    if (mapping.exists !== false || mapping.unsupportedRuntime !== true) invalid("Unsupported-runtime mapping evidence is inconsistent.");
    const balance = objectAt(substrate.balance, "report.evidence.substrate.balance");
    assertAllowedKeys(balance, "report.evidence.substrate.balance", ["exists", "value"]);
    if (balance.exists !== false || balance.value !== null) invalid("Unsupported-runtime balance evidence is inconsistent.");
  } else {
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
  }

  const evm = objectAt(report.evidence.evm, "report.evidence.evm");
  if (evm.reachable !== true || !evm.identity || evm.block?.available !== true) {
    validateIncompleteEvmEvidence(report);
    const evidenceInput = objectAt(report.evidence.input, "report.evidence.input");
    assertAllowedKeys(evidenceInput, "report.evidence.input", ["substrateEndpoint", "evmEndpoint", "expectedChainId", "assetId", "account", "timeoutMs", "retries"]);
    stringAt(evidenceInput.substrateEndpoint, "report.evidence.input.substrateEndpoint");
    stringAt(evidenceInput.evmEndpoint, "report.evidence.input.evmEndpoint");
    if (!Number.isSafeInteger(evidenceInput.timeoutMs) || !Number.isSafeInteger(evidenceInput.retries)) invalid("Evidence timeout or retry configuration is invalid.");
    for (const field of ["expectedChainId", "assetId", "account"]) {
      if (evidenceInput[field] !== report.input[field]) invalid(`Evidence input ${field} does not match report input.`);
    }
    if (!Array.isArray(report.limitations) || report.limitations.some((item) => typeof item !== "string")) invalid("report.limitations must be an array of strings.");
    validateEvidenceConsistency(report);
    return;
  }
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
      if (call.kind !== undefined || call.error !== undefined || call.rpcError !== undefined) {
        invalid(`Successful ${field} evidence cannot contain failure fields.`);
      }
      stringAt(call.value, `report.evidence.evm.calls.${field}.value`);
      stringAt(call.raw, `report.evidence.evm.calls.${field}.raw`, HEX);
    } else {
      if (call.value !== undefined || call.raw !== undefined) invalid(`Failed ${field} evidence cannot contain value or raw fields.`);
      const kind = stringAt(call.kind, `report.evidence.evm.calls.${field}.kind`);
      if (!["metadata-missing", "rpc-error"].includes(kind)) invalid(`report.evidence.evm.calls.${field}.kind is unsupported.`);
      if (call.error !== undefined) validateCompactError(call.error, `report.evidence.evm.calls.${field}.error`);
      if (call.rpcError !== undefined) validateRpcErrorDetail(call.rpcError, `report.evidence.evm.calls.${field}.rpcError`);
      if (call.error === undefined && call.rpcError === undefined) invalid(`Failed ${field} evidence must contain an error observation.`);
    }
  }
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
  validateEvidenceConsistency(report);
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
