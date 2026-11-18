#!/usr/bin/env node
/**
 * Sync ./data <-> named volume dante-florens-data
 * Usage: node scripts/docker-data-sync.js push|pull
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const volume = "dante-florens-data";
const mode = process.argv[2];

if (mode !== "push" && mode !== "pull") {
  console.error("Usage: node scripts/docker-data-sync.js push|pull");
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

fs.mkdirSync(dataDir, { recursive: true });
run("docker", ["volume", "create", volume], { stdio: "pipe" });

const seedMount = mode === "push" ? `${dataDir}:/seed:ro` : `${dataDir}:/seed`;
const script =
  mode === "push"
    ? "cd /seed && tar cf - . | tar xpf - -C /data"
    : "cd /data && tar cf - . | tar xpf - -C /seed";

run("docker", [
  "run",
  "--rm",
  "-v",
  `${volume}:/data`,
  "-v",
  seedMount,
  "alpine:3.20",
  "sh",
  "-c",
  script,
]);

console.log(mode === "push" ? `OK: ./data → volume ${volume}` : `OK: volume ${volume} → ./data`);
