import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  artifactPath,
  compileContract,
  sourcePath,
} from "../../experimental/onchain-proof/scripts/build-contract.mjs";

test("pinned compilation is deterministic and matches the committed artifact", async () => {
  const source = await readFile(sourcePath, "utf8");
  const first = compileContract(source);
  const second = compileContract(source);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(first, second);
  assert.deepEqual(artifact, first);
  assert.equal(first.compiler.settings.evmVersion, "paris");
  assert.equal(first.compiler.settings.metadata.appendCBOR, false);
  assert.equal(first.compiler.settings.metadata.bytecodeHash, "none");
});

test("artifact exposes only the immutable registry surface", async () => {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const functions = artifact.abi.filter(({ type }) => type === "function");
  const events = artifact.abi.filter(({ type }) => type === "event");
  const errors = artifact.abi.filter(({ type }) => type === "error");
  assert.deepEqual(functions.map(({ name }) => name).sort(), ["commit", "get"]);
  assert.equal(functions.find(({ name }) => name === "commit").stateMutability, "nonpayable");
  assert.equal(functions.find(({ name }) => name === "get").stateMutability, "view");
  assert.deepEqual(events.map(({ name }) => name), ["ReportCommitted"]);
  assert.deepEqual(errors.map(({ name }) => name).sort(), ["CommitmentAlreadyExists", "ZeroCommitment"]);
  assert.equal(artifact.abi.some(({ type }) => type === "constructor" || type === "fallback" || type === "receive"), false);
});
