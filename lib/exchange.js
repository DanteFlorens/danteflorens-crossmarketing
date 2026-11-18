import { ensureCatalog } from "./catalog.js";
import { CHAINS, SITUATION_KEYS, SITUATION_TITLES, cityKey, hasStem } from "./ontology.js";

export const CITY_MARK = 30;

export const AGES = [
  { id: "family", title: "Семьи с детьми" },
  { id: "young", title: "18–30" },
  { id: "mid", title: "31–45" },
  { id: "mature", title: "46–60" },
  { id: "senior", title: "60+" },
];

export const PRICES = [
  { id: "modest", title: "до 5 тыс." },
  { id: "middle", title: "5–30 тыс." },
  { id: "high", title: "30–150 тыс." },
  { id: "estate", title: "выше 150 тыс." },
];

const AGE_IDS = new Set(AGES.map((item) => item.id));
const PRICE_IDS = new Set(PRICES.map((item) => item.id));

export function ageTitle(id) {
  return AGES.find((item) => item.id === id)?.title || id;
}

export function priceTitle(id) {
  return PRICES.find((item) => item.id === id)?.title || id;
}

export function validAge(id) {
  return AGE_IDS.has(id) ? id : "";
}

export function validPrice(id) {
  return PRICE_IDS.has(id) ? id : "";
}

export function agesFromProfile(profile) {
  const personas = new Set(profile?.personas || []);
  const situations = new Set(profile?.situations || []);
  const ages = [];
  if (personas.has("parents") || personas.has("families") || situations.has("child")) ages.push("family");
  if (personas.has("brides") || personas.has("athletes") || personas.has("appearance")) ages.push("young");
  if (personas.has("homeowners") || personas.has("business_owners") || personas.has("diners")) ages.push("mid");
  if (personas.has("affluent")) ages.push("mature");
  if (situations.has("health") && !ages.includes("senior")) ages.push("mature");
  if (!ages.length) ages.push("mid");
  return [...new Set(ages)];
}

export function situationsIn(text) {
  const found = [];
  for (const [situation, keys] of Object.entries(SITUATION_KEYS)) {
    if ((keys || []).some((key) => hasStem(text || "", key))) found.push(situation);
  }
  return found;
}

export function licenseUntil(from = new Date()) {
  const next = new Date(from);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next.toISOString();
}

export function licenseLive(business, now = new Date()) {
  if (!business?.paidAt) return false;
  if (!business.licenseUntil) return true;
  return new Date(business.licenseUntil) > now;
}

function bandGap(a, b) {
  const order = ["modest", "middle", "high", "estate"];
  const left = order.indexOf(a);
  const right = order.indexOf(b);
  if (left < 0 || right < 0) return 3;
  return Math.abs(left - right);
}

export function pairReasons(a, b) {
  const reasons = [];
  const shared = (a?.situations || []).filter((item) => (b?.situations || []).includes(item));
  if (shared[0]) reasons.push(`смежная потребность: ${SITUATION_TITLES[shared[0]]}`);
  const chain = CHAINS.find((item) => item.roles.includes(a?.role) && item.roles.includes(b?.role) && a?.role !== b?.role);
  if (chain) reasons.push(`похожая идея: ${chain.title}`);
  if (a?.band && a.band === b?.band) reasons.push(`одна цена: ${priceTitle(a.band)}`);
  else if (bandGap(a?.band, b?.band) === 1) reasons.push("близкий чек");
  const ages = (a?.ages || []).filter((item) => (b?.ages || []).includes(item));
  if (ages.length) reasons.push(`возраст: ${ages.map(ageTitle).join(", ")}`);
  return reasons;
}

export function guestFit(guest, business) {
  if (!guest || !business || business.atTable === false) return null;
  const request = situationsIn(`${guest.request || ""} ${guest.note || ""}`);
  const shared = request.filter((item) => (business.situations || []).includes(item));
  const ageOk = Boolean(guest.age) && (business.ages || []).includes(guest.age);
  const gap = bandGap(guest.price, business.band);
  const priceOk = Boolean(guest.price) && gap <= 1;
  const sameCity = cityKey(guest.city) && cityKey(guest.city) === cityKey(business.city);
  if (!shared.length && !ageOk && !priceOk) return null;
  const reasons = [];
  if (shared[0]) reasons.push(`похожий запрос: ${SITUATION_TITLES[shared[0]]}`);
  if (shared[0]) reasons.push(`смежная потребность: ${SITUATION_TITLES[shared[0]]}`);
  if (ageOk) reasons.push(`возраст: ${ageTitle(guest.age)}`);
  if (guest.price && guest.price === business.band) reasons.push(`одна цена: ${priceTitle(guest.price)}`);
  else if (priceOk) reasons.push("близкий чек");
  const chain = CHAINS.find((item) => shared.length && item.roles.includes(business.role) && item.roles.some((role) => role !== business.role));
  if (chain && shared.length) reasons.push(`похожая идея: ${chain.title}`);
  let score = shared.length * 3 + (ageOk ? 2 : 0) + (priceOk ? 2 : 0) + (sameCity ? 2 : 0);
  if (!sameCity) score -= 1;
  const catalog = ensureCatalog(business);
  if (catalog.hook) {
    reasons.push(`красная цена: ${catalog.hook.title}`);
    score += 1;
  }
  if (catalog.chips[0]) reasons.push(`товар/услуга: ${catalog.chips[0].title}`);
  return {
    score,
    reasons: [...new Set(reasons)],
    bonus: business.benefit || "предложение для клиента платформы",
    offer: catalog.hook?.title || business.offer || business.craft,
    catalog,
  };
}

export function closeDeal(deal, actorId) {
  if (!deal || deal.status === "confirmed") return deal;
  if (actorId && actorId === deal.beneficiaryId) deal.sellerConfirmed = true;
  if (actorId && deal.partnerId && actorId === deal.partnerId) deal.partnerConfirmed = true;
  const partnerOk = !deal.partnerId || deal.partnerConfirmed;
  if (deal.sellerConfirmed && partnerOk && Number(deal.amount) >= 1) {
    deal.status = "confirmed";
    deal.confirmedAt = deal.confirmedAt || new Date().toISOString();
    deal.amountLocked = true;
  }
  return deal;
}

export function isConfirmed(deal) {
  return deal?.status === "confirmed";
}

/** Клиент обмена должен быть в базе партнёра: точный контакт или однозначное имя. */
export function findExchangeClient(clients, { name, contact } = {}) {
  const list = Array.isArray(clients) ? clients : [];
  const contactKey = String(contact || "").trim().toLowerCase();
  const nameKey = String(name || "").trim().toLowerCase();
  if (contactKey) {
    return list.find((item) => String(item.contact || "").trim().toLowerCase() === contactKey) || null;
  }
  if (!nameKey) return null;
  const matches = list.filter((item) => String(item.name || "").trim().toLowerCase() === nameKey);
  if (matches.length === 1) return matches[0];
  return null;
}
