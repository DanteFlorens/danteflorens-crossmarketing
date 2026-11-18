import assert from "node:assert/strict";
import { closeStore, load, newId, paths, resetMemory, save } from "../lib/store.js";
import { openSqlite, readWorld } from "../lib/sqlite.js";

resetMemory();
closeStore();
const world = load();
const marker = `sqlite-roundtrip-${Date.now()}`;
const businessId = newId("member");
const clientId = newId("client");

world.businesses.push({
  id: businessId,
  kind: "member",
  name: "Roundtrip House",
  email: `${marker}@contour.local`,
  city: "Москва",
  atTable: false,
});
world.clients.push({
  id: clientId,
  businessId,
  name: "Probe",
  contact: `${marker}@mail.local`,
  note: "roundtrip",
  spend: 1,
  city: "Москва",
});
save();
closeStore();

const fresh = openSqlite(paths().sqliteFile);
const reloaded = readWorld(fresh);
fresh.close();

assert.ok(reloaded.businesses.some((item) => item.id === businessId), "business missing after reload");
assert.ok(
  reloaded.clients.some((item) => item.id === clientId && item.contact.includes(marker)),
  "client missing after reload",
);

resetMemory();
const cleanup = load();
cleanup.businesses = cleanup.businesses.filter((item) => item.id !== businessId);
cleanup.clients = cleanup.clients.filter((item) => item.id !== clientId);
save();
closeStore();

console.log("db-roundtrip ok");
console.log(`marker: ${marker}`);
console.log(`file: ${paths().sqliteFile}`);
