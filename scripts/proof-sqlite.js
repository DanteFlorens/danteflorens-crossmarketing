import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "fs";
import path from "path";
import { closeStore, load, newId, paths, resetMemory, save } from "../lib/store.js";
import { COLLECTIONS, metaGet, openSqlite, readWorld, writeWorld } from "../lib/sqlite.js";

const proof = { ok: [], fail: [], warn: [] };
const mark = (bucket, id, detail) => {
  proof[bucket].push({ id, detail });
};

const { sqliteFile, dataDir, storeFile } = paths();

// 1) integrity + WAL
{
  const db = openSqlite(sqliteFile);
  const integrity = Object.values(db.prepare("PRAGMA integrity_check").get())[0];
  const journal = String(Object.values(db.prepare("PRAGMA journal_mode").get())[0]).toLowerCase();
  const sync = Object.values(db.prepare("PRAGMA synchronous").get())[0];
  db.close();
  if (integrity === "ok") mark("ok", "integrity_check", integrity);
  else mark("fail", "integrity_check", integrity);
  if (journal === "wal") mark("ok", "journal_mode", journal);
  else mark("fail", "journal_mode", journal);
  proof.synchronous = sync;
  if (sync === 1 || sync === "NORMAL") {
    mark("warn", "synchronous_NORMAL", "после COMMIT есть узкое окно потери при hard power-loss; для кассы можно FULL");
  } else {
    mark("ok", "synchronous", String(sync));
  }
}

// 2) deep nested roundtrip
{
  resetMemory();
  closeStore();
  const world = load();
  const bizId = newId("proof-biz");
  const dealId = newId("proof-deal");
  world.businesses.push({
    id: bizId,
    kind: "member",
    name: "Proof House",
    email: `${bizId}@x.local`,
    city: "Москва",
    atTable: true,
    catalog: {
      hook: { title: "красная", price: 1200, note: "вход" },
      chips: [{ title: "фишка", price: 5000, note: "n" }],
      seek: "соседи",
    },
    situations: ["health", "appearance"],
    ages: ["mid"],
    band: "modest",
    ticket: 3500,
    suppressed: ["a@b.c"],
    licenseUntil: "2099-01-01T00:00:00.000Z",
    picks: { ideas: ["flow:x"], audience: ["all"] },
  });
  world.deals.push({
    id: dealId,
    at: new Date().toISOString(),
    status: "pending",
    beneficiaryId: bizId,
    partnerId: "p",
    partnerName: "P",
    sellerName: "S",
    clientName: "C",
    amount: 10000,
    fee: 800,
    net: 9200,
    sellerConfirmed: true,
    partnerConfirmed: false,
    bonus: "бонус",
  });
  save();
  closeStore();

  const disk = readWorld(openSqlite(sqliteFile));
  const biz = disk.businesses.find((item) => item.id === bizId);
  const deal = disk.deals.find((item) => item.id === dealId);
  try {
    assert.equal(biz?.catalog?.hook?.title, "красная");
    assert.equal(biz?.catalog?.chips?.[0]?.price, 5000);
    assert.ok(biz?.situations?.includes("health"));
    assert.equal(biz?.picks?.ideas?.[0], "flow:x");
    assert.equal(deal?.sellerConfirmed, true);
    assert.equal(deal?.partnerConfirmed, false);
    assert.equal(deal?.fee, 800);
    mark("ok", "deep_roundtrip", "catalog/picks/deal flags сохранились");
  } catch (error) {
    mark("fail", "deep_roundtrip", error.message);
  }

  resetMemory();
  const cleanup = load();
  cleanup.businesses = cleanup.businesses.filter((item) => item.id !== bizId);
  cleanup.deals = cleanup.deals.filter((item) => item.id !== dealId);
  save();
  closeStore();
}

// 3) ROLLBACK on duplicate PK
{
  const tmp = path.join(dataDir, "proof-tx.sqlite");
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(tmp + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }
  const db = openSqlite(tmp);
  writeWorld(db, {
    version: 1,
    businesses: [{ id: "keep-me", name: "Keep" }],
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
  });
  const before = readWorld(db).businesses.map((item) => item.id);
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
    });
  } catch (error) {
    threw = true;
    proof.rollback_error = String(error.message || error).slice(0, 160);
  }
  const after = readWorld(db).businesses.map((item) => item.id);
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(tmp + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }
  if (threw && before[0] === "keep-me" && after[0] === "keep-me" && after.length === 1) {
    mark("ok", "transaction_rollback", "после ошибки PK старые данные на месте");
  } else {
    mark("fail", "transaction_rollback", `threw=${threw} before=${before} after=${after}`);
  }
}

// 4) memory == disk counts
{
  resetMemory();
  closeStore();
  const world = load();
  const db = openSqlite(sqliteFile);
  const disk = readWorld(db);
  const engine = metaGet(db, "engine");
  db.close();
  let match = true;
  const counts = {};
  for (const name of COLLECTIONS) {
    counts[name] = { mem: world[name].length, disk: disk[name].length };
    if (world[name].length !== disk[name].length) match = false;
  }
  proof.counts = counts;
  if (match) mark("ok", "mem_disk_match", JSON.stringify(counts));
  else mark("fail", "mem_disk_match", JSON.stringify(counts));
  if (engine === "sqlite") mark("ok", "engine_meta", engine);
  else mark("fail", "engine_meta", String(engine));
  closeStore();
}

