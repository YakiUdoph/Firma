export function validReport() {
  return {
    schema: "firma.report.v1",
    tool: {
      name: "FIRMA",
      version: "0.1.0",
      mode: "read-only",
      allowedEvmMethods: ["eth_chainId", "eth_call"],
    },
    startedAt: "2026-10-23T01:45:19.173Z",
    completedAt: "2026-10-23T01:45:33.489Z",
    input: {
      expectedChainId: "420420777",
      assetId: "2",
      account: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380",
    },
    verdict: {
      overall: "PASS",
      counts: { PASS: 1, FAIL: 0, UNKNOWN: 0 },
      checks: [{ id: "identity.chainId", status: "PASS", summary: "Chain ID matches." }],
    },
    evidence: {
      substrate: {
        finalized: {
          number: "153885",
          hash: "0x2a95a2c8576bb45542a20af736460ee2bbf5b62b3bc6a6efeed0d1ce155badf5",
        },
      },
      evm: {
        identity: { chainId: "420420777" },
        block: {
          number: "153885",
          hash: "0xf7ae8a5840acabf609727a74f6b08f8b8f6cb8366dbfec42e00584ed5f4984f7",
        },
      },
    },
    limitations: [],
  };
}

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
