import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { u8aToHex } from "@polkadot/util";
import { prepareNativeAnchor } from "../src/native-anchor.mjs";
import { DEFAULTS, PORTALDOT_V3_SUPPORT_PROFILE, RUNTIME_CODE_STORAGE_KEY } from "../src/constants.mjs";
import { parseImportedReportText } from "../src/report-import.mjs";
import { withTimeout } from "../src/rpc.mjs";
import { connectSubstrateApi } from "../src/verifier.mjs";

const TPOT_DECIMALS = 14;

function usage() {
  throw new Error("Usage: node scripts/prepare-native-authorization.mjs <report.json> <SS58 account> <output.json>");
}

function tpot(baseUnits) {
  const value = BigInt(baseUnits);
  const scale = 10n ** BigInt(TPOT_DECIMALS);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(TPOT_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual ?? "unavailable"}.`);
}

const [reportArgument, account, outputArgument, ...extra] = process.argv.slice(2);
if (!reportArgument || !account || !outputArgument || extra.length) usage();

const reportPath = resolve(reportArgument);
const outputPath = resolve(outputArgument);
const report = parseImportedReportText(await readFile(reportPath, "utf8"));
const preparation = prepareNativeAnchor(report, account);
const profile = PORTALDOT_V3_SUPPORT_PROFILE;
const reportFingerprint = report.evidence.substrate.runtime.fingerprint;

assertEqual(report.input.expectedChainId, profile.evmChainId, "Report EVM chain ID");
assertEqual(reportFingerprint.genesisHash, profile.genesisHash, "Report genesis hash");
assertEqual(reportFingerprint.runtimeCodeHash, profile.runtimeCodeHash, "Report runtime-code hash");
assertEqual(report.evidence.substrate.runtime.specName, profile.specName, "Report runtime spec name");
assertEqual(report.evidence.substrate.runtime.specVersion, profile.specVersion, "Report runtime spec version");
assertEqual(report.evidence.substrate.runtime.transactionVersion, profile.transactionVersion, "Report transaction version");

const network = { ...DEFAULTS, retries: 2 };
const timeoutMs = network.timeoutMs;
const { api } = await connectSubstrateApi(network);
try {
  const finalizedHash = await withTimeout(api.rpc.chain.getFinalizedHead(), timeoutMs, "Authorization finalized-head query");
  const [header, chain, genesis, runtime, runtimeCodeHash, accountInfo] = await withTimeout(Promise.all([
    api.rpc.chain.getHeader(finalizedHash),
    api.rpc.system.chain(),
    api.rpc.chain.getBlockHash(0),
    api.rpc.state.getRuntimeVersion(finalizedHash),
    api.rpc.state.getStorageHash(RUNTIME_CODE_STORAGE_KEY, finalizedHash),
    api.query.system.account.at(finalizedHash, preparation.signer),
  ]), timeoutMs, "Authorization identity and account queries");

  const identity = {
    chain: chain.toString(),
    genesisHash: genesis.toHex().toLowerCase(),
    runtimeCodeHash: runtimeCodeHash.toHex().toLowerCase(),
    specName: runtime.specName.toString(),
    specVersion: runtime.specVersion.toString(),
    transactionVersion: runtime.transactionVersion.toString(),
  };
  assertEqual(identity.chain, preparation.chain, "Live chain");
  assertEqual(identity.genesisHash, profile.genesisHash, "Live genesis hash");
  assertEqual(identity.runtimeCodeHash, profile.runtimeCodeHash, "Live runtime-code hash");
  assertEqual(identity.specName, profile.specName, "Live runtime spec name");
  assertEqual(identity.specVersion, profile.specVersion, "Live runtime spec version");
  assertEqual(identity.transactionVersion, profile.transactionVersion, "Live transaction version");

  const remarkWithEvent = api.tx.system?.remarkWithEvent;
  if (!remarkWithEvent) throw new Error("system.remarkWithEvent is unavailable in the reviewed runtime.");
  const extrinsic = remarkWithEvent(preparation.payload);
  assertEqual(extrinsic.method.section, "system", "Call section");
  assertEqual(extrinsic.method.method, "remarkWithEvent", "Call method");
  assertEqual(extrinsic.method.args[0].toHex().toLowerCase(), preparation.payload, "Call payload");

  const payment = await withTimeout(
    extrinsic.paymentInfo(preparation.signer, { at: finalizedHash }),
    timeoutMs,
    "Account-specific native fee query",
  );
  const free = BigInt(accountInfo.data.free.toString());
  const frozen = BigInt(accountInfo.data.frozen?.toString?.() ?? "0");
  const usable = free > frozen ? free - frozen : 0n;
  const maximumFee = BigInt(payment.partialFee.toString());
  if (usable < maximumFee) throw new Error("The selected native account cannot cover the freshly estimated maximum fee.");

  const authorization = {
    schema: "firma.anchor-authorization.native.v1",
    status: "PREPARED_NOT_SUBMITTED",
    report: {
      path: reportArgument.replaceAll("\\", "/"),
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      verdict: report.verdict.overall,
      counts: report.verdict.counts,
      finalizedBlock: report.evidence.substrate.finalized,
    },
    authorization: {
      protocol: preparation.protocol,
      chain: identity.chain,
      genesisHash: identity.genesisHash,
      runtimeProfile: profile.id,
      runtimeCodeHash: identity.runtimeCodeHash,
      specName: identity.specName,
      specVersion: identity.specVersion,
      transactionVersion: identity.transactionVersion,
      account: preparation.signer,
      call: preparation.method,
      callIndex: u8aToHex(extrinsic.method.callIndex),
      commitment: preparation.commitment,
      algorithm: preparation.algorithm,
      domain: preparation.domain,
      payload: preparation.payload,
      valueBaseUnits: preparation.value,
      maximumFeeBaseUnits: maximumFee.toString(),
      maximumFeeTPOT: tpot(maximumFee),
      balanceBaseUnits: free.toString(),
      usableBalanceBaseUnits: usable.toString(),
      weight: payment.weight?.toJSON?.() ?? payment.weight?.toString?.() ?? null,
      observedAtFinalizedBlock: { number: header.number.toString(), hash: finalizedHash.toHex().toLowerCase() },
    },
    submission: { authorized: false, signed: false, broadcast: false, transactionHash: null },
    nextRequiredAction: "The owner must review these exact fields and separately authorize the matching SubWallet request. Any changed field or fee requires a fresh preparation.",
  };

  await writeFile(outputPath, `${JSON.stringify(authorization, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify(authorization, null, 2));
} finally {
  await withTimeout(api.disconnect(), 2_000, "Authorization disconnect").catch(() => {});
}
