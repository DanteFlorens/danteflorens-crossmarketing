const base = process.argv[2] || "http://127.0.0.1:4177";
const key = process.argv[3];

async function call(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  const data = text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text;
  if (!response.ok) throw new Error(`${path} ${response.status} ${text}`);
  return data;
}

const page = await call("/");
if (!page.includes("Dante Florens")) throw new Error("страница пустая");

const health = await call("/api/health");
if (!health.ok || health.houses < 18) throw new Error("стол не собран");

const registered = await call("/api/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Тёплый порог",
    owner: "Проверка контура",
    email: `banya-${Date.now()}@contour.local`,
    phone: "+7 900 000-00-00",
    city: "Москва",
    ticket: 3500,
    craft: "баня на дровах и парная",
    about: "пар после дороги и тренировки",
    offer: "пар в будний день",
    benefit: "первый визит без абонемента",
  }),
});
const headers = { "Content-Type": "application/json", "X-Florens-Token": registered.token };
if (registered.me.role !== "bath") throw new Error(`роль ${registered.me.role}`);

const paid = await call("/api/pay", { method: "POST", headers, body: JSON.stringify({ seat: "house" }) });
if (paid.me.books.paid !== 49000) throw new Error("оплата не села");

const csv = "имя,контакт,заметка,траты,город\nИван Кузнецов,ivan@contour.local,после бани болит спина,8000,Москва\nМария Соколова,maria@contour.local,готовит свадьбу в июне,120000,Москва";
const baseIn = await call("/api/clients", { method: "POST", headers, body: JSON.stringify({ csv, attest: true }) });
if (baseIn.added !== 2) throw new Error("база не занесена");
if (!String(baseIn.morning.waveAt).endsWith("T06:00:00.000Z")) throw new Error(baseIn.morning.waveAt);
if (!baseIn.morning.ready) throw new Error("утро не готово");
const top = baseIn.morning.preview.links[0];
if (top.business.role !== "massage") throw new Error(`первая нить ${top.business.role}`);
if (!baseIn.morning.preview.letters.length) throw new Error("писем нет");

const opened = await call("/api/house/open", {
  method: "POST",
  headers: { ...headers, "X-House-Key": key },
  body: JSON.stringify({ businessId: registered.me.id }),
});
if (!opened.letters) throw new Error("утро не открылось");

const deal = await call("/api/deals", {
  method: "POST",
  headers,
  body: JSON.stringify({ partnerId: top.business.id, amount: 10000 }),
});
if (deal.me.books.nets !== 9200 || deal.me.books.fees !== 800) throw new Error("доля 92/8 сломалась");

const house = await call("/api/house", { headers: { "X-House-Key": key } });
if (house.treasury.total !== 49800) throw new Error(`казна ${house.treasury.total}`);

console.log("flow ok");
console.log(`нить: ${top.business.name} / ${top.quality}`);
console.log(`утро: ${baseIn.morning.waveAt}`);
console.log(`казна дома: ${house.treasury.total}`);
