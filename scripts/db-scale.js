import assert from "node:assert/strict";
import { closeStore, load, newId, resetMemory, save } from "../lib/store.js";

resetMemory();
const world = load();

const idle = save();
assert.equal(idle.noop, true, "save без изменений не должен писать строки");
assert.equal(idle.written, 0);
assert.ok(idle.skipped > 0);

const marker = `scale-${Date.now()}`;
const businessId = newId("member");
world.businesses.push({
  id: businessId,
  kind: "member",
  name: "Scale House",
  email: `${marker}@contour.local`,
  city: "Москва",
  atTable: false,
});
const afterBiz = save();
assert.equal(afterBiz.noop, false);
assert.ok(afterBiz.written >= 1, "новая запись businesses должна upsert-нуться");

world.clients.push({
  id: newId("client"),
  businessId,
  name: "Scale Client",
  contact: `${marker}@mail.local`,
  note: "scale",
  spend: 1,
  city: "Москва",
});
const afterClient = save();
assert.ok(afterClient.written >= 1);
assert.equal(afterClient.noop, false);

const idle2 = save();
assert.equal(idle2.noop, true);

world.businesses = world.businesses.filter((item) => item.id !== businessId);
world.clients = world.clients.filter((item) => item.businessId !== businessId);
const cleanup = save();
assert.ok(cleanup.removed >= 2, "удалённые id должны сниматься с диска");
assert.equal(cleanup.noop, false);

const idle3 = save();
assert.equal(idle3.noop, true);

closeStore();
console.log("db-scale ok");
console.log(`idle written=${idle.written} skipped=${idle.skipped}`);
console.log(`biz written=${afterBiz.written}`);
console.log(`client written=${afterClient.written}`);
console.log(`cleanup removed=${cleanup.removed}`);
