import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { parseCsv } from "./lib/csv.js";
import { addDaysMoscow, buildPlan, FEE_RATE, inferProfile, nextMorningMoscow, rankPartners, scorePair, SEATS, waveReady } from "./lib/engine.js";
import { ensureCatalog, marketCard, parseCatalogBody, rankMarket } from "./lib/catalog.js";
import { cityOfFuture, primaryQuarter } from "./lib/city.js";
import { agesFromProfile, CITY_MARK, closeDeal, findExchangeClient, guestFit, isConfirmed, licenseLive, licenseUntil, validAge, validPrice } from "./lib/exchange.js";
import {
  claimCoupon,
  createGift,
  createHandoff,
  createSlot,
  crossflowSnapshot,
  generateBundle,
  handoffOf,
  listSlots,
  matchPartners,
  parseGiftBody,
  parsePassportBody,
  publicCouponView,
  publishBundle,
  readyCrossflow,
  redeemCoupon,
  selectBundleOffer,
  setTariff,
  spendLeadCoins,
  cashierContext,
  upsertPassport,
  TARIFFS,
} from "./lib/crossflow.js";
import { adviseFakel, fakelBootstrap } from "./lib/fakel.js";
import { buildIdeas, describeSlices } from "./lib/ideas.js";
import { cityKey, seatById } from "./lib/ontology.js";
import {
  asciiFilename,
  buildCatalogPdf,
  buildDealPdf,
  utf8Filename,
} from "./lib/pdf.js";
import { closeStore, houseKey, load, newId, paths, save } from "./lib/store.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const clientDir = path.join(root, "src", "client");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function clientsOf(db, id) {
  return db.clients.filter((client) => client.businessId === id);
}

function clientsByHouse(db) {
  const map = {};
  for (const client of db.clients) {
    if (!map[client.businessId]) map[client.businessId] = [];
    map[client.businessId].push(client);
  }
  return map;
}

function ready(db) {
  db.deals ||= [];
  db.journal ||= [];
  db.claims ||= [];
  db.guests ||= [];
  db.guestSessions ||= [];
  db.fakel ||= { sessions: {}, improvements: [], prefs: {} };
  readyCrossflow(db);
}

function booksOf(db, id) {
  const paid = db.payments.filter((item) => item.businessId === id).reduce((sum, item) => sum + item.amount, 0);
  const mine = db.deals.filter((item) => item.beneficiaryId === id && isConfirmed(item));
  const pending = db.deals.filter((item) => (item.beneficiaryId === id || item.partnerId === id) && !isConfirmed(item));
  return {
    paid,
    nets: mine.reduce((sum, item) => sum + item.net, 0),
    fees: mine.reduce((sum, item) => sum + item.fee, 0),
    deals: mine.length,
    pending: pending.length,
  };
}

function treasuryOf(db) {
  const seats = db.payments.reduce((sum, item) => sum + item.amount, 0);
  const confirmed = db.deals.filter(isConfirmed);
  const fees = confirmed.reduce((sum, item) => sum + item.fee, 0);
  const gmv = confirmed.reduce((sum, item) => sum + item.amount, 0);
  return {
    seats,
    fees,
    gmv,
    total: seats + fees,
    deals: confirmed.length,
    pending: db.deals.filter((item) => !isConfirmed(item)).length,
    members: db.businesses.filter((item) => item.kind === "member" && licenseLive(item)).length,
  };
}

function cityBoard(db) {
  const rows = [];
  for (const house of db.businesses.filter((item) => item.atTable)) {
    const key = cityKey(house.city) || "город не назван";
    let row = rows.find((item) => item.key === key);
    if (!row) {
      row = { key, city: house.city || key, businesses: 0, licenses: 0 };
      rows.push(row);
    }
    row.businesses += 1;
    if (house.kind === "member" && licenseLive(house)) row.licenses += 1;
  }
  return rows.map(({ city, businesses, licenses }) => ({ city, businesses, licenses, mark: CITY_MARK }));
}

function guestOf(db, token) {
  if (!token) return null;
  const session = db.guestSessions.find((item) => item.token === token);
  if (!session) return null;
  return db.guests.find((item) => item.id === session.guestId) || null;
}

function offersFor(db, guest) {
  return db.businesses
    .filter((item) => item.atTable)
    .map((item) => ({ item, fit: guestFit(guest, item) }))
    .filter((row) => row.fit)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 8)
    .map((row) => {
      const catalog = ensureCatalog(row.item);
      return {
        businessId: row.item.id,
        name: row.item.name,
        city: row.item.city,
        craft: row.item.roleTitle,
        bonus: row.fit.bonus,
        offer: row.fit.offer,
        reasons: row.fit.reasons,
        catalog,
        whole: "Целое лучше частей: точная позиция каталога вместо общей рекламы.",
      };
    });
}

function sessionBusiness(db, token) {
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  return db.businesses.find((item) => item.id === session.businessId) || null;
}

function ensureSchedule(business, clientCount, now = new Date()) {
  if (!waveReady(business, clientCount)) return;
  if (!business.waveAt) {
    business.waveAt = nextMorningMoscow(now);
    business.waveStatus = "scheduled";
  }
}

function fireWave(db, business, now, reason) {
  const plan = buildPlan({
    business,
    businesses: db.businesses,
    clientsByHouse: clientsByHouse(db),
    seat: business.seat,
  });
  const wave = {
    id: newId("wave"),
    businessId: business.id,
    at: now.toISOString(),
    scheduledFor: business.waveAt,
    reason,
    plan,
  };
  db.waves.push(wave);
  db.journal ||= [];
  for (const letter of plan.letters || []) {
    db.journal.push({
      id: newId("mail"),
      waveId: wave.id,
      businessId: business.id,
      contact: letter.contact,
      name: letter.clientName,
      subject: letter.subject,
      at: now.toISOString(),
      status: "journal",
    });
  }
  business.wavesDone = (business.wavesDone || 0) + 1;
  business.lastWaveAt = wave.at;
  business.waveAt = addDaysMoscow(now, 7);
  business.waveStatus = "scheduled";
  return wave;
}

