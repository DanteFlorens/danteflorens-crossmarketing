import { closeStore, dbStatus, load, paths, resetMemory, save } from "../lib/store.js";

resetMemory();
closeStore();
load();
const idle = save();

const world = load();
const pingId = `scale-ping-${Date.now()}`;
world.journal.push({
  id: pingId,
  waveId: "scale",
  businessId: "scale",
  contact: "scale@contour.local",
  name: "scale",
  subject: "incremental save ping",
  at: new Date().toISOString(),
  status: "journal",
});
const dirty = save();
world.journal = world.journal.filter((item) => item.id !== pingId);
const revert = save();
const after = dbStatus();

console.log("sqlite ok");
console.log(`file: ${paths().sqliteFile}`);
console.log(`engine: ${after.engine}`);
console.log(`mode: ${after.mode}`);
console.log(`writeSeq: ${after.writeSeq}`);
console.log(`version: ${after.version}`);
console.log(`savedAt: ${after.savedAt}`);
console.log(`docs: ${after.docs}`);
for (const [name, count] of Object.entries(after.counts)) {
  console.log(`  ${name}: ${count}`);
}
console.log(`idle save: noop=${idle?.noop} written=${idle?.written} skipped=${idle?.skipped}`);
console.log(`dirty save: noop=${dirty?.noop} written=${dirty?.written} skipped=${dirty?.skipped}`);
console.log(`revert save: noop=${revert?.noop} written=${revert?.written} removed=${revert?.removed}`);
closeStore();
