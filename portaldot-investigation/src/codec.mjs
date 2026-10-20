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
  if (!/^0x[0-9a-fA-F]+$/.test(hex ?? "") || hex.length < 130 || hex.length % 2 !== 0) {
    throw new Error("Expected ABI-encoded string result.");
  }
  const raw = hex.slice(2);
  const offset = Number(BigInt(`0x${raw.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${raw.slice(offset, offset + 64)}`));
  const start = offset + 64;
  const bytes = raw.slice(start, start + length * 2);
  if (bytes.length !== length * 2) throw new Error("Truncated ABI string result.");
  return Buffer.from(bytes, "hex").toString("utf8");
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
    stack: typeof error.stack === "string" ? error.stack.split("\n").slice(0, 6) : undefined,
  };
}

