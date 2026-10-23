import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import { Interface } from "ethers";
import { artifactPath } from "../../experimental/onchain-proof/scripts/build-contract.mjs";

const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const iface = new Interface(artifact.abi);
const contract = createAddressFromString("0x1000000000000000000000000000000000000001");
const caller = createAddressFromString("0x2000000000000000000000000000000000000002");

async function fixture() {
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Prague });
  const vm = await createVM({ common });
  await vm.stateManager.putCode(contract, hexToBytes(artifact.deployedBytecode));
  const call = (data) => vm.evm.runCall({
    to: contract,
    caller,
    data: hexToBytes(data),
    gasLimit: 5_000_000n,
  });
  return { call };
}

test("commit emits ReportCommitted and get retrieves the immutable record", async () => {
  const { call } = await fixture();
  const commitment = `0x${"42".repeat(32)}`;
  const committed = await call(iface.encodeFunctionData("commit", [commitment]));
  assert.equal(committed.execResult.exceptionError, undefined);
  assert.equal(committed.execResult.logs.length, 1);

  const [, topics, data] = committed.execResult.logs[0];
  const event = iface.parseLog({ topics: topics.map(bytesToHex), data: bytesToHex(data) });
  assert.equal(event.name, "ReportCommitted");
  assert.equal(event.args.commitment, commitment);
  assert.equal(event.args.submitter.toLowerCase(), caller.toString().toLowerCase());

  const retrieved = await call(iface.encodeFunctionData("get", [commitment]));
  assert.equal(retrieved.execResult.exceptionError, undefined);
  const [submitter, recordedBlock, recordedAt, exists] = iface.decodeFunctionResult(
    "get",
    bytesToHex(retrieved.execResult.returnValue),
  );
  assert.equal(submitter.toLowerCase(), caller.toString().toLowerCase());
  assert.equal(recordedBlock, event.args.recordedBlock);
  assert.equal(recordedAt, event.args.recordedAt);
  assert.equal(exists, true);
});

test("zero and duplicate commitments revert with typed custom errors", async () => {
  const { call } = await fixture();
  const zero = `0x${"00".repeat(32)}`;
  const zeroResult = await call(iface.encodeFunctionData("commit", [zero]));
  assert.ok(zeroResult.execResult.exceptionError);
  assert.equal(iface.parseError(bytesToHex(zeroResult.execResult.returnValue)).name, "ZeroCommitment");

  const commitment = `0x${"7a".repeat(32)}`;
  const first = await call(iface.encodeFunctionData("commit", [commitment]));
  assert.equal(first.execResult.exceptionError, undefined);
  const duplicate = await call(iface.encodeFunctionData("commit", [commitment]));
  assert.ok(duplicate.execResult.exceptionError);
  const error = iface.parseError(bytesToHex(duplicate.execResult.returnValue));
  assert.equal(error.name, "CommitmentAlreadyExists");
  assert.equal(error.args.commitment, commitment);
});

test("unknown commitments return an empty non-existent record", async () => {
  const { call } = await fixture();
  const result = await call(iface.encodeFunctionData("get", [`0x${"99".repeat(32)}`]));
  const [submitter, recordedBlock, recordedAt, exists] = iface.decodeFunctionResult(
    "get",
    bytesToHex(result.execResult.returnValue),
  );
  assert.equal(submitter, "0x0000000000000000000000000000000000000000");
  assert.equal(recordedBlock, 0n);
  assert.equal(recordedAt, 0n);
  assert.equal(exists, false);
});
