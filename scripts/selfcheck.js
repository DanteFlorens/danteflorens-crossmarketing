import assert from "node:assert/strict";
import { SPECS, houseFromSpec, buildWorld } from "../lib/seed.js";
import { inferProfile, scorePair, rankPartners, buildPlan, nextMorningMoscow } from "../lib/engine.js";
import { buildIdeas, describeSlices, clientMatches } from "../lib/ideas.js";
import { closeDeal, findExchangeClient, pairReasons } from "../lib/exchange.js";
import { ensureCatalog, catalogComplement, parseCatalogBody, rankMarket } from "../lib/catalog.js";
import { cityOfFuture, primaryQuarter, quartersOfCity } from "../lib/city.js";
import { adviseFakel, detectIntent, fakelBootstrap } from "../lib/fakel.js";
import { readAttachments } from "../lib/fakel-files.js";
import { parseCsv } from "../lib/csv.js";

for (const spec of SPECS) {
  const profile = inferProfile(spec);
  assert.equal(profile.role, spec.expectedRole, `${spec.craft} → ${profile.role}, ожидали ${spec.expectedRole}`);
}

const world = buildWorld();
assert.equal(world.businesses.length, SPECS.length);
assert.equal(world.clients.length, SPECS.length * 10);
assert.equal(world.payments.length, 0);

const byId = Object.fromEntries(world.businesses.map((house) => [house.id, house]));
const florist = byId["seat-florist"];
const photo = byId["seat-photo"];
const otherFlorist = houseFromSpec({
  ...SPECS.find((item) => item.id === "seat-florist"),
  id: "seat-florist-2",
  name: "Второй стебель",
});
assert.equal(scorePair(florist, otherFlorist), null);
assert.ok(scorePair(florist, photo).score >= 0.62, "флорист и фотограф должны держаться крепко");

const dentists = ["a", "b"].map((id) => ({
  id,
  name: id,
  role: "dentist",
  roleTitle: "стоматология",
  situations: ["health"],
  personas: ["families"],
  band: "middle",
  city: "Москва",
  ticket: 10000,
  atTable: true,
  kind: "seat",
}));
assert.equal(scorePair(dentists[0], dentists[1]), null);

function member(craft, about, city, ticket, id) {
  const profile = inferProfile({ craft, about, ticket, city });
  return {
    id,
    kind: "member",
    atTable: true,
    name: craft,
    city,
    craft,
    about,
    offer: "соседний шаг",
    benefit: "вас примут как клиента соседнего дома",
    seat: "house",
    suppressed: [],
    ...profile,
    ticket,
  };
}

const violin = member("школа скрипки для детей", "занятия для детей и семей", "Москва", 4000, "violin");
assert.equal(violin.role, "courses");
const violinPlan = buildPlan({
  business: violin,
  businesses: [...world.businesses, violin],
  clientsByHouse: indexOf(world, [{ id: "v1", businessId: "violin", name: "София Лебедева", contact: "s@contour.local", note: "ребёнок идёт на занятия", spend: 8000, city: "Москва" }]),
  seat: "house",
});
assert.ok(violinPlan.links.some((link) => link.business.role === "kids_club"), "скрипка должна выйти на детский клуб");
const violinIdeas = buildIdeas({
  business: violin,
  partners: rankPartners(violin, [...world.businesses, violin], 4),
  businesses: [...world.businesses, violin],
  clients: [],
});
assert.ok(violinIdeas.some((idea) => idea.role === "tutor" && idea.kind === "invite"), "пустая нить скрипки — репетитор, не чужая цепь");
assert.ok(!violinIdeas.some((idea) => idea.role === "marketing"));
assert.ok(!violinPlan.links.some((link) => link.business.role === "accountant"), "скрипка не должна садиться к бухгалтеру");
assert.ok(!violinPlan.links.some((link) => link.business.role === "detailing"), "скрипка не должна садиться к детейлингу");

const bath = member("баня на дровах и парная", "пар и восстановление тела", "Москва", 3500, "bath");
assert.equal(bath.role, "bath");
const bathPlan = buildPlan({
  business: bath,
  businesses: [...world.businesses, bath],
  clientsByHouse: indexOf(world, [{ id: "b1", businessId: "bath", name: "Иван Кузнецов", contact: "i@contour.local", note: "после бани болит спина", spend: 4000, city: "Москва" }]),
  seat: "house",
});
assert.equal(bathPlan.links[0].business.role, "massage");
assert.ok(bathPlan.letters.length >= 1);
assert.match(bathPlan.letters[0].body, /Иван Кузнецов/);
assert.match(bathPlan.letters[0].body, /стоп/);
assert.ok(bathPlan.links[0].expectedForMember > 0);
assert.ok(bathPlan.links[0].expectedForPartner > 0);

const memorial = member("ритуальная мастерская урн", "дом памяти и ритуала", "Москва", 40000, "memorial");
assert.equal(memorial.role, "memorial");
const memoryPlan = buildPlan({
  business: memorial,
  businesses: [...world.businesses, memorial],
  clientsByHouse: indexOf(world, []),
  seat: "house",
});
assert.ok(memoryPlan.links.some((link) => link.business.role === "florist"));
assert.ok(!memoryPlan.links.some((link) => link.business.role === "realtor"));

