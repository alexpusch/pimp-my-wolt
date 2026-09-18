import { access, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";

await access("dist/manifest.json");
await rm("pimp-my-wolt.zip", { force: true });
const archive = spawn("zip", ["-r", "../pimp-my-wolt.zip", "."], { cwd: "dist", stdio: "inherit" });
const [exitCode] = await once(archive, "close");
if (exitCode !== 0) throw new Error("Failed to create extension archive");