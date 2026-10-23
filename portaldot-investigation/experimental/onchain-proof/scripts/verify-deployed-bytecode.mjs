import { readFile } from "node:fs/promises";
import { artifactPath } from "./build-contract.mjs";
import { PORTALDOT_V3_CHAIN_ID } from "../src/proof-transaction.mjs";

const endpoint = "https://test-evm-rpc-v3.portaldot.dev";
const address = process.argv[2];
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("Usage: npm run proof:verify-code -- <deployed-contract-H160-address>");
  process.exitCode = 64;
} else {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const request = async (id, method, params) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    return payload.result;
  };
  const [chainIdHex, code] = await Promise.all([
    request(1, "eth_chainId", []),
    request(2, "eth_getCode", [address, "latest"]),
  ]);
  const chainId = BigInt(chainIdHex);
  if (chainId !== PORTALDOT_V3_CHAIN_ID) throw new Error(`Wrong chain: ${chainId}.`);
  const matches = code.toLowerCase() === artifact.deployedBytecode.toLowerCase();
  console.log(JSON.stringify({ endpoint, chainId: chainId.toString(), address, matches, artifactHashes: artifact.hashes }, null, 2));
  if (!matches) process.exitCode = 1;
}