const blank = member("qqqq", "", "Москва", 10000, "blank");
const blankPlan = buildPlan({
  business: blank,
  businesses: [...world.businesses, blank],
  clientsByHouse: indexOf(world, []),
  seat: "thread",
});
assert.equal(blankPlan.links.length, 1);
assert.equal(blankPlan.links[0].quality, "едва держится");

const morning = nextMorningMoscow(new Date("2026-11-06T16:35:00.000Z"));
assert.equal(morning, "2026-11-07T06:00:00.000Z");

const parsed = parseCsv('имя,контакт,заметка,траты,город\n"Соколова, Мария",m@contour.local,"готовит свадьбу, июнь",120000,Москва');
assert.equal(parsed[0].name, "Соколова, Мария");
assert.equal(parsed[0].spend, 120000);
assert.match(parsed[0].note, /июнь/);

const floristClients = [
  { id: "f1", businessId: florist.id, name: "Мария Соколова", contact: "m@contour.local", note: "готовит свадьбу в июне", spend: 120000, city: "Москва" },
  { id: "f2", businessId: florist.id, name: "Ольга Новикова", contact: "o@contour.local", note: "получила ключи от квартиры", spend: 10000, city: "Москва" },
];
const floristIdeas = buildIdeas({
  business: florist,
  partners: rankPartners(florist, world.businesses, 4),
  businesses: world.businesses,
  clients: floristClients,
});
assert.ok(floristIdeas.some((idea) => idea.id === `flow:${photo.id}` && idea.kind === "flow"));
assert.ok(floristIdeas.some((idea) => idea.id === `cobrand:${photo.id}` && idea.kindTitle === "Кобрендинг"));
assert.ok(floristIdeas.some((idea) => idea.id === `trade:${photo.id}` && idea.kind === "trade"));
assert.ok(floristIdeas.some((idea) => idea.kind === "invite"));
const floristCatalog = ensureCatalog(florist);
assert.ok(floristCatalog.hook?.title);
assert.ok(floristCatalog.chips.length >= 1);
assert.ok(catalogComplement(florist, photo).length >= 1);
const parsedCatalog = parseCatalogBody({
  hook: { title: "букет к ужину", price: 3000, note: "вход" },
  chips: [{ title: "оформление стола", price: 25000 }],
  seek: "фотограф торжеств",
});
assert.equal(parsedCatalog.catalog.hook.title, "букет к ужину");
assert.equal(parsedCatalog.catalog.chips.length, 1);
const market = rankMarket(florist, world.businesses, 8);
assert.ok(market.length >= 1);
assert.ok(market.every((card) => card.businessId !== florist.id));
const traded = buildPlan({
  business: florist,
  businesses: world.businesses,
  clientsByHouse: { [florist.id]: floristClients },
  seat: "house",
  picks: { ideas: [`trade:${photo.id}`], audience: ["sit:celebration"] },
});
assert.equal(traded.letters.length, 1);
assert.match(traded.letters[0].body, /акци|совместн|партнёр|Dante Florens/i);
assert.equal(primaryQuarter(florist)?.id, "wedding");
assert.equal(primaryQuarter(bath)?.id, "body");
const moscowQuarters = quartersOfCity("Москва", world.businesses);
assert.ok(moscowQuarters.some((item) => item.id === "wedding" && item.houseCount >= 2));
const future = cityOfFuture(world.businesses);
assert.match(future.vision, /обмен клиентами|следующий этап/i);
assert.ok(future.cities.some((item) => item.city === "Москва" && item.quarterCount >= 1));
assert.equal(detectIntent("что сделать сегодня"), "secretary");
assert.equal(detectIntent("собери каталог"), "catalog");
assert.equal(detectIntent("город будущего"), "city");
const fakelDb = { businesses: world.businesses, deals: [], fakel: { sessions: {}, improvements: [], prefs: {} } };
const boot = fakelBootstrap(fakelDb, florist);
assert.match(boot.greeting, /AI-консультант|Здравствуйте|консультант/i);
const chat = await adviseFakel({
  db: fakelDb,
  text: "Что сделать сегодня?",
  business: florist,
  clients: floristClients,
  businesses: world.businesses,
  deals: [],
  morning: null,
});
assert.match(chat.answer, /сегодня|База|рассыл|акци|партн|План/i);
assert.equal(chat.engine, "local");
assert.ok(fakelDb.fakel.sessions[florist.id].history.length >= 2);
const csvPayload = {
  name: "clients.csv",
  mime: "text/csv",
  data: Buffer.from("имя,контакт,заметка\nМария,m@x.ru,готовит свадьбу\n", "utf8").toString("base64"),
};
const read = readAttachments([csvPayload]);
assert.equal(read.count, 1);
assert.equal(read.files[0].kind, "text");
assert.match(read.digest, /Мария/);
const withFile = await adviseFakel({
  db: fakelDb,
  text: "Разбери базу",
  files: [csvPayload],
  business: florist,
  clients: floristClients,
  businesses: world.businesses,
  deals: [],
});
assert.match(withFile.answer, /Прочитал|файл|Мария|баз/i);
assert.equal(withFile.files[0].name, "clients.csv");
const slices = describeSlices(floristClients, florist);
assert.equal(floristClients.filter((client) => clientMatches(client, ["sit:celebration"], slices)).length, 1);
const childSlices = describeSlices([{ note: "ребёнок идёт на занятия", spend: 8000, city: "Москва" }], florist);
assert.ok(childSlices.some((slice) => slice.id === "sit:child" && slice.count === 1));
const narrow = buildPlan({
  business: florist,
  businesses: world.businesses,
  clientsByHouse: { [florist.id]: floristClients },
  seat: "house",
  picks: { ideas: [`flow:${photo.id}`], audience: ["sit:celebration"] },
});
assert.ok(narrow.links.every((link) => link.business.id === photo.id));
assert.equal(narrow.letters.length, 1);
assert.match(narrow.letters[0].body, /Мария Соколова/);
const branded = buildPlan({
  business: florist,
  businesses: world.businesses,
  clientsByHouse: { [florist.id]: floristClients },
  seat: "house",
  picks: { ideas: [`cobrand:${photo.id}`], audience: ["all"] },
});
assert.match(branded.letters.map((letter) => letter.body).join("\n"), /Совместная акция|торжеств/i);
const blankIdeas = buildIdeas({
  business: blank,
  partners: rankPartners(blank, world.businesses, 2),
  businesses: world.businesses,
  clients: [],
});
assert.ok(blankIdeas.some((idea) => idea.kind === "flow"));
assert.ok(blankIdeas.some((idea) => idea.kind === "cobrand"));

