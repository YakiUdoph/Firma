export const PORTALDOT_V3_CHAIN_ID_HEX = "0x190f1ca9";
export const PORTALDOT_V3_CHAIN_ID = "420420777";
export const ANCHOR_EVIDENCE_SCHEMA = "firma.anchor.v1";
export const EVM_MAXIMUM_FEE_BASE_UNITS = 100_000_000_000_000n; // 1 tPOT safety ceiling

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

export class WalletAnchorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "WalletAnchorError";
    this.code = code;
  }
}

function asQuantity(value, label) {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value)) {
    throw new WalletAnchorError("INVALID_WALLET_RESPONSE", `${label} is not a canonical hexadecimal quantity.`);
  }
  return BigInt(value);
}

export function normalizeEvmAccount(value) {
  if (typeof value !== "string" || !EVM_ADDRESS.test(value)) {
    throw new WalletAnchorError(
      "UNSUPPORTED_ACCOUNT",
      "Anchoring requires a 20-byte EVM account. The confirmed 5En7…r4QUz address is an SS58 native account and cannot be used as an EVM sender.",
    );
  }
  return value.toLowerCase();
}

export function normalizeWalletTransactionHash(value) {
  if (typeof value !== "string" || !TRANSACTION_HASH.test(value)) {
    throw new WalletAnchorError("INVALID_TRANSACTION_HASH", "The wallet did not return a valid transaction hash.");
  }
  return value.toLowerCase();
}

function walletError(error, fallback) {
  if (error instanceof WalletAnchorError) return error;
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
    return new WalletAnchorError("SIGNING_REJECTED", "The wallet request was rejected. No transaction was submitted.", { cause: error });
  }
  if (error?.code === "TRANSACTION_REPLACED") {
    return new WalletAnchorError(
      "TRANSACTION_REPLACED",
      "The wallet reports that the transaction was replaced. FIRMA will not accept the replacement automatically; verify its hash explicitly.",
      { cause: error },
    );
  }
  return new WalletAnchorError("WALLET_ERROR", fallback, { cause: error });
}

export function requireWalletProvider(provider = globalThis.ethereum) {
  if (!provider || typeof provider.request !== "function") {
    throw new WalletAnchorError("UNSUPPORTED_WALLET", "No compatible EVM wallet provider is available in this browser.");
  }
  return provider;
}

export async function connectWallet(provider = globalThis.ethereum) {
  const wallet = requireWalletProvider(provider);
  let accounts;
  try {
    accounts = await wallet.request({ method: "eth_requestAccounts" });
  } catch (error) {
    throw walletError(error, "The wallet could not connect.");
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new WalletAnchorError("NO_ACCOUNT", "The wallet did not expose an EVM account.");
  }
  return normalizeEvmAccount(accounts[0]);
}

export async function inspectAnchorTransaction(provider, prepared) {
  const wallet = requireWalletProvider(provider);
  const transaction = prepared?.transaction;
  const account = normalizeEvmAccount(transaction?.from);
  if (normalizeEvmAccount(transaction?.to) !== account || transaction?.value !== "0x0" || typeof transaction?.data !== "string") {
    throw new WalletAnchorError("INVALID_PREPARATION", "The prepared anchoring transaction is incomplete or unsafe.");
  }

  let chainIdHex;
  let balanceHex;
  let gasLimitHex;
  let gasPriceHex;
  try {
    chainIdHex = await wallet.request({ method: "eth_chainId" });
    if (typeof chainIdHex !== "string" || chainIdHex.toLowerCase() !== PORTALDOT_V3_CHAIN_ID_HEX) {
      throw new WalletAnchorError(
        "WRONG_CHAIN",
        `Select Portaldot V3 Test (chain ID ${PORTALDOT_V3_CHAIN_ID}) in the wallet before continuing.`,
      );
    }
    balanceHex = await wallet.request({ method: "eth_getBalance", params: [account, "latest"] });
    gasLimitHex = await wallet.request({ method: "eth_estimateGas", params: [transaction] });
    gasPriceHex = await wallet.request({ method: "eth_gasPrice" });
  } catch (error) {
    throw walletError(error, "The wallet could not estimate the anchoring transaction.");
  }

  const balance = asQuantity(balanceHex, "Wallet balance");
  const gasLimit = asQuantity(gasLimitHex, "Estimated gas");
  const gasPrice = asQuantity(gasPriceHex, "Gas price");
  const maximumFee = gasLimit * gasPrice;
  if (maximumFee > EVM_MAXIMUM_FEE_BASE_UNITS) {
    throw new WalletAnchorError(
      "UNREASONABLE_FEE",
      "The EVM maximum fee exceeds FIRMA's 1 tPOT safety ceiling. Do not approve it; use the lower-cost native SubWallet route or wait for the EVM gas accounting to be clarified.",
    );
  }
  if (balance < maximumFee) {
    throw new WalletAnchorError(
      "INSUFFICIENT_BALANCE",
      "The connected EVM account does not have enough usable tPOT for the estimated maximum fee. The confirmed SS58 balance is not assumed to fund it.",
    );
  }

  return Object.freeze({
    chainId: PORTALDOT_V3_CHAIN_ID,
    chainIdHex: PORTALDOT_V3_CHAIN_ID_HEX,
    account,
    balanceBaseUnits: balance.toString(),
    gasLimit: gasLimit.toString(),
    gasLimitHex,
    gasPriceBaseUnits: gasPrice.toString(),
    gasPriceHex,
    maximumFeeBaseUnits: maximumFee.toString(),
    transaction: Object.freeze({ ...transaction, from: account, to: account, gas: gasLimitHex, gasPrice: gasPriceHex }),
  });
}

export async function submitAnchorTransaction(provider, inspection) {
  const wallet = requireWalletProvider(provider);
  try {
    const chainId = await wallet.request({ method: "eth_chainId" });
    const accounts = await wallet.request({ method: "eth_accounts" });
    if (typeof chainId !== "string" || chainId.toLowerCase() !== inspection.chainIdHex) {
      throw new WalletAnchorError("WALLET_CONTEXT_CHANGED", "The wallet network changed after fee review. Reconnect and review a new estimate.");
    }
    const currentAccount = Array.isArray(accounts) && accounts.length ? normalizeEvmAccount(accounts[0]) : null;
    if (currentAccount !== inspection.account) {
      throw new WalletAnchorError("WALLET_CONTEXT_CHANGED", "The wallet account changed after fee review. Reconnect and review a new estimate.");
    }
    const hash = await wallet.request({ method: "eth_sendTransaction", params: [inspection.transaction] });
    return normalizeWalletTransactionHash(hash);
  } catch (error) {
    throw walletError(error, "The wallet could not submit the anchoring transaction.");
  }
}

export function formatTPotBaseUnits(value) {
  const amount = BigInt(value);
  const whole = amount / 100_000_000_000_000n;
  const fraction = (amount % 100_000_000_000_000n).toString().padStart(14, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} tPOT` : `${whole} tPOT`;
}

export function anchoringFilename(evidence) {
  const hash = typeof evidence?.transactionHash === "string" ? evidence.transactionHash.slice(2, 14).toLowerCase() : "unknown";
  return `firma-anchor-${hash || "unknown"}.json`;
}