function runDue(now = new Date()) {
  const db = load();
  const fired = [];
  for (const business of db.businesses) {
    if (!waveReady(business, clientsOf(db, business.id).length)) continue;
    if (business.waveStatus !== "scheduled" || !business.waveAt) continue;
    if (new Date(business.waveAt) > now) continue;
    fired.push(fireWave(db, business, now, "утро"));
  }
  if (fired.length) save();
  return fired;
}

function publicHouse(house, db) {
  const clients = clientsOf(db, house.id);
  return {
    id: house.id,
    kind: house.kind,
    name: house.name,
    owner: house.owner,
    email: house.email,
    phone: house.phone,
    city: house.city,
    craft: house.craft,
    about: house.about,
    offer: house.offer,
    benefit: house.benefit,
    catalog: ensureCatalog(house),
    seek: house.seek || ensureCatalog(house).seek || "",
    ticket: house.ticket,
    band: house.band,
    ages: house.ages || [],
    licenseUntil: house.licenseUntil || null,
    licenseLive: licenseLive(house),
    role: house.role,
    roleTitle: house.roleTitle,
    situations: house.situations,
    seat: house.seat,
    paidAt: house.paidAt,
    atTable: house.atTable,
    waveAt: house.waveAt,
    waveStatus: house.waveStatus,
    wavesDone: house.wavesDone || 0,
    lastWaveAt: house.lastWaveAt || null,
    clientCount: clients.length,
    clients: clients.slice(-80),
    books: booksOf(db, house.id),
    journal: (db.journal || []).filter((item) => item.businessId === house.id).slice(-20).map((item) => ({
      at: item.at,
      name: item.name,
      contact: item.contact,
      subject: item.subject,
      status: item.status,
    })),
    pendingDeals: db.deals
      .filter((item) => !isConfirmed(item) && (item.beneficiaryId === house.id || item.partnerId === house.id))
      .slice(-20),
    crossTariff: house.crossTariff || "start",
    passportReady: Boolean(house.passportReady || passportReady(db, house.id)),
  };
}

function passportReady(db, businessId) {
  readyCrossflow(db);
  return Boolean(db.passports.find((item) => item.businessId === businessId)?.filledAt);
}

function ideaBundle(db, house) {
  const chosen = seatById(house.seat) || SEATS[1];
  const clients = clientsOf(db, house.id);
  const partners = rankPartners(house, db.businesses, chosen.partners);
  return {
    ideas: buildIdeas({ business: house, partners, businesses: db.businesses, clients }),
    slices: describeSlices(clients, house),
    picks: house.picks || null,
  };
}

