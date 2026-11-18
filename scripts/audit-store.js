import assert from "node:assert/strict";
import fs from "fs";
import { closeStore, dbStatus, load, newId, paths, resetMemory, save } from "../lib/store.js";
import { COLLECTIONS, openSqlite, readWorld, writeWorld } from "../lib/sqlite.js";

const out = { ok: [], warn: [], fail: [] };
const mark = (bucket, id, detail) => out[bucket].push({ id, detail });

resetMemory();
closeStore();

// 1) integrity + mode
{
  const db = openSqlite(paths().sqliteFile);
  const integrity = Object.values(db.prepare("PRAGMA integrity_check").get())[0];
  const journal = String(Object.values(db.prepare("PRAGMA journal_mode").get())[0]).toLowerCase();
  const busy = Object.values(db.prepare("PRAGMA busy_timeout").get())[0];
  db.close();
  if (integrity === "ok") mark("ok", "integrity", integrity);
  else mark("fail", "integrity", integrity);
  if (journal === "wal") mark("ok", "wal", journal);
  else mark("fail", "wal", journal);
  if (Number(busy) >= 5000) mark("ok", "busy_timeout", String(busy));
  else mark("warn", "busy_timeout", String(busy));
}

// 2) incremental noop / dirty / remove
{
  resetMemory();
  closeStore();
  const world = load();
  const idle = save();
  if (idle?.noop === true && idle.written === 0 && idle.skipped > 0) {
    mark("ok", "incremental_noop", `skipped=${idle.skipped}`);
  } else mark("fail", "incremental_noop", JSON.stringify(idle));

  const id = newId("audit");
  world.journal.push({
    id,
    waveId: "audit",
    businessId: "x",
    contact: "audit@x",
    name: "audit",
    subject: "audit",
    at: new Date().toISOString(),
    status: "journal",
  });
  const dirty = save();
  if (dirty?.written === 1 && dirty.noop === false) mark("ok", "incremental_write", `written=1 seq=${dirty.writeSeq}`);
  else mark("fail", "incremental_write", JSON.stringify(dirty));

  world.journal = world.journal.filter((item) => item.id !== id);
  const gone = save();
  if (gone?.removed === 1) mark("ok", "incremental_remove", "removed=1");
  else mark("fail", "incremental_remove", JSON.stringify(gone));
  closeStore();
}

// 3) mem == disk after reload
{
  resetMemory();
  closeStore();
  const mem = load();
  const disk = readWorld(openSqlite(paths().sqliteFile));
  let match = true;
  for (const name of COLLECTIONS) {
    if ((mem[name] || []).length !== (disk[name] || []).length) match = false;
  }
  if (match && mem._writeSeq === disk._writeSeq) mark("ok", "mem_disk", `seq=${mem._writeSeq} docs=${dbStatus().docs}`);
  else mark("fail", "mem_disk", JSON.stringify({ memSeq: mem._writeSeq, diskSeq: disk._writeSeq }));
  closeStore();
}

// 4) duplicate id rolls back
{
  const tmp = `${paths().dataDir}/audit-dup.sqlite`;
  for (const s of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(tmp + s, { force: true });
    } catch {
      /* ignore */
    }
  }
  const db = openSqlite(tmp);
  writeWorld(db, {
    version: 1,
    businesses: [{ id: "keep", name: "Keep" }],
    clients: [],
    payments: [],
    deals: [],
    waves: [],
    sessions: [],
    journal: [],
    claims: [],
    guests: [],
    guestSessions: [],
    fakel: { sessions: {}, improvements: [], prefs: {} },
  }, { force: true });
  let threw = false;
  try {
    writeWorld(db, {
      version: 1,
      businesses: [
        { id: "dup", name: "A" },
        { id: "dup", name: "B" },
      ],
      clients: [],
      payments: [],
      deals: [],
      waves: [],
      sessions: [],
      journal: [],
      claims: [],
      guests: [],
      guestSessions: [],
      fakel: { sessions: {}, improvements: [], prefs: {} },
    }, { force: true });
  } catch (error) {
    threw = error.code === "SQLITE_DUPLICATE_ID";
  }
  const kept = readWorld(db).businesses.map((item) => item.id);
  db.close();
  for (const s of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(tmp + s, { force: true });
    } catch {
      /* ignore */
    }
  }
  if (threw && kept.length === 1 && kept[0] === "keep") mark("ok", "dup_rollback", "keep intact");
  else mark("fail", "dup_rollback", JSON.stringify({ threw, kept }));
}

// 5) store.json still fully present in sqlite
{
  const json = JSON.parse(fs.readFileSync(paths().storeFile, "utf8"));
  resetMemory();
  closeStore();
  const world = load();
  let missing = 0;
  for (const name of COLLECTIONS) {
    const ids = new Set((world[name] || []).map((item) => item.id || item.token));
    for (const item of json[name] || []) {
      const id = item.id || item.token;
      if (!ids.has(id)) missing += 1;
    }
  }
  if (missing === 0) mark("ok", "migration_intact", "все id из store.json есть в sqlite");
  else mark("fail", "migration_intact", `missing=${missing}`);
  closeStore();
}

// 6) conflict rebase is LWW (honest)
{
  resetMemory();
  closeStore();
  const a = load();
  const seq = a._writeSeq;
  closeStore();

  resetMemory();
  const b = load();
  const bId = newId("race-b");
  b.journal.push({
    id: bId,
    waveId: "audit-race",
    businessId: "x",
    contact: "b@race",
    name: "b",
    subject: "b",
    at: new Date().toISOString(),
    status: "journal",
  });
  const bSave = save();
  closeStore();

  // stale A with old seq tries to save via store.save rebase path
  resetMemory();
  const stale = load();
  // craft stale seq artificially
  stale._writeSeq = seq;
  const aId = newId("race-a");
  stale.journal = (stale.journal || []).filter((item) => item.waveId !== "audit-race");
  stale.journal.push({
    id: aId,
    waveId: "audit-race",
    businessId: "x",
    contact: "a@race",
    name: "a",
    subject: "a",
    at: new Date().toISOString(),
    status: "journal",
  });
  // remove b's entry from stale view to simulate stale snapshot
  stale.journal = stale.journal.filter((item) => item.id !== bId);
  const aSave = save();
  const races = (stale.journal || []).filter((item) => item.waveId === "audit-race");
  // cleanup
  stale.journal = stale.journal.filter((item) => item.waveId !== "audit-race");
  save();
  closeStore();

  if (aSave?.conflict || aSave?.rebased || aSave?.writeSeq > bSave?.writeSeq) {
    mark(
      "warn",
      "conflict_rebase_lww",
      `rebase работает, но это LWW: после stale save записей audit-race=${races.length} (b может быть затёрт)`,
    );
  } else {
    mark("ok", "conflict_path", JSON.stringify({ aSave, bSave, races: races.length }));
  }
}

const status = dbStatus();
closeStore();

const summary = {
  passed: out.ok.length,
  warnings: out.warn.length,
  failed: out.fail.length,
  ok: out.ok,
  warn: out.warn,
  fail: out.fail,
  status: {
    mode: status.mode,
    writeSeq: status.writeSeq,
    docs: status.docs,
    lastWriteStats: status.lastWriteStats,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (out.fail.length) {
  process.exitCode = 1;
  console.log("audit-store FAILED");
} else {
  console.log("audit-store ok");
}
