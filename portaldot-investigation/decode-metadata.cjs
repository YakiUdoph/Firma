#!/usr/bin/env node

const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { TypeRegistry } = require("@polkadot/types/create");
const { Metadata } = require("@polkadot/types/metadata");

const root = __dirname;
const metadataHex = readFileSync(join(root, "raw", "substrate-metadata.hex"), "utf8").trim();
const registry = new TypeRegistry();
const metadata = new Metadata(registry, metadataHex);
registry.setMetadata(metadata);

function variantNames(typeId) {
  const type = registry.lookup.getSiType(typeId);
  return type.def.isVariant
    ? type.def.asVariant.variants.map((variant) => variant.name.toString())
    : [];
}

const pallets = metadata.asLatest.pallets.map((pallet) => {
  const storage = pallet.storage.isSome
    ? pallet.storage.unwrap().items.map((item) => ({
        name: item.name.toString(),
        modifier: item.modifier.toString(),
        type: item.type.toHuman(),
        docs: item.docs.map(String),
      }))
    : [];
  return {
    name: pallet.name.toString(),
    index: pallet.index.toNumber(),
    calls: pallet.calls.isSome ? variantNames(pallet.calls.unwrap().type) : [],
    storagePrefix: pallet.storage.isSome ? pallet.storage.unwrap().prefix.toString() : null,
    storage,
    constants: pallet.constants.map((constant) => constant.name.toString()),
    events: pallet.events.isSome ? variantNames(pallet.events.unwrap().type) : [],
    errors: pallet.errors.isSome ? variantNames(pallet.errors.unwrap().type) : [],
  };
});

const summary = {
  decodedAt: new Date().toISOString(),
  metadataVersion: metadata.version,
  palletCount: pallets.length,
  extrinsic: metadata.asLatest.extrinsic.toHuman(),
  runtimeApis: metadata.asLatest.apis.toHuman(),
  pallets,
};

mkdirSync(join(root, "raw"), { recursive: true });
writeFileSync(join(root, "raw", "decoded-metadata.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`metadata v${summary.metadataVersion}; ${summary.palletCount} pallets`);
for (const pallet of pallets) {
  console.log(`${pallet.index.toString().padStart(3)} ${pallet.name}: calls=${pallet.calls.join(",") || "-"}; storage=${pallet.storage.map((item) => item.name).join(",") || "-"}`);
}
