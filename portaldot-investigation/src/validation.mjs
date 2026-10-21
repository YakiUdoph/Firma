const H160 = /^0x[0-9a-fA-F]{40}$/;
const UINT32_MAX = 4_294_967_295n;

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

export function parseRequestBody(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Request body must be a JSON object.");
  }
  return value;
}

export function parseAssetId(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value))) {
    throw new InputError("Asset ID must be an unsigned base-10 integer.");
  }
  const parsed = BigInt(value);
  if (parsed > UINT32_MAX) throw new InputError("Asset ID must fit in an unsigned 32-bit integer.");
  return parsed.toString();
}

export function parseAccount(value) {
  if (!H160.test(String(value))) throw new InputError("Account must be a 20-byte 0x-prefixed EVM address.");
  return String(value).toLowerCase();
}

export function parseExpectedChainId(value) {
  if (!/^[1-9][0-9]*$/.test(String(value))) throw new InputError("Expected chain ID must be a positive integer.");
  return BigInt(value).toString();
}

export function parseTimeout(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 60_000) {
    throw new InputError("Timeout must be an integer from 1000 through 60000 milliseconds.");
  }
  return parsed;
}

export function parseEndpoint(value, kind) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new InputError(`${kind} endpoint must be a valid URL.`);
  }
  const allowed = kind === "Substrate" ? ["wss:", "ws:"] : ["https:", "http:"];
  if (!allowed.includes(url.protocol)) throw new InputError(`${kind} endpoint uses an unsupported protocol.`);
  if ((url.protocol === "ws:" || url.protocol === "http:") && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new InputError(`Insecure ${kind} endpoints are allowed only on localhost.`);
  }
  if (url.username || url.password) throw new InputError(`${kind} endpoint must not contain credentials.`);
  return url.href.replace(/\/$/, "");
}

export function normalizeOptions(options) {
  return {
    substrateEndpoint: parseEndpoint(options.substrateEndpoint, "Substrate"),
    evmEndpoint: parseEndpoint(options.evmEndpoint, "EVM"),
    expectedChainId: parseExpectedChainId(options.expectedChainId),
    assetId: parseAssetId(options.assetId),
    account: parseAccount(options.account),
    timeoutMs: parseTimeout(options.timeoutMs),
    retries: Math.min(2, Math.max(0, Number.parseInt(options.retries, 10) || 0)),
  };
}