function morningOf(db, house) {
  const clientCount = clientsOf(db, house.id).length;
  const preview = buildPlan({
    business: house,
    businesses: db.businesses,
    clientsByHouse: clientsByHouse(db),
    seat: house.seat || "house",
    picks: house.picks || undefined,
  });
  const last = [...db.waves].reverse().find((wave) => wave.businessId === house.id) || null;
  return {
    ready: waveReady(house, clientCount),
    checks: {
      registered: true,
      paid: Boolean(house.paidAt),
      base: clientCount > 0,
    },
    clientCount,
    waveAt: house.waveAt,
    waveStatus: house.waveStatus || null,
    wavesDone: house.wavesDone || 0,
    lastWaveAt: house.lastWaveAt || null,
    preview,
    last,
    seats: SEATS,
    ...ideaBundle(db, house),
  };
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Слишком большой пакет."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Пакет не читается."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function header(req, name) {
  return String(req.headers[name.toLowerCase()] || "");
}

function clientIp(req) {
  const forwarded = header(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 80);
  return String(req.socket?.remoteAddress || "").slice(0, 80);
}

function keysMatch(given) {
  const left = Buffer.from(String(given || ""));
  const right = Buffer.from(houseKey());
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function requireMember(db, req) {
  const business = sessionBusiness(db, header(req, "x-florens-token"));
  if (!business) {
    const error = new Error("Сначала войдите.");
    error.status = 401;
    throw error;
  }
  return business;
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function packetText(title, plan) {
  const lines = [`Dante Florens — ${title}`, ""];
  for (const link of plan.links || []) {
    lines.push(`НИТЬ. ${link.business.name} (${link.business.city}) — ${link.quality}, плотность ${link.density}`);
    lines.push(link.syllogism);
    lines.push(link.invitation);
    lines.push("");
  }
  lines.push("ПИСЬМА КЛИЕНТАМ");
  for (const letter of plan.letters || []) {
    lines.push(`— ${letter.clientName} → ${letter.partnerName}`);
    lines.push(letter.subject);
    lines.push(letter.body);
    lines.push("");
  }
  lines.push("ПУСТЫЕ МЕСТА");
  for (const seat of plan.invitations || []) {
    lines.push(`— ${seat.roleTitle}, ${seat.city}`);
    lines.push(seat.draft);
    lines.push("");
  }
  lines.push(plan.expected?.formula || "");
  return lines.join("\n");
}

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const db = load();
  ready(db);
  if (url.pathname.startsWith("/api/")) {
    const bodyLimit = url.pathname === "/api/fakel/chat" ? 12_000_000 : 2_000_000;
    const body = req.method === "POST" || req.method === "PUT" ? await readBody(req, bodyLimit) : {};
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, houses: db.businesses.filter((item) => item.atTable).length });
    }
    if (req.method === "GET" && url.pathname === "/api/fakel") {
      const business = sessionBusiness(db, header(req, "x-florens-token"));
      return send(res, 200, fakelBootstrap(db, business));
    }
    if (req.method === "POST" && url.pathname === "/api/fakel/chat") {
      const business = sessionBusiness(db, header(req, "x-florens-token"));
      const message = clean(body.message, 2000);
      const files = Array.isArray(body.files) ? body.files.slice(0, 5) : [];
      const clients = business ? clientsOf(db, business.id) : [];
      const morning = business ? morningOf(db, business) : null;
      const result = await adviseFakel({
        db,
        text: message,
        files,
        business,
        clients,
        businesses: db.businesses,
        deals: db.deals,
        morning,
      });
      save();
      return send(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/example") {
      const florist = db.businesses.find((item) => item.id === "seat-florist");
      const photo = db.businesses.find((item) => item.id === "seat-photo");
      const scored = scorePair(florist, photo);
      const partners = rankPartners(florist, db.businesses, 4).filter((item) => item.business.id === photo.id);
      const ideas = buildIdeas({
        business: florist,
        partners,
        businesses: db.businesses,
        clients: clientsOf(db, florist.id),
      }).filter((item) => item.partnerId === photo.id);
      return send(res, 200, {
        left: florist.name,
        right: photo.name,
        leftCraft: florist.roleTitle,
        rightCraft: photo.roleTitle,
        city: florist.city,
        ...scored,
        ideas,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/atlas") {
      const houses = db.businesses.filter((item) => item.atTable);
      const threads = [];
      for (let i = 0; i < houses.length; i += 1) {
        for (let j = i + 1; j < houses.length; j += 1) {
          const scored = scorePair(houses[i], houses[j]);
          if (!scored || scored.score < 0.62) continue;
          threads.push({
            a: houses[i].name,
            b: houses[j].name,
            city: houses[i].city === houses[j].city ? houses[i].city : `${houses[i].city} · ${houses[j].city}`,
            chainTitle: scored.chainTitle,
            quality: scored.quality,
            density: scored.density,
          });
        }
      }
      threads.sort((a, b) => b.density - a.density);
      const cities = [];
      for (const house of houses) {
        const key = cityKey(house.city) || "город не назван";
        let row = cities.find((item) => item.key === key);
        if (!row) {
          row = { key, city: house.city || key, houses: 0, licenses: 0, threads: 0 };
          cities.push(row);
        }
        row.houses += 1;
        if (house.kind === "member" && licenseLive(house)) row.licenses += 1;
      }
      for (const thread of threads) {
        for (const part of String(thread.city || "").split("·")) {
          const row = cities.find((item) => item.key === cityKey(part));
          if (row) row.threads += 1;
        }
      }
      const future = cityOfFuture(db.businesses);
      return send(res, 200, {
        mark: CITY_MARK,
        cities,
        houses: houses.map((item) => {
          const card = marketCard(item);
          const quarter = primaryQuarter(item);
          return {
            ...card,
            quarterId: quarter?.id || null,
            quarterTitle: quarter?.title || null,
            placeTitle: quarter?.placeTitle || null,
          };
        }),
        threads: threads.slice(0, 24),
        treasury: { members: treasuryOf(db).members, houses: houses.length },
        future: {
          vision: future.vision,
          motto: future.motto,
          cities: future.cities.map((city) => ({
            city: city.city,
            houseCount: city.houseCount,
            quarterCount: city.quarterCount,
            strongest: city.strongest
              ? { id: city.strongest.id, title: city.strongest.title, houseCount: city.strongest.houseCount, density: city.strongest.density }
              : null,
          })),
        },
      });
    }
    if (req.method === "GET" && url.pathname === "/api/city") {
      return send(res, 200, cityOfFuture(db.businesses));
    }
    if (req.method === "GET" && url.pathname === "/api/market") {
      const business = sessionBusiness(db, header(req, "x-florens-token"));
      const enrich = (card, raw) => {
        const quarter = primaryQuarter(raw);
        return {
          ...card,
          quarterId: quarter?.id || null,
          quarterTitle: quarter?.title || null,
          placeTitle: quarter?.placeTitle || null,
        };
      };
      const seated = db.businesses.filter((item) => item.atTable);
      const cards = business
        ? rankMarket(business, db.businesses, 36).map((card) => {
          const raw = seated.find((item) => item.id === card.businessId);
          return enrich(card, raw);
        })
        : seated.slice(0, 36).map((item) => enrich(marketCard(item), item));
      return send(res, 200, {
        me: business ? { id: business.id, name: business.name, catalog: ensureCatalog(business) } : null,
        cards,
        motto: "Находите партнёров со смежной аудиторией и обменивайтесь клиентами. Клиент получает акции от обоих бизнесов.",
      });
    }
    if (req.method === "POST" && url.pathname === "/api/catalog") {
      const business = requireMember(db, req);
      if (business.kind !== "member") return send(res, 400, { error: "Каталог собирают в своём бизнесе, не в учебном." });
      const parsed = parseCatalogBody(body);
      if (parsed.error) return send(res, 400, { error: parsed.error });
      business.catalog = parsed.catalog;
      business.seek = parsed.catalog.seek;
      if (parsed.catalog.hook?.title) business.offer = parsed.catalog.hook.title;
      if (parsed.catalog.chips[0]?.title && !business.benefit) {
        business.benefit = parsed.catalog.chips[0].note || business.benefit;
      }
      save();
      return send(res, 200, { me: publicHouse(business, db), morning: morningOf(db, business) });
    }
    if (req.method === "POST" && url.pathname === "/api/register") {
      const email = clean(body.email, 120).toLowerCase();
      const name = clean(body.name, 120);
      const owner = clean(body.owner, 120);
      const city = clean(body.city, 80);
      const craft = clean(body.craft, 240);
      const offer = clean(body.offer, 300);
      if (!name || !owner || !email.includes("@") || !city || !craft || !offer) {
        return send(res, 400, { error: "Нужны название бизнеса, владелец, почта, город, сфера и предложение." });
      }
      const ticket = Number(body.ticket);
      if (!Number.isFinite(ticket) || ticket <= 0) return send(res, 400, { error: "Средний чек должен быть числом больше нуля." });
      if (db.businesses.some((item) => item.email.toLowerCase() === email)) {
        return send(res, 409, { error: "Эта почта уже сидит за столом. Войдите ею." });
      }
      const profile = inferProfile({ craft, about: body.about, ticket, city });
      const business = {
        id: newId("member"),
        kind: "member",
        atTable: false,
        name,
        owner,
        email,
        phone: clean(body.phone, 40),
        craft,
        about: clean(body.about, 600),
        offer,
        benefit: clean(body.benefit, 300) || "бонус для клиента, которого привёл смежный бизнес",
        seek: clean(body.seek, 280) || "смежных клиентов того же момента жизни",
        catalog: ensureCatalog({
          offer,
          craft,
          benefit: clean(body.benefit, 300),
          ticket,
          seek: clean(body.seek, 280) || "смежных клиентов того же момента жизни",
        }),
        ...profile,
        ticket,
        city,
        ages: agesFromProfile(profile),
        suppressed: [],
        paidAt: null,
        seat: null,
        waveAt: null,
        waveStatus: null,
        wavesDone: 0,
        createdAt: new Date().toISOString(),
      };
      const token = newId("door");
      db.businesses.push(business);
      db.sessions.push({ token, businessId: business.id, at: business.createdAt });
      save();
      return send(res, 200, { token, me: publicHouse(business, db) });
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      const email = clean(body.email, 120).toLowerCase();
      const business = db.businesses.find((item) => item.email.toLowerCase() === email);
      if (!business) return send(res, 404, { error: "Такой почты за столом нет." });
      const token = newId("door");
      db.sessions.push({ token, businessId: business.id, at: new Date().toISOString() });
      save();
      return send(res, 200, { token, me: publicHouse(business, db) });
    }
    if (req.method === "GET" && url.pathname === "/api/me") {
      const business = requireMember(db, req);
      return send(res, 200, { me: publicHouse(business, db), seats: SEATS });
    }
    if (req.method === "POST" && url.pathname === "/api/pay") {
      const business = requireMember(db, req);
      if (business.kind !== "member") return send(res, 400, { error: "Учебный бизнес уже в сети. Свой регистрируют отдельной почтой." });
      if (licenseLive(business) && business.paidAt) return send(res, 400, { error: "Годовая лицензия ещё действует." });
      const seat = seatById(body.seat || business.seat);
      if (!seat) return send(res, 400, { error: "Выберите лицензию: Нить, Поток или Казна." });
      const at = new Date().toISOString();
      if (!business.paidAt) business.paidAt = at;
      business.seat = seat.id;
      business.atTable = true;
      business.licenseUntil = licenseUntil(new Date());
      db.payments.push({ id: newId("pay"), businessId: business.id, seat: seat.id, title: seat.title, amount: seat.price, at, method: "contour", term: "year" });
      ensureSchedule(business, clientsOf(db, business.id).length);
      save();
      return send(res, 200, { me: publicHouse(business, db), morning: morningOf(db, business) });
    }
    if (req.method === "POST" && url.pathname === "/api/clients") {
      const business = requireMember(db, req);
      if (business.kind !== "member") return send(res, 400, { error: "Базу заносят в свой бизнес, не в учебный." });
      if (!body.attest) return send(res, 400, { error: "Нужно подтвердить, что это ваши клиенты и им можно написать." });
      business.consent = { at: new Date().toISOString(), text: "Хозяин подтвердил основание писать своим клиентам." };
      const rows = Array.isArray(body.rows) ? body.rows : parseCsv(body.csv || "");
      if (!rows.length) return send(res, 400, { error: "В базе нет ни одной строки." });
      if (body.mode === "replace") db.clients = db.clients.filter((client) => client.businessId !== business.id);
      const seen = new Set(clientsOf(db, business.id).map((client) => `${client.name.toLowerCase()}|${client.contact.toLowerCase()}`));
      let added = 0;
      for (const row of rows) {
        const name = clean(row.name, 120);
        const contact = clean(row.contact, 160);
        if (!name) continue;
        const key = `${name.toLowerCase()}|${contact.toLowerCase()}`;
        if (seen.has(key)) continue;
        if (clientsOf(db, business.id).length >= 5000) break;
        seen.add(key);
        db.clients.push({
          id: newId("client"),
          businessId: business.id,
          name,
          contact,
          note: clean(row.note, 300),
          spend: Number(row.spend) || 0,
          city: clean(row.city, 80) || business.city,
          age: validAge(row.age),
          consentAt: new Date().toISOString(),
        });
        added += 1;
      }
      ensureSchedule(business, clientsOf(db, business.id).length);
      save();
      return send(res, 200, { added, me: publicHouse(business, db), morning: morningOf(db, business) });
    }
    if (req.method === "POST" && url.pathname === "/api/picks") {
      const business = requireMember(db, req);
      if (business.kind !== "member") return send(res, 400, { error: "Связки отмечают в своём бизнесе." });
      const bundle = ideaBundle(db, business);
      const allowed = new Set(bundle.ideas.map((item) => item.id));
      const sliceIds = new Set(bundle.slices.map((item) => item.id));
      const ideas = [...new Set((Array.isArray(body.ideas) ? body.ideas : []).map((item) => String(item)).filter((item) => allowed.has(item)))].slice(0, 30);
      let audience = [...new Set((Array.isArray(body.audience) ? body.audience : []).map((item) => String(item)).filter((item) => sliceIds.has(item)))];
      if (!audience.length || audience.includes("all")) audience = ["all"];
      else audience = audience.filter((item) => item !== "all").slice(0, 8);
      business.picks = { ideas, audience };
      save();
      return send(res, 200, { me: publicHouse(business, db), morning: morningOf(db, business) });
    }
    if (req.method === "GET" && url.pathname === "/api/morning") {
      const business = requireMember(db, req);
      return send(res, 200, morningOf(db, business));
    }
    if (req.method === "POST" && url.pathname === "/api/deals") {
      const business = requireMember(db, req);
      if (!licenseLive(business)) return send(res, 400, { error: "Сделка предлагается при действующей лицензии." });
      const amount = Math.round(Number(body.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 100_000_000) return send(res, 400, { error: "Сумма сделки не читается." });
      const partner = db.businesses.find((item) => item.id === body.partnerId && item.kind === "member" && item.id !== business.id);
      if (!partner) return send(res, 400, { error: "Подтвердить обмен может только другой зарегистрированный бизнес." });
      const clientName = clean(body.clientName, 120);
      const clientContact = clean(body.clientContact, 160);
      if (!clientName && !clientContact) return send(res, 400, { error: "Нужны имя или контакт клиента из базы соседа." });
      const matched = findExchangeClient(clientsOf(db, partner.id), { name: clientName, contact: clientContact });
      if (!matched) {
        return send(res, 400, {
          error: clientContact
            ? "Такого контакта нет в базе партнёра обмена."
            : "Клиент должен однозначно быть в базе партнёра: укажите контакт или точное уникальное имя.",
        });
      }
      const fee = Math.round(amount * FEE_RATE);
      const deal = {
        id: newId("deal"),
        at: new Date().toISOString(),
        status: "pending",
        beneficiaryId: business.id,
        partnerId: partner.id,
        partnerName: partner.name,
        sellerName: business.name,
        clientId: matched.id,
        clientName: matched.name,
        clientContact: matched.contact,
        bonus: partner.benefit || business.benefit || "",
        amount,
        fee,
        net: amount - fee,
        amountLocked: false,
        sellerConfirmed: true,
        partnerConfirmed: false,
      };
      db.deals.push(deal);
      save();
      return send(res, 200, { deal, me: publicHouse(business, db), treasury: treasuryOf(db) });
    }
    if (req.method === "POST" && url.pathname === "/api/deals/confirm") {
      const business = requireMember(db, req);
      const deal = db.deals.find((item) => item.id === body.dealId);
      if (!deal) return send(res, 404, { error: "Сделка не найдена." });
      if (business.id !== deal.beneficiaryId && business.id !== deal.partnerId) return send(res, 403, { error: "Эту сделку подтверждают только два бизнеса обмена." });
      if (isConfirmed(deal) || deal.amountLocked) {
        return send(res, 400, { error: "Сделка уже подтверждена. Сумму и статус менять нельзя." });
      }
      if (business.id === deal.beneficiaryId && body.amount) {
        const amount = Math.round(Number(body.amount));
        if (!Number.isFinite(amount) || amount < 1 || amount > 100_000_000) return send(res, 400, { error: "Сумма сделки не читается." });
        deal.amount = amount;
        deal.fee = Math.round(amount * FEE_RATE);
        deal.net = amount - deal.fee;
      }
      closeDeal(deal, business.id);
      save();
      return send(res, 200, { deal, me: publicHouse(business, db), treasury: treasuryOf(db) });
    }
    if (req.method === "POST" && url.pathname === "/api/stop") {
      const contact = clean(body.contact, 160).toLowerCase();
      if (!contact) return send(res, 400, { error: "Нужен адрес или телефон." });
      let touched = 0;
      for (const business of db.businesses) {
        const owns = db.clients.some((client) => client.businessId === business.id && String(client.contact || "").toLowerCase() === contact);
        const mailed = db.journal.some((item) => item.businessId === business.id && String(item.contact || "").toLowerCase() === contact);
        if (!owns && !mailed) continue;
        business.suppressed ||= [];
        if (!business.suppressed.includes(contact)) business.suppressed.push(contact);
        touched += 1;
      }
      for (const item of db.journal) {
        if (String(item.contact || "").toLowerCase() === contact) item.status = "stopped";
      }
      if (!touched && !db.journal.some((item) => String(item.contact || "").toLowerCase() === contact)) {
        return send(res, 404, { error: "Такого адреса в контуре нет." });
      }
      save();
      return send(res, 200, { stopped: true });
    }
    if (req.method === "POST" && url.pathname === "/api/guest") {
      const name = clean(body.name, 120);
      const contact = clean(body.contact, 160);
      const city = clean(body.city, 80);
      const request = clean(body.request, 400);
      const age = validAge(body.age);
      const price = validPrice(body.price);
      if (!name || !contact || !city || !request || !age || !price) {
        return send(res, 400, { error: "Нужны имя, контакт, город, запрос, возраст и цена." });
      }
      if (!body.consent) return send(res, 400, { error: "Нужно согласие получить предложения платформы." });
      const guest = {
        id: newId("guest"),
        name,
        contact,
        city,
        request,
        age,
        price,
        consentAt: new Date().toISOString(),
      };
      db.guests.push(guest);
      const token = newId("guest");
      db.guestSessions.push({ token, guestId: guest.id, at: guest.consentAt });
      save();
      return send(res, 200, { token, offers: offersFor(db, guest) });
    }
    if (req.method === "GET" && url.pathname === "/api/guest/offers") {
      const guest = guestOf(db, header(req, "x-florens-guest"));
      if (!guest) return send(res, 401, { error: "Сначала откройте дверь клиента." });
      return send(res, 200, { guest: { name: guest.name, city: guest.city, age: guest.age, price: guest.price }, offers: offersFor(db, guest) });
    }
    if (req.method === "POST" && url.pathname === "/api/guest/claim") {
      const guest = guestOf(db, header(req, "x-florens-guest"));
      if (!guest) return send(res, 401, { error: "Сначала откройте дверь клиента." });
      const business = db.businesses.find((item) => item.id === body.businessId && item.atTable);
      if (!business) return send(res, 404, { error: "Бизнес не найден." });
      const fit = guestFit(guest, business);
      if (!fit) return send(res, 400, { error: "Это предложение не сходится с запросом." });
      const source = db.businesses.find((item) => item.kind === "member" && item.id !== business.id && db.clients.some((client) => client.businessId === item.id && String(client.contact || "").toLowerCase() === guest.contact.toLowerCase()));
      const claim = {
        id: newId("claim"),
        at: new Date().toISOString(),
        guestId: guest.id,
        guestName: guest.name,
        businessId: business.id,
        sourceId: source?.id || null,
        bonus: fit.bonus,
        reasons: fit.reasons,
      };
      db.claims.push(claim);
      const deal = {
        id: newId("deal"),
        at: claim.at,
        status: "pending",
        claimId: claim.id,
        beneficiaryId: business.id,
        partnerId: source?.id || null,
        partnerName: source?.name || "клиент платформы",
        sellerName: business.name,
        clientName: guest.name,
        bonus: fit.bonus,
        amount: 0,
        fee: 0,
        net: 0,
        sellerConfirmed: false,
        partnerConfirmed: !source,
      };
      db.deals.push(deal);
      save();
      return send(res, 200, { claim, bonus: fit.bonus, offer: fit.offer });
    }
    if (req.method === "POST" && url.pathname === "/api/suppress") {
      const business = requireMember(db, req);
      const contact = clean(body.contact, 160).toLowerCase();
      if (!contact) return send(res, 400, { error: "Нужен адрес или телефон." });
      if (!business.suppressed.includes(contact)) business.suppressed.push(contact);
      save();
      return send(res, 200, { me: publicHouse(business, db) });
    }
    if (req.method === "GET" && url.pathname === "/api/packet") {
      const business = requireMember(db, req);
      const morning = morningOf(db, business);
      const which = url.searchParams.get("which") === "last" && morning.last ? morning.last.plan : morning.preview;
      const title = url.searchParams.get("which") === "last" && morning.last ? "проведённое утро" : "пачка следующего утра";
      return send(res, 200, packetText(title, which), {
        "Content-Disposition": "attachment; filename=florens-utro.txt",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/house") {
      if (!keysMatch(header(req, "x-house-key"))) return send(res, 403, { error: "Ключ платформы не подходит." });
      const confirmed = db.deals.filter(isConfirmed);
      return send(res, 200, {
        treasury: treasuryOf(db),
        room: {
          licenses: db.businesses.filter((item) => item.kind === "member" && licenseLive(item)).length,
          journal: db.journal.length,
          stops: db.journal.filter((item) => item.status === "stopped").length,
          claims: db.claims.length,
          guests: db.guests.length,
          confirmed: confirmed.length,
          pending: db.deals.length - confirmed.length,
          gmv: confirmed.reduce((sum, item) => sum + item.amount, 0),
        },
        payments: [...db.payments].reverse().slice(0, 40),
        deals: confirmed.slice().reverse().slice(0, 40),
        members: db.businesses.filter((item) => item.kind === "member").map((item) => ({
          id: item.id,
          name: item.name,
          city: item.city,
          craft: item.craft,
          seat: item.seat,
          paidAt: item.paidAt,
          clientCount: clientsOf(db, item.id).length,
          waveAt: item.waveAt,
          wavesDone: item.wavesDone || 0,
          licenseUntil: item.licenseUntil || null,
          books: booksOf(db, item.id),
        })),
        cities: cityBoard(db),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/house/open") {
      if (!keysMatch(header(req, "x-house-key"))) return send(res, 403, { error: "Ключ платформы не подходит." });
      const business = db.businesses.find((item) => item.id === body.businessId && item.kind === "member");
      if (!business) return send(res, 404, { error: "Член не найден." });
      if (!waveReady(business, clientsOf(db, business.id).length)) {
        return send(res, 400, { error: "Утро открывается после оплаты и базы." });
      }
      const wave = fireWave(db, business, new Date(), "хозяин открыл утро");
      save();
      return send(res, 200, { waveId: wave.id, letters: wave.plan.letters.length, links: wave.plan.links.length });
    }
    if (req.method === "GET" && url.pathname === "/api/deals/pdf") {
      const business = requireMember(db, req);
      const dealId = clean(url.searchParams.get("id"), 80);
      if (!dealId) return send(res, 400, { error: "Нужен id сделки." });
      const deal = db.deals.find((item) => item.id === dealId);
      if (!deal) return send(res, 404, { error: "Сделка не найдена." });
      if (business.id !== deal.beneficiaryId && business.id !== deal.partnerId) {
        return send(res, 403, { error: "PDF сделки доступен только участникам обмена." });
      }
      const doc = buildDealPdf(deal, business);
      const ascii = asciiFilename(`deal-${deal.id}`);
      const utf8 = utf8Filename(`Сделка ${deal.clientName || deal.id}.pdf`);
      return pipePdf(res, doc, ascii, utf8);
    }
    if (req.method === "GET" && url.pathname === "/api/catalog/pdf") {
      const business = requireMember(db, req);
      const doc = buildCatalogPdf(business);
      const ascii = asciiFilename(`catalog-${business.id}`);
      const utf8 = utf8Filename(`Каталог ${business.name || business.id}.pdf`);
      return pipePdf(res, doc, ascii, utf8);
    }

    // —— Дарующий расцвет / CrossFlow ——
    if (req.method === "GET" && url.pathname === "/api/crossflow") {
      const business = requireMember(db, req);
      return send(res, 200, crossflowSnapshot(db, business));
    }
    if (req.method === "GET" && url.pathname === "/api/passport") {
      const business = requireMember(db, req);
      const snap = crossflowSnapshot(db, business);
      return send(res, 200, { passport: snap.passport, matchReady: snap.matchReady });
    }
    if (req.method === "PUT" && url.pathname === "/api/passport") {
      const business = requireMember(db, req);
      const parsed = parsePassportBody(body);
      if (parsed.error) return send(res, 400, { error: parsed.error });
      const passport = upsertPassport(db, business, parsed.passport);
      save();
      return send(res, 200, { passport, me: publicHouse(business, db), crossflow: crossflowSnapshot(db, business) });
    }
    if (req.method === "GET" && url.pathname === "/api/gifts") {
      const business = requireMember(db, req);
      return send(res, 200, { gifts: crossflowSnapshot(db, business).gifts });
    }
    if (req.method === "POST" && url.pathname === "/api/gifts") {
      const business = requireMember(db, req);
      const parsed = parseGiftBody(body);
      if (parsed.error) return send(res, 400, { error: parsed.error });
      const result = createGift(db, business, parsed.gift);
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, { gift: result.gift, crossflow: crossflowSnapshot(db, business) });
    }
    if (req.method === "GET" && url.pathname === "/api/match") {
      const business = requireMember(db, req);
      if (!passportReady(db, business.id)) {
        return send(res, 400, { error: "Сначала заполните паспорт скрытых ресурсов — без него подбор партнёров закрыт." });
      }
      const limit = Math.min(24, Math.max(3, Number(url.searchParams.get("limit")) || 12));
      const mode = clean(url.searchParams.get("mode"), 20) === "coopetition" ? "coopetition" : "adjacent";
      return send(res, 200, {
        mode,
        partners: matchPartners(db, business, limit, { mode }),
        brand: "Dante Florens · Дарующий расцвет",
      });
    }
    if (req.method === "POST" && url.pathname === "/api/bundles/generate") {
      const business = requireMember(db, req);
      if (!passportReady(db, business.id)) {
        return send(res, 400, { error: "Сначала заполните паспорт скрытых ресурсов." });
      }
      const mode = clean(body.mode, 20) === "coopetition" ? "coopetition" : "adjacent";
      const template = clean(body.template, 40) || (mode === "coopetition" ? "overflow" : "gift");
      const result = generateBundle(db, business, clean(body.partnerId, 80), { mode, template });
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, { bundle: result.bundle, crossflow: crossflowSnapshot(db, business) });
    }
    if (req.method === "POST" && url.pathname === "/api/bundles/select") {
      const business = requireMember(db, req);
      const bundle = db.bundles.find((item) => item.id === clean(body.bundleId, 80));
      if (!bundle) return send(res, 404, { error: "Связка не найдена." });
      if (bundle.leftId !== business.id && bundle.rightId !== business.id) {
        return send(res, 403, { error: "Чужая связка." });
      }
      const result = selectBundleOffer(bundle, clean(body.offerId, 80));
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, { bundle: result.bundle });
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/bundles/") && url.pathname.endsWith("/publish")) {
      const business = requireMember(db, req);
      const bundleId = clean(url.pathname.slice("/api/bundles/".length, -"/publish".length), 80);
      const protectedServices = Array.isArray(body.protectedServices)
        ? body.protectedServices
        : String(body.protectedServicesText || "")
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
      const result = publishBundle(db, business, bundleId, {
        pactAccepted: Boolean(body.pactAccepted),
        protectedServices,
        returnAnchor: body.returnAnchor,
        revsharePct: body.revsharePct,
      });
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, {
        bundle: result.bundle,
        claimPath: result.bundle.shortPath,
        crossflow: crossflowSnapshot(db, business),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/slots") {
      const business = requireMember(db, req);
      return send(res, 200, { slots: listSlots(db, business.id) });
    }
    if (req.method === "POST" && url.pathname === "/api/slots") {
      const business = requireMember(db, req);
      const result = createSlot(db, business, body);
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, { slot: result.slot, crossflow: crossflowSnapshot(db, business) });
    }
    if (req.method === "POST" && url.pathname === "/api/handoff") {
      const business = requireMember(db, req);
      if (!passportReady(db, business.id)) {
        return send(res, 400, { error: "Сначала заполните паспорт." });
      }
      const result = createHandoff(db, business, body);
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, {
        handoff: result.handoff,
        bundle: result.bundle,
        coupon: result.coupon,
        claimPath: result.bundle.shortPath,
        crossflow: crossflowSnapshot(db, business),
      });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/handoff/")) {
      const business = requireMember(db, req);
      const id = clean(decodeURIComponent(url.pathname.slice("/api/handoff/".length)), 80);
      const handoff = handoffOf(db, id);
      if (!handoff) return send(res, 404, { error: "Передача не найдена." });
      if (handoff.fromId !== business.id && handoff.toId !== business.id) {
        return send(res, 403, { error: "Чужая передача." });
      }
      return send(res, 200, { handoff });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/c/") && !url.pathname.includes("/claim")) {
      const code = clean(decodeURIComponent(url.pathname.slice("/api/c/".length)), 40);
      const view = publicCouponView(db, code);
      if (view.error) return send(res, view.status || 400, { error: view.error });
      return send(res, 200, view);
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/c/") && url.pathname.endsWith("/claim")) {
      const code = clean(decodeURIComponent(url.pathname.slice("/api/c/".length, -"/claim".length)), 40);
      const result = claimCoupon(db, code, body, { ip: clientIp(req) });
      if (result.error && !result.coupon) return send(res, 400, { error: result.error });
      if (result.error && result.coupon) return send(res, 409, { error: result.error, coupon: result.coupon });
      save();
      return send(res, 200, result);
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/cashier/")) {
      const token = clean(decodeURIComponent(url.pathname.slice("/api/cashier/".length).split("/")[0]), 40);
      const ctx = cashierContext(db, token);
      if (ctx.error) return send(res, ctx.status || 400, { error: ctx.error });
      return send(res, 200, ctx);
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/cashier/") && url.pathname.endsWith("/redeem")) {
      const token = clean(decodeURIComponent(url.pathname.slice("/api/cashier/".length, -"/redeem".length)), 40);
      const result = redeemCoupon(db, token, body, { ip: clientIp(req) });
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/wallet") {
      const business = requireMember(db, req);
      const snap = crossflowSnapshot(db, business);
      return send(res, 200, snap.wallet);
    }
    if (req.method === "POST" && url.pathname === "/api/wallet/spend") {
      const business = requireMember(db, req);
      const result = spendLeadCoins(db, business, body);
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, { ...result, wallet: crossflowSnapshot(db, business).wallet });
    }
    if (req.method === "GET" && url.pathname === "/api/analytics/funnel") {
      const business = requireMember(db, req);
      return send(res, 200, { funnel: crossflowSnapshot(db, business).funnel });
    }
    if (req.method === "GET" && url.pathname === "/api/tariffs") {
      return send(res, 200, { tariffs: Object.values(TARIFFS) });
    }
    if (req.method === "POST" && url.pathname === "/api/tariff") {
      const business = requireMember(db, req);
      const result = setTariff(db, business, clean(body.tariff || body.id, 40));
      if (result.error) return send(res, 400, { error: result.error });
      save();
      return send(res, 200, { tariff: result.tariff, me: publicHouse(business, db), crossflow: crossflowSnapshot(db, business) });
    }

    return send(res, 404, { error: "Такого хода нет." });
  }

  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const fromClient = requested.startsWith("/src/client/");
  const baseDir = fromClient ? clientDir : publicDir;
  const relative = fromClient ? requested.slice("/src/client/".length) : requested;
  const file = path.normalize(path.join(baseDir, relative));
  if (!file.startsWith(baseDir + path.sep)) return send(res, 403, "Закрыто.");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "Нет страницы.");
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

function send(res, code, body, extra = {}) {
  const text = typeof body === "string";
  res.writeHead(code, {
    "Content-Type": text ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(text ? body : JSON.stringify(body));
}

function pdfHeaders(filenameAscii, filenameUtf8) {
  const ascii = String(filenameAscii || "document.pdf").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(String(filenameUtf8 || ascii));
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };
}

function pipePdf(res, doc, filenameAscii, filenameUtf8) {
  res.writeHead(200, pdfHeaders(filenameAscii, filenameUtf8));
  const fail = () => {
    try {
      doc.destroy();
    } catch {
      /* already closed */
    }
  };
  doc.on("error", fail);
  res.on("close", () => {
    if (!res.writableFinished) fail();
  });
  doc.pipe(res);
  doc.end();
}

let httpServer = null;
let dueTimer = null;
let shuttingDown = false;

function listen(port) {
  const host = process.env.HOST || "127.0.0.1";
  const allowPortHop = host === "127.0.0.1" || host === "localhost";
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) return;
      send(res, error.status || 500, { error: error.message || "Сбой контура." });
    });
  });
  server.on("error", (error) => {
    // В Docker порт зафиксирован пробросом — прыжок ломает mapping.
    if (error.code === "EADDRINUSE" && allowPortHop && port < 4187) listen(port + 1);
    else throw error;
  });
  server.listen(port, host, () => {
    runDue();
    dueTimer = setInterval(() => runDue(), 30_000);
    const key = houseKey();
    const { dataDir, dbFile } = paths();
    fs.writeFileSync(path.join(dataDir, "port.txt"), String(port), "utf8");
    console.log(`Dante Florens слушает http://${host}:${port}`);
    console.log(`SQLite: ${dbFile}`);
    console.log(`Ключ казны: ${key}`);
  });
  httpServer = server;
  return server;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Остановка (${signal})…`);
  if (dueTimer) {
    clearInterval(dueTimer);
    dueTimer = null;
  }
  const finish = () => {
    try {
      closeStore();
    } catch {
      /* already closed */
    }
    process.exit(0);
  };
  if (!httpServer) return finish();
  const force = setTimeout(() => {
    console.error("Grace period истёк — принудительный выход.");
    finish();
  }, 12_000);
  if (typeof force.unref === "function") force.unref();
  httpServer.close(() => {
    clearTimeout(force);
    finish();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

load();
listen(Number(process.env.PORT) || 4177);
