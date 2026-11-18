import fs from "fs";
import { spawnSync } from "node:child_process";
import { closeStore, dbStatus, load, paths, resetMemory, save } from "../lib/store.js";
import { metaGet, openSqlite, readWorld } from "../lib/sqlite.js";

const base = process.argv[2] || "http://127.0.0.1:4177";
const checks = [];
function pass(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

async function call(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, d: data };
}

function run(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    script,
    code: result.status,
    ok: result.status === 0,
    tail: String(result.stdout || "").trim().split(/\r?\n/).slice(-3).join(" | "),
    err: String(result.stderr || "").trim().slice(0, 240),
  };
}

// --- unit/scripts ---
for (const script of [
  "scripts/selfcheck.js",
  "scripts/db-scale.js",
  "scripts/db-roundtrip.js",
  "scripts/proof-exchange.js",
]) {
  const result = run(script);
  pass(`script:${script}`, result.ok, result);
}

// --- sqlite integrity ---
{
  const file = paths().sqliteFile;
  const db = openSqlite(file);
  const integrity = Object.values(db.prepare("PRAGMA integrity_check").get())[0];
  const journal = String(Object.values(db.prepare("PRAGMA journal_mode").get())[0]).toLowerCase();
  const mode = metaGet(db, "mode");
  const engine = metaGet(db, "engine");
  const world = readWorld(db);
  const dups = db
    .prepare("SELECT collection, id, COUNT(*) AS n FROM docs GROUP BY collection, id HAVING n > 1")
    .all();
  pass("sqlite_file", fs.existsSync(file), { file, bytes: fs.statSync(file).size });
  pass("integrity_check", integrity === "ok", integrity);
  pass("wal_mode", journal === "wal", journal);
  pass("mode_incremental", mode === "incremental", { mode, engine });
  pass("no_dup_ids", dups.length === 0, dups.slice(0, 5));
  pass("has_seed_seats", world.businesses.filter((item) => item.kind === "seat").length >= 18, {
    seats: world.businesses.filter((item) => item.kind === "seat").length,
    members: world.businesses.filter((item) => item.kind === "member").length,
  });
  db.close();
}

// --- incremental save behavior in this process ---
{
  resetMemory();
  closeStore();
  load();
  const idle = save();
  pass("idle_noop", idle?.noop === true && idle.written === 0, idle);
  const world = load();
  const id = `proof-all-${Date.now()}`;
  world.journal.push({
    id,
    businessId: "proof-all",
    contact: "proof-all@contour.local",
    name: "proof",
    subject: "proof-all",
    at: new Date().toISOString(),
    status: "journal",
  });
  const dirty = save();
  pass("dirty_writes_one", dirty?.written === 1 && dirty.noop === false, dirty);
  world.journal = world.journal.filter((item) => item.id !== id);
  const revert = save();
  pass("revert_removes_one", revert?.removed === 1, revert);
  closeStore();
}

