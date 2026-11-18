const base = process.argv[2] || "http://127.0.0.1:4177";

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

const report = [];
function pass(name, ok, detail) {
  report.push({ name, ok: Boolean(ok), detail });
}

const stamp = Date.now();
const regA = await call("/api/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Обмен А",
    owner: "A",
    email: `ex-a-${stamp}@contour.local`,
    phone: "+79001110011",
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
    name: "Обмен Б",
    owner: "B",
    email: `ex-b-${stamp}@contour.local`,
    phone: "+79001110012",
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
const contactB = `marat-ex-${stamp}@contour.local`;
await call("/api/clients", {
  method: "POST",
  headers: hA,
  body: JSON.stringify({
    csv: `имя,контакт,заметка,траты,город\nАлия,aliya-ex-${stamp}@contour.local,нужны цветы на прощание,20000,Казань`,
    attest: true,
  }),
});
await call("/api/clients", {
  method: "POST",
  headers: hB,
  body: JSON.stringify({
    csv: `имя,контакт,заметка,траты,город\nМарат,${contactB},нужен букет к ритуалу,15000,Казань`,
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
const linkB = (morning.d.preview?.links || []).find((link) => link.business.id === regB.d.me.id);
pass("no_foreign_pii_in_returnLetters", leaks.length === 0, { leaks: leaks.slice(0, 5), inbound: linkB?.inbound });
pass("member_partner_preferred", Boolean(linkB) && (morning.d.preview.letters || []).some((letter) => letter.partnerName === "Обмен Б"), {
  firstLetter: morning.d.preview?.letters?.[0]?.partnerName,
  partners: (morning.d.preview?.links || []).map((link) => ({ name: link.business.name, kind: link.business.kind })),
});

const fake = await call("/api/deals", {
  method: "POST",
  headers: hA,
  body: JSON.stringify({ partnerId: regB.d.me.id, amount: 100, clientName: "Вымышленный" }),
});
pass("fake_client_rejected", !fake.ok && fake.status === 400, { status: fake.status, err: fake.d.error });

const real = await call("/api/deals", {
  method: "POST",
  headers: hA,
  body: JSON.stringify({
    partnerId: regB.d.me.id,
    amount: 10000,
    clientName: "Марат",
    clientContact: contactB,
  }),
});
pass("real_client_deal_ok", real.ok && real.d.deal?.status === "pending", {
  id: real.d.deal?.id,
  clientId: real.d.deal?.clientId,
  nets: real.d.me?.books?.nets,
});

const confB = await call("/api/deals/confirm", {
  method: "POST",
  headers: hB,
  body: JSON.stringify({ dealId: real.d.deal.id }),
});
pass("mutual_confirm", confB.d.deal?.status === "confirmed" && confB.d.deal?.amountLocked === true, {
  status: confB.d.deal?.status,
  locked: confB.d.deal?.amountLocked,
  amount: confB.d.deal?.amount,
});

const rewrite = await call("/api/deals/confirm", {
  method: "POST",
  headers: hA,
  body: JSON.stringify({ dealId: real.d.deal.id, amount: 999999 }),
});
pass("post_confirm_rewrite_blocked", !rewrite.ok && rewrite.status === 400, {
  status: rewrite.status,
  err: rewrite.d.error,
});
const meAfter = await call("/api/me", { headers: hA });
pass("amount_stays_10000", meAfter.d.me.books.nets === 9200 && meAfter.d.me.books.fees === 800, meAfter.d.me.books);

const failed = report.filter((item) => !item.ok);
console.log(JSON.stringify({ summary: { total: report.length, passed: report.length - failed.length, failed: failed.length }, checks: report }, null, 2));
if (failed.length) process.exit(1);
console.log("proof-exchange ok");