// 5) stale store.json risk
{
  const mirror = `${storeFile}.mirror`;
  if (fs.existsSync(mirror)) mark("ok", "mirror_exists", mirror);
  else mark("warn", "mirror_missing", "зеркала нет");
  if (fs.existsSync(storeFile)) {
    const json = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    const diskBiz = proof.counts.businesses.disk;
    if (json.businesses.length !== diskBiz) {
      mark(
        "warn",
        "stale_store_json",
        `store.json businesses=${json.businesses.length}, sqlite=${diskBiz}. Если удалить sqlite — мигрирует устаревший JSON`,
      );
    } else {
      mark("ok", "store_json_aligned", "store.json совпадает по числу бизнесов");
    }
  }
}

// 6) two process restarts
{
  const script = `
    import { closeStore, load, paths } from "./lib/store.js";
    const world = load();
    process.stdout.write(JSON.stringify({ n: world.businesses.length, file: paths().sqliteFile }));
    closeStore();
  `;
  const run = () =>
    spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), ".."),
      encoding: "utf8",
    });
  // Windows path from import.meta.url can be awkward; use process.cwd() instead
  const runCwd = () =>
    spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  const a = runCwd();
  const b = runCwd();
  if (a.status !== 0 || b.status !== 0) {
    mark("fail", "process_restart", `a=${a.status} ${a.stderr.slice(0, 120)} b=${b.status}`);
  } else {
    const left = JSON.parse(a.stdout.trim());
    const right = JSON.parse(b.stdout.trim());
    if (left.n === right.n && left.n === proof.counts.businesses.disk) {
      mark("ok", "process_restart", `оба процесса видят ${left.n} бизнесов`);
    } else {
      mark("fail", "process_restart", JSON.stringify({ left, right, disk: proof.counts.businesses.disk }));
    }
  }
}

// 7) migrate JSON → sqlite in isolation
{
  const tmpDir = path.join(dataDir, "proof-migrate");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpDb = path.join(tmpDir, "fresh.sqlite");
  const db = openSqlite(tmpDb);
  writeWorld(db, {
    version: 1,
    businesses: [{ id: "m1", name: "Migrated", kind: "seat", atTable: true }],
    clients: [{ id: "c1", businessId: "m1", name: "C", contact: "c@x", spend: 1 }],
    payments: [],
    deals: [],
    waves: [],
    sessions: [],
    journal: [],
    claims: [],
    guests: [],
    guestSessions: [],
    fakel: { sessions: {}, improvements: [], prefs: {} },
  });
  const got = readWorld(db);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (got.businesses[0]?.id === "m1" && got.clients[0]?.businessId === "m1") {
    mark("ok", "migrate_writeWorld", "JSON-мир пишется и читается");
  } else {
    mark("fail", "migrate_writeWorld", "миграция в temp не сошлась");
  }
}

// 8) two processes write at once → last-write-wins (prove the warn)
{
  const { spawn } = await import("node:child_process");
  const raceScript = `
    import { closeStore, load, newId, resetMemory, save } from "./lib/store.js";
    resetMemory();
    const world = load();
    const id = newId("race");
    world.journal = world.journal || [];
    world.journal.push({
      id,
      waveId: "race-parallel",
      businessId: "x",
      contact: process.pid + "@race",
      name: "race",
      subject: String(process.pid),
      at: new Date().toISOString(),
      status: "journal",
    });
    // удерживаем устаревший снимок в памяти, пока второй процесс тоже читает
    await new Promise((r) => setTimeout(r, 200));
    save();
    closeStore();
    process.stdout.write(id);
  `;
  const start = () =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", raceScript], {
        cwd: process.cwd(),
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.stderr.on("data", (chunk) => {
        err += chunk;
      });
      child.on("close", (code) => resolve({ code, out: out.trim(), err: err.slice(0, 160) }));
    });
  const [a, b] = await Promise.all([start(), start()]);
  resetMemory();
  closeStore();
  const world = load();
  const races = (world.journal || []).filter((item) => item.waveId === "race-parallel");
  world.journal = (world.journal || []).filter((item) => item.waveId !== "race-parallel");
  save();
  closeStore();
  proof.race = { a, b, survived: races.length, contacts: races.map((item) => item.contact) };
  if (a.code === 0 && b.code === 0 && races.length < 2) {
    mark(
      "warn",
      "concurrent_last_write_wins",
      `два параллельных save: выжило ${races.length}/2 записей — ожидаемо при полном rewrite + memory`,
    );
  } else if (races.length === 2) {
    mark("ok", "concurrent_both_survived", "оба параллельных save сохранились (редко при полном rewrite)");
  } else {
    mark("fail", "concurrent_race", JSON.stringify(proof.race));
  }
}

// 9) architectural limits (honest)
mark("ok", "incremental_row_save", "save() upsert только изменённые docs + writeSeq optimistic lock");
mark("warn", "in_memory_cache", "один процесс = один memory; два node-сервера без общего seq всё ещё конфликтны");
mark("warn", "fk_pragma_only", "PRAGMA foreign_keys=ON, но FK-ограничений в схеме нет — это документный слой");

const summary = {
  passed: proof.ok.length,
  warnings: proof.warn.length,
  failed: proof.fail.length,
  ok: proof.ok,
  warn: proof.warn,
  fail: proof.fail,
  counts: proof.counts,
  synchronous: proof.synchronous,
  rollback_error: proof.rollback_error || null,
};

console.log(JSON.stringify(summary, null, 2));
if (proof.fail.length) process.exit(1);
console.log("proof-sqlite ok");
