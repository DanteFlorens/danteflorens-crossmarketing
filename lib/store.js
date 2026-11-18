import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildWorld } from "./seed.js";
import {
  checkpoint,
  isSqliteEmpty,
  normalizeWorld,
  openSqlite,
  readWorld,
  statusOf,
  writeWorld,
} from "./sqlite.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const storeFile = path.join(dataDir, "store.json");
const sqliteFile = path.join(dataDir, "florens.sqlite");
const legacyDbFile = path.join(dataDir, "florens.db");
const keyFile = path.join(dataDir, "house-key.txt");

const MIRROR = process.env.FLORENS_MIRROR === "1";
const CHECKPOINT_EVERY = 25;

let memory = null;
let sqlite = null;
let savesSinceCheckpoint = 0;

export function paths() {
  return { root, dataDir, storeFile, sqliteFile, dbFile: sqliteFile, keyFile };
}

function ensureKey() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(keyFile)) {
    const key = `DF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    fs.writeFileSync(keyFile, `${key}\n`, "utf8");
  }
}

function db() {
  if (!sqlite) sqlite = openSqlite(sqliteFile);
  return sqlite;
}

function writeMirror(world) {
  if (!MIRROR) return;
  const mirror = `${storeFile}.mirror`;
  const tmp = `${mirror}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(world, null, 2), "utf8");
  fs.copyFileSync(tmp, mirror);
  fs.rmSync(tmp, { force: true });
}

function persist(world, options = {}) {
  const written = writeWorld(db(), world, options);
  // коллекции — те же массивы (normalizeWorld не клонирует rows);
  // обновляем seq на живом объекте, которым пользуется server.js
  world._writeSeq = written._writeSeq;
  world._lastWriteStats = written._lastWriteStats;
  memory = world;
  writeMirror(memory);
  savesSinceCheckpoint += 1;
  if (savesSinceCheckpoint >= CHECKPOINT_EVERY) {
    checkpoint(db(), "PASSIVE");
    savesSinceCheckpoint = 0;
  }
  return memory;
}

function migrateFromJson(database) {
  if (!fs.existsSync(storeFile)) return false;
  const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  writeWorld(database, raw, { force: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(dataDir, `store.json.bak-before-sqlite-${stamp}`);
  try {
    fs.copyFileSync(storeFile, backup);
  } catch {
    /* optional */
  }
  fs.writeFileSync(
    path.join(dataDir, "sqlite-migrated.txt"),
    `migratedAt=${new Date().toISOString()}\nfrom=${storeFile}\nbackup=${backup}\n`,
    "utf8",
  );
  return true;
}

function migrateFromLegacyDb(database) {
  if (!fs.existsSync(legacyDbFile)) return false;
  try {
    const legacy = openSqlite(legacyDbFile);
    if (isSqliteEmpty(legacy)) {
      legacy.close();
      return false;
    }
    const hasDoc = legacy.prepare("PRAGMA table_info(docs)").all().some((col) => col.name === "doc");
    if (!hasDoc) {
      const world = readWorld(legacy);
      legacy.close();
      writeWorld(database, world, { force: true });
      return true;
    }
    const world = normalizeWorld({});
    world.version = Number(
      legacy.prepare("SELECT value FROM meta WHERE key = ?").get("version")?.value || 1,
    );
    const fakelRaw = legacy.prepare("SELECT value FROM meta WHERE key = ?").get("fakel")?.value;
    if (fakelRaw) {
      try {
        world.fakel = normalizeWorld({ fakel: JSON.parse(fakelRaw) }).fakel;
      } catch {
        /* default */
      }
    }
    const rows = legacy.prepare("SELECT collection, doc FROM docs").all();
    for (const row of rows) {
      if (!world[row.collection]) continue;
      try {
        world[row.collection].push(JSON.parse(row.doc));
      } catch {
        /* skip */
      }
    }
    legacy.close();
    writeWorld(database, world, { force: true });
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.renameSync(legacyDbFile, path.join(dataDir, `florens.db.legacy-${stamp}`));
    } catch {
      /* keep legacy file if rename fails */
    }
    return true;
  } catch {
    return false;
  }
}

export function load() {
  if (memory) return memory;
  ensureKey();
  const database = db();
  if (isSqliteEmpty(database)) {
    if (!migrateFromJson(database) && !migrateFromLegacyDb(database)) {
      memory = normalizeWorld(buildWorld());
      return persist(memory, { force: true });
    }
  }
  memory = readWorld(database);
  return memory;
}

function statsOf() {
  const stats = memory?._lastWriteStats || {
    written: 0,
    skipped: 0,
    removed: 0,
    writeSeq: memory?._writeSeq || 0,
    noop: true,
  };
  return {
    ...stats,
    noop: Boolean(stats.noop ?? (Number(stats.written || 0) === 0 && Number(stats.removed || 0) === 0)),
    mode: "incremental",
  };
}

export function save() {
  if (!memory) return null;
  try {
    persist(memory);
    return statsOf();
  } catch (error) {
    if (error?.code === "SQLITE_WRITE_CONFLICT") {
      // Один живой контур в памяти — rebase seq и пишем ещё раз (LWW этого процесса).
      memory._writeSeq = Number(error.diskSeq);
      persist(memory, { force: true });
      return { ...statsOf(), rebased: true, conflict: true };
    }
    throw error;
  }
}

export function houseKey() {
  load();
  return fs.readFileSync(keyFile, "utf8").trim();
}

export function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

export function dbStatus() {
  ensureKey();
  return statusOf(db(), sqliteFile);
}

export function resetMemory() {
  memory = null;
}

export function closeStore() {
  if (sqlite) {
    try {
      checkpoint(sqlite, "TRUNCATE");
      sqlite.close();
    } catch {
      try {
        checkpoint(sqlite, "PASSIVE");
        sqlite.close();
      } catch {
        /* already closed */
      }
    }
  }
  sqlite = null;
  memory = null;
  savesSinceCheckpoint = 0;
}
