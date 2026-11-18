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
const emailA = `cross-a-${stamp}@proof.local`;
const emailB = `cross-b-${stamp}@proof.local`;

const regA = await req("POST", "/api/register", {
  body: {
    name: "Сухой стебель",
    owner: "Анна",
    email: emailA,
    phone: "+79001110001",
    city: "Москва",
    ticket: 450,
    craft: "цветочный салон, свадебная флористика",
    about: "пары готовят торжество",
    offer: "букет в подарок к примерке",
    benefit: "цветы на стол",
    seek: "свадебные фотографы и ведущие",
  },
});
const regB = await req("POST", "/api/register", {
  body: {
    name: "Свет и клятва",
    owner: "Игорь",
    email: emailB,
    phone: "+79001110002",
    city: "Москва",
    ticket: 45000,
    craft: "свадебный фотограф",
    about: "пары в день торжества",
    offer: "тихий час съёмки в подарок",
    benefit: "съёмка дня",
    seek: "флористы и площадки",
  },
});

await req("POST", "/api/pay", { token: regA.token, body: { seat: "house" } });
await req("POST", "/api/pay", { token: regB.token, body: { seat: "house" } });

await req("PUT", "/api/passport", {
  token: regA.token,
  body: {
    inn: "7707083893",
    avgCheck: 450,
    gender: "любой",
    ageFrom: 22,
    ageTo: 55,
    idealClient: "пары 25–40, средний чек 8–15 тыс",
    touchpoints: "12 консультаций в день, Instagram, салон",
    locomotive: "букет в подарок к примерке",
    idleWindows: "вт–чт утро",
  },
});
await req("PUT", "/api/passport", {
  token: regB.token,
  body: {
    avgCheck: 45000,
    gender: "любой",
    ageFrom: 24,
    ageTo: 45,
    idealClient: "пары к торжеству",
    touchpoints: "переписки в Telegram, встречи",
    locomotive: "тихий час съёмки в подарок",
    idleWindows: "будни до 16:00",
  },
});

await req("POST", "/api/gifts", {
  token: regA.token,
  body: { title: "Букет к примерке", cost: 400, clientValue: 2500, days: 14, valueNote: "Цветы без уценки прайса" },
});
await req("POST", "/api/gifts", {
  token: regB.token,
  body: { title: "Тихий час съёмки", cost: 0, clientValue: 8000, days: 14, valueNote: "Вход в воронку съёмки" },
});

const match = await req("GET", "/api/match", { token: regA.token });
assert(match.partners.length > 0, "матч пустой");

const gen = await req("POST", "/api/bundles/generate", {
  token: regA.token,
  body: { partnerId: regB.me.id },
});
assert(gen.bundle?.offers?.length === 3, "нет 3 офферов");
assert(gen.bundle.script && gen.bundle.mailing, "нет скрипта/рассылки");

const pub = await req("POST", `/api/bundles/${gen.bundle.id}/publish`, {
  token: regA.token,
  body: {},
});
assert(pub.bundle?.code, "нет кода QR");
assert(pub.claimPath, "нет claim path");

const view = await req("GET", `/api/c/${pub.bundle.code}`);
assert(view.giftTitle, "лендинг без подарка");

const claimed = await req("POST", `/api/c/${pub.bundle.code}/claim`, {
  body: { name: "Пётр", contact: "+79005551234" },
});
assert(claimed.coupon?.code, "нет персонального кода");

const snap = await req("GET", "/api/crossflow", { token: regB.token });
const cashierToken = (snap.cashierPath || "").split("/").pop();
assert(cashierToken, "нет токена кассира у партнёра B");

const redeemed = await req("POST", `/api/cashier/${cashierToken}/redeem`, {
  body: { code: claimed.coupon.code, amount: 2800 },
});
assert(redeemed.credited > 0, "коины не начислены");
assert(redeemed.checkAmount === 2800, "сумма чека не сохранилась");

const walletA = await req("GET", "/api/wallet", { token: regA.token });
assert(walletA.balance >= redeemed.credited, "баланс A не вырос");

const funnel = await req("GET", "/api/analytics/funnel", { token: regA.token });
const row = funnel.funnel.find((item) => item.bundleId === gen.bundle.id);
assert(row?.taken >= 1, "воронка: не взяли");
assert(row?.redeemed >= 1, "воронка: не погасили");
assert(row?.revenue === 2800, "воронка: выручка");
assert(row?.adSpend === 0, "воронка: реклама должна быть 0");

console.log(
  JSON.stringify(
    {
      ok: true,
      port,
      claimPath: pub.claimPath,
      coupon: claimed.coupon.code,
      credited: redeemed.credited,
      balanceA: walletA.balance,
      funnel: row,
    },
    null,
    2,
  ),
);
