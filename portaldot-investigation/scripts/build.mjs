import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "public");
const destination = join(root, "dist");

if (destination === root || !destination.startsWith(`${root}\\`) && !destination.startsWith(`${root}/`)) {
  throw new Error("Refusing to clean a build directory outside the FIRMA application root.");
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Built static production assets in ${destination}`);

