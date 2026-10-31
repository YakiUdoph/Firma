import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "public");
const destination = join(root, "dist");

if (destination === root || !destination.startsWith(`${root}\\`) && !destination.startsWith(`${root}/`)) {
  throw new Error("Refusing to clean a build directory outside the FIRMA application root.");
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
await build({
  entryPoints: [join(root, "browser", "native-wallet.mjs")],
  outfile: join(destination, "native-wallet.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
});
console.log(`Built static production assets in ${destination}`);
