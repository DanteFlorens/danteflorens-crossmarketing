import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

export const COLLECTIONS = [
  "businesses",
  "clients",
  "payments",
  "deals",
  "waves",
  "sessions",
  "journal",
  "claims",
  "guests",
  "guestSessions",
  "passports",
  "gifts",
  "bundles",
  "coupons",
  "leadLedger",
  "cashierTokens",
  "overloadSlots",
  "handoffs",
  "pactBans",
];

const EMPTY_FAKEL = { sessions: {}, improvements: [], prefs: {} };

export function openSqlite(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      business_id TEXT,
      payload TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_docs_collection ON docs(collection);
    CREATE INDEX IF NOT EXISTS idx_docs_business ON docs(collection, business_id);
  `);
  return db;
}

export function metaGet(db, key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function metaSet(db, key, value) {
  db.prepare(
    "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, String(value));
}

export function docId(collection, item, index = 0) {
  if (item?.id) return String(item.id);
  if (item?.token) return String(item.token);
  return `${collection}-anon-${index}`;
}

export function businessKey(item) {
  if (!item || typeof item !== "object") return null;
  if (item.businessId) return String(item.businessId);
  return null;
}

export function emptyWorld() {
  const world = {
    version: 1,
    fakel: { ...EMPTY_FAKEL, sessions: {}, improvements: [], prefs: {} },
  };
  for (const name of COLLECTIONS) world[name] = [];
  return world;
}

export function normalizeWorld(raw) {
  const world = emptyWorld();
  if (!raw || typeof raw !== "object") return world;
  world.version = Number(raw.version) || 1;
  world.fakel = {
    sessions: raw.fakel?.sessions && typeof raw.fakel.sessions === "object" ? raw.fakel.sessions : {},
    improvements: Array.isArray(raw.fakel?.improvements) ? raw.fakel.improvements : [],
    prefs: raw.fakel?.prefs && typeof raw.fakel.prefs === "object" ? raw.fakel.prefs : {},
  };
  for (const name of COLLECTIONS) {
    world[name] = Array.isArray(raw[name]) ? raw[name] : [];
  }
  return world;
}

export function isSqliteEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM docs").get().n;
  const version = metaGet(db, "version");
  return count === 0 && !version;
}

export function readWriteSeq(db) {
  return Number(metaGet(db, "writeSeq") || 0);
}

export function readWorld(db) {
  const world = emptyWorld();
  world.version = Number(metaGet(db, "version") || 1);
  const fakelRaw = metaGet(db, "fakel");
  if (fakelRaw) {
    try {
      world.fakel = normalizeWorld({ fakel: JSON.parse(fakelRaw) }).fakel;
    } catch {
      world.fakel = emptyWorld().fakel;
    }
  }
  const rows = db.prepare("SELECT collection, payload FROM docs").all();
  for (const row of rows) {
    if (!COLLECTIONS.includes(row.collection)) continue;
    try {
      world[row.collection].push(JSON.parse(row.payload));
    } catch {
      // skip broken row; persist will rewrite clean state
    }
  }
  world._writeSeq = readWriteSeq(db);
  return world;
}

/**
 * Инкрементальная запись: удаляет только исчезнувшие id,
 * пишет/обновляет изменившиеся payload, нетронутые строки пропускает.
 * Опционально проверяет writeSeq (оптимистичная блокировка между процессами).
 */
export function writeWorld(db, raw, options = {}) {
  const world = normalizeWorld(raw);
  const expectedSeq = raw && Object.prototype.hasOwnProperty.call(raw, "_writeSeq")
    ? Number(raw._writeSeq)
    : null;
  const force = Boolean(options.force);

  const selectIds = db.prepare("SELECT id, payload FROM docs WHERE collection = ?");
  const deleteOne = db.prepare("DELETE FROM docs WHERE collection = ? AND id = ?");
  const upsert = db.prepare(
    "INSERT INTO docs(collection, id, business_id, payload) VALUES(?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET business_id = excluded.business_id, payload = excluded.payload",
  );

  const stats = {
    removed: 0,
    written: 0,
    skipped: 0,
    writeSeq: 0,
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    const diskSeq = readWriteSeq(db);
    if (!force && expectedSeq !== null && Number.isFinite(expectedSeq) && expectedSeq !== diskSeq) {
      const error = new Error(
        `Конфликт записи sqlite: memory writeSeq=${expectedSeq}, disk writeSeq=${diskSeq}. Перезагрузите контур.`,
      );
      error.code = "SQLITE_WRITE_CONFLICT";
      error.expectedSeq = expectedSeq;
      error.diskSeq = diskSeq;
      throw error;
    }

    for (const collection of COLLECTIONS) {
      const rows = selectIds.all(collection);
      const diskMap = new Map(rows.map((row) => [String(row.id), row.payload]));
      const wanted = new Set();
      let index = 0;
      for (const item of world[collection]) {
        const id = docId(collection, item, index);
        index += 1;
        if (wanted.has(id)) {
          const error = new Error(`Дубль id в ${collection}: ${id}`);
          error.code = "SQLITE_DUPLICATE_ID";
          throw error;
        }
        wanted.add(id);
        const payload = JSON.stringify(item);
        const prev = diskMap.get(id);
        if (prev === payload) {
          stats.skipped += 1;
          continue;
        }
        upsert.run(collection, id, businessKey(item), payload);
        stats.written += 1;
      }
      for (const id of diskMap.keys()) {
        if (wanted.has(id)) continue;
        deleteOne.run(collection, id);
        stats.removed += 1;
      }
    }

    const dirty = stats.written > 0 || stats.removed > 0;
    const fakelRaw = JSON.stringify(world.fakel);
    const fakelChanged = fakelRaw !== (metaGet(db, "fakel") || "");
    const nextSeq = dirty || fakelChanged ? diskSeq + 1 : diskSeq;
    stats.writeSeq = nextSeq;
    stats.noop = !dirty && !fakelChanged;
    metaSet(db, "version", String(world.version || 1));
    metaSet(db, "engine", "sqlite");
    metaSet(db, "mode", "incremental");
    if (fakelChanged) metaSet(db, "fakel", fakelRaw);
    if (!stats.noop) metaSet(db, "savedAt", new Date().toISOString());
    if (nextSeq !== diskSeq) metaSet(db, "writeSeq", String(nextSeq));
    metaSet(db, "lastWriteStats", JSON.stringify(stats));
    db.exec("COMMIT");
    world._writeSeq = nextSeq;
    world._lastWriteStats = stats;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
  return world;
}

export function checkpoint(db, mode = "PASSIVE") {
  try {
    db.exec(`PRAGMA wal_checkpoint(${mode});`);
  } catch {
    /* optional */
  }
}

export function statusOf(db, file) {
  const counts = {};
  for (const collection of COLLECTIONS) {
    counts[collection] = db
      .prepare("SELECT COUNT(*) AS n FROM docs WHERE collection = ?")
      .get(collection).n;
  }
  let lastWriteStats = null;
  const rawStats = metaGet(db, "lastWriteStats");
  if (rawStats) {
    try {
      lastWriteStats = JSON.parse(rawStats);
    } catch {
      lastWriteStats = null;
    }
  }
  return {
    file,
    engine: metaGet(db, "engine") || "sqlite",
    mode: metaGet(db, "mode") || "legacy",
    version: Number(metaGet(db, "version") || 1),
    writeSeq: readWriteSeq(db),
    savedAt: metaGet(db, "savedAt"),
    counts,
    docs: db.prepare("SELECT COUNT(*) AS n FROM docs").get().n,
    lastWriteStats,
  };
}
