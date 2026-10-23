import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Interface } from "ethers";
import { artifactPath } from "./build-contract.mjs";
import { PORTALDOT_V3_CHAIN_ID } from "../src/proof-transaction.mjs";

const endpoint = "https://test-evm-rpc-v3.portaldot.dev";
const from = process.argv[2];
if (!from || !/^0x[0-9a-fA-F]{40}$/.test(from)) {
  console.error("Usage: npm run proof:estimate -- <public-funded-H160-address>");
  process.exitCode = 64;
} else {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  let nextId = 0;
  async function rpc(method, params = []) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++nextId, method, params }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    return payload.result;
  }

  const [chainIdHex, gasPriceHex, balanceHex, gasHex, blockNumberHex] = await Promise.all([
    rpc("eth_chainId"),
    rpc("eth_gasPrice"),
    rpc("eth_getBalance", [from, "latest"]),
    rpc("eth_estimateGas", [{ from, data: artifact.bytecode }]),
    rpc("eth_blockNumber"),
  ]);
  const chainId = BigInt(chainIdHex);
  if (chainId !== PORTALDOT_V3_CHAIN_ID) throw new Error(`Wrong chain: ${chainId}.`);
  const gas = BigInt(gasHex);
  const gasPrice = BigInt(gasPriceHex);
  const probeRegistry = "0x000000000000000000000000000000000000f17a";
  const probeCommitment = `0x${"42".repeat(32)}`;
  const existingProbeCode = await rpc("eth_getCode", [probeRegistry, "latest"]);
  if (existingProbeCode !== "0x") throw new Error("Commit-estimate probe address is no longer empty.");
  const iface = new Interface(artifact.abi);
  let commitEstimate;
  try {
    const commitGasHex = await rpc("eth_estimateGas", [
      {
        from,
        to: probeRegistry,
        data: iface.encodeFunctionData("commit", [probeCommitment]),
      },
      "latest",
      { [probeRegistry]: { code: artifact.deployedBytecode } },
    ]);
    const commitGas = BigInt(commitGasHex);
    commitEstimate = {
      method: "eth_estimateGas with temporary state override containing exact deployed bytecode",
      gas: commitGas.toString(),
      estimatedExecutionFeeWeiEquivalent: (commitGas * gasPrice).toString(),
    };
  } catch (error) {
    commitEstimate = { unavailable: true, reason: error.message };
  }
  console.log(JSON.stringify({
    evidenceType: "READ_ONLY_DEPLOYMENT_ESTIMATE_NOT_A_TRANSACTION",
    endpoint,
    observedAt: new Date().toISOString(),
    blockNumber: BigInt(blockNumberHex).toString(),
    chainId: chainId.toString(),
    from,
    accountBalanceWeiEquivalent: BigInt(balanceHex).toString(),
    gas: gas.toString(),
    gasPriceWeiEquivalent: gasPrice.toString(),
    estimatedExecutionFeeWeiEquivalent: (gas * gasPrice).toString(),
    commitEstimate,
    artifactHashes: artifact.hashes,
    limitations: [
      "This is eth_estimateGas, not a signed or submitted deployment.",
      "The commit estimate uses a temporary state override and is not an on-chain proof.",
      "Runtime storage deposits and final charged fees must be confirmed from a real receipt.",
    ],
  }, null, 2));
}
