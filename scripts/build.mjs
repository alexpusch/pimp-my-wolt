import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

if (manifest.version !== packageJson.version) {
  throw new Error("package.json and manifest.json versions must match");
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("assets", "dist/assets", { recursive: true });
await cp("src", "dist/src", { recursive: true });
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
await build({
  bundle: true,
  entryPoints: ["src/pimp-my-cibus.js"],
  format: "iife",
  outfile: "dist/src/pimp-my-cibus.js",
  platform: "browser",
  target: ["chrome120"],
});