// --- live API exchange holes ---
{
  const stamp = Date.now();
  const health = await call("/api/health");
  pass("server_up", health.ok && health.d.ok, health.d);

  const regA = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Надёжность А",
      owner: "A",
      email: `rel-a-${stamp}@contour.local`,
      phone: "+79001112201",
      city: "Казань",
      ticket: 40000,
      craft: "ритуальная мастерская урн",
      about: "дом памяти",
      offer: "урна",
      benefit: "x",
    }),
  });
  const regB = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Надёжность Б",
      owner: "B",
      email: `rel-b-${stamp}@contour.local`,
      phone: "+79001112202",
      city: "Казань",
      ticket: 8000,
      craft: "флорист букеты и цветы",
      about: "цветы к ритуалу",
      offer: "букет",
      benefit: "x",
    }),
  });
  const hA = { "Content-Type": "application/json", "X-Florens-Token": regA.d.token };
  const hB = { "Content-Type": "application/json", "X-Florens-Token": regB.d.token };
  await call("/api/pay", { method: "POST", headers: hA, body: JSON.stringify({ seat: "house" }) });
  await call("/api/pay", { method: "POST", headers: hB, body: JSON.stringify({ seat: "house" }) });
  const contact = `rel-${stamp}@contour.local`;
  await call("/api/clients", {
    method: "POST",
    headers: hA,
    body: JSON.stringify({
      csv: `имя,контакт,заметка,траты,город\nАлия,aliya-rel-${stamp}@contour.local,нужны цветы,20000,Казань`,
      attest: true,
    }),
  });
  await call("/api/clients", {
    method: "POST",
    headers: hB,
    body: JSON.stringify({
      csv: `имя,контакт,заметка,траты,город\nМарат,${contact},букет к ритуалу,15000,Казань`,
      attest: true,
    }),
  });

  const morning = await call("/api/morning", { headers: hA });
  const leaks = [];
  for (const link of morning.d.preview?.links || []) {
    for (const letter of link.returnLetters || []) {
      if (letter.contact) leaks.push(letter.contact);
      if (letter.clientName && letter.clientName !== "клиент партнёра") leaks.push(letter.clientName);
    }
  }
  pass("no_pii_returnLetters", leaks.length === 0, { leaks: leaks.slice(0, 5) });
  pass(
    "member_letter_preferred",
    (morning.d.preview?.letters || []).some((letter) => letter.partnerName === "Надёжность Б"),
    { first: morning.d.preview?.letters?.[0]?.partnerName },
  );

  const fake = await call("/api/deals", {
    method: "POST",
    headers: hA,
    body: JSON.stringify({ partnerId: regB.d.me.id, amount: 100, clientName: "Вымышленный" }),
  });
  pass("fake_client_blocked", !fake.ok && fake.status === 400, { status: fake.status, err: fake.d.error });

  const real = await call("/api/deals", {
    method: "POST",
    headers: hA,
    body: JSON.stringify({
      partnerId: regB.d.me.id,
      amount: 10000,
      clientName: "Марат",
      clientContact: contact,
    }),
  });
  pass("real_deal_pending", real.ok && real.d.deal?.status === "pending" && real.d.me?.books?.nets === 0, {
    id: real.d.deal?.id,
    nets: real.d.me?.books?.nets,
  });

  const conf = await call("/api/deals/confirm", {
    method: "POST",
    headers: hB,
    body: JSON.stringify({ dealId: real.d.deal.id }),
  });
  pass("mutual_confirm_locked", conf.d.deal?.status === "confirmed" && conf.d.deal?.amountLocked === true, {
    status: conf.d.deal?.status,
    locked: conf.d.deal?.amountLocked,
  });

  const rewrite = await call("/api/deals/confirm", {
    method: "POST",
    headers: hA,
    body: JSON.stringify({ dealId: real.d.deal.id, amount: 999999 }),
  });
  pass("rewrite_blocked", !rewrite.ok && rewrite.status === 400, {
    status: rewrite.status,
    err: rewrite.d.error,
  });

  const me = await call("/api/me", { headers: hA });
  pass("treasury_intact", me.d.me.books.nets === 9200 && me.d.me.books.fees === 800, me.d.me.books);

  // persistence of API write into sqlite file via fresh connection
  resetMemory();
  closeStore();
  const disk = openSqlite(paths().sqliteFile);
  const diskWorld = readWorld(disk);
  disk.close();
  pass(
    "api_persisted_to_sqlite",
    diskWorld.businesses.some((item) => item.email === `rel-a-${stamp}@contour.local`)
      && diskWorld.clients.some((item) => item.contact === contact),
    { stamp },
  );
}

const failed = checks.filter((item) => !item.ok);
const status = dbStatus();
console.log(JSON.stringify({
  summary: {
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    mode: status.mode,
    writeSeq: status.writeSeq,
    docs: status.docs,
  },
  checks,
}, null, 2));

if (failed.length) {
  console.error("proof-all FAILED");
  process.exit(1);
}
console.log("proof-all ok");
