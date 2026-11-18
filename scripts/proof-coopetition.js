import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(fs.readFileSync(path.join(root, "data", "port.txt"), "utf8").trim()) || 4177;
const base = `http://127.0.0.1:${port}`;

async function req(method, urlPath, { token, body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Florens-Token"] = token;
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || `${method} ${urlPath} → ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const stamp = Date.now();

async function registerClinic({ name, email, district, craft, offer }) {
  const reg = await req("POST", "/api/register", {
    body: {
      name,
      owner: "Врач",
      email,
      phone: "+79002220000",
      city: "Москва",
      ticket: 15000,
      craft,
      about: `Район ${district}. Частная клиника.`,
      offer,
      benefit: "приём для партнёров",
      seek: "коллеги по стоматологии",
    },
  });
  await req("POST", "/api/pay", { token: reg.token, body: { seat: "house" } });
  await req("PUT", "/api/passport", {
    token: reg.token,
    body: {
      district,
      avgCheck: 15000,
      gender: "любой",
      ageFrom: 18,
      ageTo: 70,
      idealClient: "пациенты с острой болью и плановым лечением",
      touchpoints: "колл-центр, ресепшен, Telegram",
      locomotive: offer,
      idleWindows: "утро будни",
    },
  });
  await req("POST", "/api/gifts", {
    token: reg.token,
    body: { title: offer, cost: 200, clientValue: 2000, days: 7, valueNote: "вход без уценки прайса" },
  });
  await req("POST", "/api/tariff", { token: reg.token, body: { tariff: "pro" } });
  return reg;
}

const north = await registerClinic({
  name: "Клиника Север Proof",
  email: `clinic-n-${stamp}@proof.local`,
  district: "север",
  craft: "стоматология терапия",
  offer: "гигиена в подарок",
});
const south = await registerClinic({
  name: "Клиника Юг Proof",
  email: `clinic-s-${stamp}@proof.local`,
  district: "юг",
  craft: "стоматология хирургия",
  offer: "бонус 1000 ₽ на срочный приём",
});

const matchAdj = await req("GET", "/api/match?mode=adjacent", { token: north.token });
assert(matchAdj.mode === "adjacent", "mode adjacent");
assert(
  !matchAdj.partners.some((p) => p.businessId === south.me.id),
  "в смежном режиме same-role клиника не должна попадать через scorePair",
);

const matchCoop = await req("GET", "/api/match?mode=coopetition", { token: north.token });
assert(
  matchCoop.partners.some((p) => p.businessId === south.me.id),
  "в коопетиции южная клиника должна находиться",
);

const specialty = await req("POST", "/api/bundles/generate", {
  token: north.token,
  body: { partnerId: south.me.id, mode: "coopetition", template: "specialty" },
});
assert(specialty.bundle.mode === "coopetition", "mode coopetition");
assert(specialty.bundle.trust?.returnAnchor, "якорь возврата");

const pub = await req("POST", `/api/bundles/${specialty.bundle.id}/publish`, {
  token: north.token,
  body: {
    pactAccepted: true,
    protectedServices: ["терапия", "гигиена"],
    returnAnchor: specialty.bundle.trust.returnAnchor,
  },
});
assert(pub.bundle.trust?.pactAcceptedAt, "пакт принят");

const view = await req("GET", `/api/c/${pub.bundle.code}`);
assert(view.returnAnchor, "якорь на лендинге");
assert(view.mode === "coopetition", "mode на лендинге");

const slot = await req("POST", "/api/slots", {
  token: south.token,
  body: { service: "срочный приём терапия", district: "юг", hours: 6 },
});
assert(slot.slot?.status === "open", "слот открыт");

const handoff = await req("POST", "/api/handoff", {
  token: north.token,
  body: {
    service: "острая зубная боль",
    district: "сегодня, юг",
    patientName: "Ирина",
    contact: "+79006667788",
  },
});
assert(handoff.handoff?.toId === south.me.id, "handoff ушёл на юг");
assert(handoff.coupon?.code || handoff.claimPath, "есть талон");

const code = handoff.coupon?.code;
assert(code, "персональный код после handoff с контактом");

const snapSouth = await req("GET", "/api/crossflow", { token: south.token });
const cashierToken = (snapSouth.cashierPath || "").split("/").pop();
const redeemed = await req("POST", `/api/cashier/${cashierToken}/redeem`, {
  body: { code, amount: 20000 },
});
assert(redeemed.revshareAmount === 3000, `RevShare 15% от 20000 = 3000, got ${redeemed.revshareAmount}`);
assert(redeemed.credited > 0, "коины за RevShare");

const walletN = await req("GET", "/api/wallet", { token: north.token });
assert(walletN.balance >= redeemed.credited, "баланс севера вырос");

const bans = (await req("GET", "/api/crossflow", { token: north.token })).pactBans || [];
assert(bans.some((b) => b.bannedBusinessId === south.me.id), "pact ban записан");

console.log(
  JSON.stringify(
    {
      ok: true,
      specialtyCode: pub.bundle.code,
      handoffCode: code,
      revshareAmount: redeemed.revshareAmount,
      balanceNorth: walletN.balance,
      coopPartners: matchCoop.partners.length,
    },
    null,
    2,
  ),
);
