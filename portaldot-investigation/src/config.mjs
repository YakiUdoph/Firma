import { DEFAULTS } from "./constants.mjs";

export function configuredDefaults(env = process.env) {
  return {
    ...DEFAULTS,
    substrateEndpoint: env.FIRMA_SUBSTRATE_ENDPOINT ?? DEFAULTS.substrateEndpoint,
    evmEndpoint: env.FIRMA_EVM_ENDPOINT ?? DEFAULTS.evmEndpoint,
    expectedChainId: env.FIRMA_EXPECTED_CHAIN_ID ?? DEFAULTS.expectedChainId,
    timeoutMs: env.FIRMA_TIMEOUT_MS ?? DEFAULTS.timeoutMs,
    retries: env.FIRMA_RETRIES ?? DEFAULTS.retries,
  };
}
