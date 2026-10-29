export function assetPrecompileAddress(assetId) {
  const id = BigInt(assetId);
  return `0x${id.toString(16).padStart(8, "0")}${"0".repeat(24)}00010000`;
}

export function encodeBalanceOf(account) {
  return `0x70a08231${account.slice(2).padStart(64, "0")}`;
}

export function decodeUint256(hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex ?? "")) throw new Error("Expected a 32-byte ABI uint256 result.");
  return BigInt(hex).toString();
}

export function decodeAbiString(hex) {
  if (!/^0x[0-9a-fA-F]+$/.test(hex ?? "") || hex.length % 2 !== 0) {
    throw new Error("Expected ABI-encoded string result.");
  }
  const raw = hex.slice(2);
  if (raw.length < 128 || raw.length % 64 !== 0) throw new Error("ABI string payload must be 32-byte aligned.");

  const offset = BigInt(`0x${raw.slice(0, 64)}`);
  if (offset !== 32n) throw new Error("ABI string must use the canonical 32-byte offset.");

  const length = BigInt(`0x${raw.slice(64, 128)}`);
  const available = BigInt((raw.length - 128) / 2);
  if (length > available) throw new Error("Truncated ABI string result.");
  const paddedLength = ((length + 31n) / 32n) * 32n;
  if (available !== paddedLength) throw new Error("ABI string result has a noncanonical payload length.");
  if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ABI string result is too large to decode safely.");

  const byteLength = Number(length);
  const encoded = raw.slice(128);
  const valueHex = encoded.slice(0, byteLength * 2);
  const paddingHex = encoded.slice(byteLength * 2);
  if (!/^0*$/.test(paddingHex)) throw new Error("ABI string result has nonzero padding.");

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(valueHex, "hex"));
  } catch {
    throw new Error("ABI string result is not valid UTF-8.");
  }
}

export function numberToHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

export function compactError(error) {
  if (!error) return null;
  return {
    name: String(error.name ?? "Error"),
    message: String(error.message ?? error),
    code: error.code ?? undefined,
  };
}