const pendingDeal = { beneficiaryId: "a", partnerId: "b", sellerConfirmed: false, partnerConfirmed: false, status: "pending", amount: 1000 };
closeDeal(pendingDeal, "a");
assert.equal(pendingDeal.status, "pending");
closeDeal(pendingDeal, "b");
assert.equal(pendingDeal.status, "confirmed");
assert.equal(pendingDeal.amountLocked, true);
closeDeal(pendingDeal, "a");
assert.equal(pendingDeal.amount, 1000);
assert.ok(pairReasons(florist, photo).some((line) => line.startsWith("смежная потребность") || line.startsWith("похожая идея")));

assert.equal(findExchangeClient([{ id: "1", name: "Пётр", contact: "p@x.ru" }], { contact: "p@x.ru" })?.id, "1");
assert.equal(findExchangeClient([{ id: "1", name: "Пётр", contact: "p@x.ru" }], { name: "Пётр" })?.id, "1");
assert.equal(findExchangeClient([{ id: "1", name: "Пётр", contact: "a@x.ru" }, { id: "2", name: "Пётр", contact: "b@x.ru" }], { name: "Пётр" }), null);
assert.equal(findExchangeClient([{ id: "1", name: "Пётр", contact: "p@x.ru" }], { name: "Вымышленный" }), null);

const memberMassage = {
  ...houseFromSpec({ ...SPECS.find((item) => item.id === "seat-massage"), id: "member-massage-test", name: "Живой массаж" }),
  kind: "member",
  atTable: true,
};
const bathLike = member("баня на дровах и парная", "пар после дороги", "Москва", 3500, "bath-rank");
const seatMassage = world.businesses.find((item) => item.id === "seat-massage");
const rankedBath = rankPartners(bathLike, [seatMassage, memberMassage], 2);
assert.equal(rankedBath[0].business.id, "member-massage-test", "живой member должен быть выше учебного seat");

const privacyPlan = buildPlan({
  business: florist,
  businesses: world.businesses,
  clientsByHouse: { [florist.id]: floristClients, [photo.id]: world.clients.filter((item) => item.businessId === photo.id) },
  seat: "house",
});
const foreign = privacyPlan.links.flatMap((link) => link.returnLetters || []);
assert.ok(foreign.length >= 1, "ответный поток должен считаться");
assert.ok(foreign.every((letter) => letter.contact == null), "чужие contact не должны утекать в returnLetters");
assert.ok(foreign.every((letter) => letter.clientName === "клиент партнёра"), "чужие имена маскируются");

const partners = rankPartners(florist, world.businesses, 4);
assert.ok(partners.every((item) => item.business.role !== "florist"));
assert.ok(partners.some((item) => item.business.city === "Москва"));

console.log("selfcheck ok");
console.log(`бизнесов за стартовым столом: ${world.businesses.length}`);
console.log(`скрипка → ${violinPlan.links.map((link) => link.business.roleTitle).join(", ")}`);
console.log(`баня → ${bathPlan.links.map((link) => `${link.business.roleTitle} (${link.quality})`).join(", ")}`);
console.log(`память → ${memoryPlan.links.map((link) => link.business.roleTitle).join(", ")}`);

function indexOf(world, extra) {
  const map = {};
  for (const client of [...world.clients, ...extra]) {
    if (!map[client.businessId]) map[client.businessId] = [];
    map[client.businessId].push(client);
  }
  return map;
}
