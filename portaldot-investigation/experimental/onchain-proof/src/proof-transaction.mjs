import { getAddress, Interface } from "ethers";
import { computeReportCommitment } from "./report-commitment.mjs";

export const PORTALDOT_V3_CHAIN_ID = 420420777n;
export const REPORT_COMMITTED_EVENT =
  "event ReportCommitted(bytes32 indexed commitment,address indexed submitter,uint256 recordedBlock,uint256 recordedAt)";

export class ProofTransactionError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "ProofTransactionError";
    this.code = code;
  }
}

function asBigInt(value, label) {
  try {
    return BigInt(value);
  } catch {
    throw new ProofTransactionError("INVALID_CHAIN_ID", `${label} is not a valid integer chain ID.`);
  }
}

export function assertPortaldotV3Chain(chainId) {
  const actual = asBigInt(chainId, "Wallet chain ID");
  if (actual !== PORTALDOT_V3_CHAIN_ID) {
    throw new ProofTransactionError(
      "WRONG_CHAIN",
      `Expected Portaldot V3 chain ID ${PORTALDOT_V3_CHAIN_ID}, received ${actual}.`,
    );
  }
  return actual;
}

function successfulStatus(status) {
  return status === 1 || status === 1n || status === "0x1";
}

export function validateCommitReceipt(receipt, { registryAddress, commitment }) {
  if (!receipt || typeof receipt !== "object") {
    throw new ProofTransactionError("INVALID_RECEIPT", "Transaction receipt is missing.");
  }
  if (!successfulStatus(receipt.status)) {
    throw new ProofTransactionError("TRANSACTION_REVERTED", "Commitment transaction did not succeed.");
  }
  const registry = getAddress(registryAddress);
  if (!receipt.to || getAddress(receipt.to) !== registry) {
    throw new ProofTransactionError("WRONG_REGISTRY", "Receipt target does not match the audited registry.");
  }
  if (!receipt.transactionHash || !receipt.blockHash || receipt.blockNumber === undefined) {
    throw new ProofTransactionError("INVALID_RECEIPT", "Receipt lacks transaction or block identity.");
  }

  const iface = new Interface([REPORT_COMMITTED_EVENT]);
  let matched;
  for (const log of receipt.logs ?? []) {
    if (!log.address || getAddress(log.address) !== registry) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "ReportCommitted" && parsed.args.commitment.toLowerCase() === commitment.toLowerCase()) {
        matched = parsed;
        break;
      }
    } catch {
      // Unrelated registry log.
    }
  }
  if (!matched) {
    throw new ProofTransactionError("MISSING_EVENT", "Receipt lacks the expected ReportCommitted event.");
  }
  if (BigInt(matched.args.recordedBlock) !== BigInt(receipt.blockNumber)) {
    throw new ProofTransactionError("BLOCK_MISMATCH", "Event block number does not match the receipt.");
  }

  return Object.freeze({
    commitment,
    registryAddress: registry,
    submitter: getAddress(matched.args.submitter),
    transactionHash: receipt.transactionHash,
    blockHash: receipt.blockHash,
    blockNumber: BigInt(receipt.blockNumber).toString(),
    recordedAt: BigInt(matched.args.recordedAt).toString(),
    gasUsed: receipt.gasUsed === undefined ? null : BigInt(receipt.gasUsed).toString(),
    effectiveGasPrice: receipt.effectiveGasPrice === undefined
      ? null
      : BigInt(receipt.effectiveGasPrice).toString(),
  });
}

export async function submitReportCommitment({ report, provider, sendTransaction, registryAddress }) {
  const prepared = computeReportCommitment(report);
  const network = await provider.getNetwork();
  assertPortaldotV3Chain(network.chainId);

  try {
    const transaction = await sendTransaction(prepared.commitment);
    const receipt = await transaction.wait();
    return {
      ...prepared,
      proof: validateCommitReceipt(receipt, {
        registryAddress,
        commitment: prepared.commitment,
      }),
    };
  } catch (error) {
    if (error instanceof ProofTransactionError) throw error;
    throw new ProofTransactionError(
      "TRANSACTION_FAILED",
      "Commitment transaction was rejected, dropped, or failed before validation.",
      { cause: error },
    );
  }
}
