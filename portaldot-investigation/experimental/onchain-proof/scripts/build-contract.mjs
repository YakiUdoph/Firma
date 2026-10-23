import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256 } from "ethers";
import solc from "solc";

const directory = dirname(fileURLToPath(import.meta.url));
export const proofRoot = resolve(directory, "..");
export const sourcePath = resolve(proofRoot, "contracts", "FirmaEvidenceRegistry.sol");
export const artifactPath = resolve(proofRoot, "artifacts", "FirmaEvidenceRegistry.json");
export const SOURCE_NAME = "contracts/FirmaEvidenceRegistry.sol";
export const CONTRACT_NAME = "FirmaEvidenceRegistry";
export const EXPECTED_COMPILER = "0.8.38+commit.1835d247";

export const compilerSettings = Object.freeze({
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "paris",
  metadata: { appendCBOR: false, bytecodeHash: "none" },
  outputSelection: {
    "*": {
      "*": [
        "abi",
        "metadata",
        "evm.bytecode.object",
        "evm.bytecode.opcodes",
        "evm.bytecode.sourceMap",
        "evm.deployedBytecode.object",
        "evm.deployedBytecode.opcodes",
        "evm.deployedBytecode.sourceMap",
      ],
    },
  },
});

function sha256Hex(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function compileContract(source) {
  const compilerVersion = solc.version();
  if (!compilerVersion.startsWith(EXPECTED_COMPILER)) {
    throw new Error(`Expected solc ${EXPECTED_COMPILER}, received ${compilerVersion}.`);
  }
  const input = {
    language: "Solidity",
    sources: { [SOURCE_NAME]: { content: source } },
    settings: compilerSettings,
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === "error");
  if (errors.length) throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));
  const compiled = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
  if (!compiled) throw new Error("Compiler did not return FirmaEvidenceRegistry.");

  const bytecode = `0x${compiled.evm.bytecode.object}`;
  const deployedBytecode = `0x${compiled.evm.deployedBytecode.object}`;
  return {
    contractName: CONTRACT_NAME,
    sourceName: SOURCE_NAME,
    compiler: { version: compilerVersion, settings: compilerSettings },
    abi: compiled.abi,
    bytecode,
    deployedBytecode,
    metadata: JSON.parse(compiled.metadata),
    hashes: {
      sourceSha256: sha256Hex(Buffer.from(source, "utf8")),
      creationBytecodeSha256: sha256Hex(Buffer.from(compiled.evm.bytecode.object, "hex")),
      deployedBytecodeSha256: sha256Hex(Buffer.from(compiled.evm.deployedBytecode.object, "hex")),
      deployedBytecodeKeccak256: keccak256(deployedBytecode),
    },
  };
}

export async function buildContract() {
  const source = await readFile(sourcePath, "utf8");
  const artifact = compileContract(source);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifact = await buildContract();
  console.log(JSON.stringify({
    compiler: artifact.compiler.version,
    artifact: artifactPath,
    hashes: artifact.hashes,
  }, null, 2));
}
