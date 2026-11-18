import crypto from "crypto";
import { ensureCatalog } from "./catalog.js";
import { newId } from "./store.js";

export const REVSHARE_DEFAULT = 15;
export const HOT_COIN_MULT = 1.5;
const LEAD_COIN_RUB = 100;

function passportOf(db, businessId) {
  return (db.passports || []).find((item) => item.businessId === businessId) || null;
}

function giftsOf(db, businessId) {
  return (db.gifts || []).filter((item) => item.businessId === businessId);
}

function tariffOf(business) {
  const id = business?.crossTariff || "start";
  const caps = { start: 3, pro: Infinity, network: Infinity };
  return { id, title: id, partners: caps[id] ?? 3 };
}

function walletBalance(db, businessId) {
  return (db.leadLedger || [])
    .filter((item) => item.businessId === businessId)
    .reduce((sum, item) => sum + Number(item.delta || 0), 0);
}

function shortCode(bytes = 5) {
  return crypto.randomBytes(bytes).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
}

function ensureCashier(db, businessId) {
  db.cashierTokens ||= [];
  let row = db.cashierTokens.find((item) => item.businessId === businessId && item.active !== false);
  if (row) return row;
  row = {
    id: newId("cash"),
    businessId,
    token: shortCode(8),
    active: true,
    createdAt: new Date().toISOString(),
  };
  db.cashierTokens.push(row);
  return row;
}

export const COOP_TEMPLATES = {
  overflow: {
    id: "overflow",
    title: "Отказной трафик",
    billing: { kind: "revshare", revsharePct: 15 },
  },
  specialty: {
    id: "specialty",
    title: "Долечивание / оборудование",
    billing: { kind: "leadcoins", revsharePct: 0 },
  },
  geo: {
    id: "geo",
    title: "Географический обмен",
    billing: { kind: "revshare", revsharePct: 15 },
  },
};

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function districtOf(business, passport) {
  const raw =
    passport?.district ||
    business.district ||
    business.area ||
    clean(String(business.about || "").match(/район[ае]?\s+([^\s,.]+)/i)?.[1] || "", 40) ||
    "";
  return clean(raw, 60).toLowerCase() || "центр";
}

function sameNiche(a, b) {
  if (a.role && b.role && a.role === b.role && a.role !== "bespoke") return true;
  const ca = String(a.craft || "").toLowerCase();
  const cb = String(b.craft || "").toLowerCase();
  if (!ca || !cb) return false;
  const stems = ["стомат", "клиник", "медицин", "автосервис", "автомойк", "салон", "строит", "ремонт"];
  return stems.some((stem) => ca.includes(stem) && cb.includes(stem));
}

function openSlotsOf(db, businessId) {
  return (db.overloadSlots || []).filter(
    (item) => item.businessId === businessId && item.status === "open",
  );
}

/** Скоринг коллег по нише: разные районы / слоты / простой выше; клон того же района — ниже. */
export function scoreCoopetition(db, a, b) {
  if (!a || !b || a.id === b.id) return null;
  if (!sameNiche(a, b)) return null;
  const passA = passportOf(db, a.id);
  const passB = passportOf(db, b.id);
  const distA = districtOf(a, passA);
  const distB = districtOf(b, passB);
  const differentDistrict = distA !== distB;
  const slots = openSlotsOf(db, b.id).length;
  const idle = Boolean(passB?.idleWindows);
  let score = 0.42;
  if (differentDistrict) score += 0.22;
  else score -= 0.12;
  if (slots > 0) score += 0.2;
  if (idle) score += 0.08;
  if (passB?.locomotive) score += 0.05;
  score = Math.max(0.2, Math.min(0.95, score));
  const whyParts = [
    differentDistrict
      ? `разные районы (${distA || "—"} / ${distB || "—"})`
      : "один район — слабее для гео-обмена",
    slots ? `открытых слотов перегрузки: ${slots}` : null,
    idle ? `есть окна простоя: ${passB.idleWindows}` : null,
    "коллега по нише · режим коопетиции",
  ].filter(Boolean);
  return {
    score,
    density: Math.round(score * 100),
    quality: score >= 0.7 ? "крепкая" : score >= 0.45 ? "рабочая" : "осторожная",
    chainTitle: "коопетиция · коллеги по нише",
    syllogism: `«${a.name}» и «${b.name}» — одна ниша. ${whyParts.join("; ")}.`,
    why: whyParts.join("; "),
    district: distB,
    openSlots: slots,
    mode: "coopetition",
  };
}

export function matchCoopetition(db, business, limit = 12) {
  const seated = (db.businesses || []).filter((item) => item.atTable && item.id !== business.id);
  const ranked = [];
  for (const other of seated) {
    const scored = scoreCoopetition(db, business, other);
    if (!scored) continue;
    const gift = giftsOf(db, other.id).find((item) => item.active !== false);
    ranked.push({
      businessId: other.id,
      name: other.name,
      city: other.city,
      craft: other.roleTitle || other.craft,
      density: scored.density,
      quality: scored.quality,
      chainTitle: scored.chainTitle,
      why: scored.why,
      district: scored.district,
      openSlots: scored.openSlots,
      mode: "coopetition",
      gift: gift ? { id: gift.id, title: gift.title, clientValue: gift.clientValue } : null,
      catalog: ensureCatalog(other),
      score: scored.score,
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

function defaultProtected(left) {
  const catalog = ensureCatalog(left);
  const titles = [];
  if (catalog.chips?.[0]?.title) titles.push(catalog.chips[0].title);
  if (catalog.chips?.[1]?.title) titles.push(catalog.chips[1].title);
  if (!titles.length && left.craft) titles.push(String(left.craft).slice(0, 80));
  if (!titles.length) titles.push("базовые услуги отправителя");
  return titles.slice(0, 5);
}

function giftTitle(db, business) {
  const gift = giftsOf(db, business.id).find((item) => item.active !== false);
  return gift?.title || ensureCatalog(business).hook?.title || business.offer || "приветственный бонус";
}

function giftValue(db, business) {
  const gift = giftsOf(db, business.id).find((item) => item.active !== false);
  if (gift) return gift.clientValue;
  return Number(ensureCatalog(business).hook?.price) || Math.round((business.ticket || 5000) * 0.2) || 1000;
}

export function generateCoopBundle(db, left, rightId, templateId = "overflow") {
  const right = db.businesses.find((item) => item.id === rightId && item.atTable);
  if (!right || right.id === left.id) return { error: "Партнёр не найден." };
  const scored = scoreCoopetition(db, left, right);
  if (!scored) return { error: "В режиме коопетиции нужны коллеги по нише (одна роль / близкий craft)." };

  const template = COOP_TEMPLATES[templateId] || COOP_TEMPLATES.overflow;
  const tariff = tariffOf(left);
  const publishedPartners = new Set(
    (db.bundles || [])
      .filter((item) => (item.leftId === left.id || item.rightId === left.id) && item.status === "published")
      .map((item) => (item.leftId === left.id ? item.rightId : item.leftId)),
  );
  if (Number.isFinite(tariff.partners) && !publishedPartners.has(right.id) && publishedPartners.size >= tariff.partners) {
    return { error: `На тарифе «${tariff.title}» максимум ${tariff.partners} партнёра. Перейдите на Pro.` };
  }

  const leftGift = giftTitle(db, left);
  const rightGift = giftTitle(db, right);
  const leftValue = giftValue(db, left);
  const rightValue = giftValue(db, right);
  const protectedServices = defaultProtected(left);
  const returnAnchor = `После визита в «${right.name}» вернитесь в «${left.name}»: бесплатная консультация по результатам / продолжение лечения у вашего врача.`;

  let offers;
  let script;
  let mailing;
  let chainTitle;

  if (template.id === "overflow") {
    chainTitle = "отказной трафик · нет окна";
    offers = [
      {
        id: "care-cert",
        title: "Заботливый сертификат",
        text: `Пациенту без окна сегодня — именной талон в «${right.name}» с бонусом ~${Math.min(1000, rightValue)} ₽ на приём. Вы не теряете лояльность; коллега закрывает пустое кресло.`,
      },
      {
        id: "hot-revshare",
        title: `RevShare ${template.billing.revsharePct}% с первого чека`,
        text: `Горячий лид уже готов платить. «${right.name}» принимает сегодня; вам — ${template.billing.revsharePct}% от чека или повышенные Лид-коины.`,
      },
      {
        id: "loyalty-keep",
        title: "Лояльность отправителя",
        text: `Сообщение пациенту: «Мы позаботились и нашли приём сегодня у проверенного коллеги». Бренд «${left.name}» усиливается заботой, а не отказом.`,
      },
    ];
    script = `На телефоне/ресепшене: «Свободных окон нет, но мы не бросаем вас — вот заботливый сертификат в «${right.name}» на сегодня, бонус на приём. После — ждем вас обратно к нам.» Покажите QR. Базы не передаём.`;
    mailing = [
      `Тема: Нашли вам приём сегодня`,
      ``,
      `Здравствуйте!`,
      `У нас сейчас нет окна, но мы договорились с «${right.name}».`,
      `Ваш заботливый сертификат: ${rightGift} (бонус ~${Math.min(1000, rightValue)} ₽).`,
      `Заберите по ссылке. Один контакт — один талон.`,
      ``,
      `${left.name}`,
      `Dante Florens · Дарующий расцвет`,
    ].join("\n");
  } else if (template.id === "specialty") {
    chainTitle = "долечивание · оборудование";
    offers = [
      {
        id: "referral-gift",
        title: "Направление-подарок на диагностику",
        text: `Пациенту «${left.name}» — подарок на чек-ап / снимок в «${right.name}» (${rightGift}). Коллега не переманивает на базовую терапию отправителя.`,
      },
      {
        id: "return-anchor",
        title: "Якорь возврата",
        text: returnAnchor,
      },
      {
        id: "pact",
        title: "Защищённый профиль",
        text: `Запрет коллеге продавать: ${protectedServices.join(", ")}. Пациент возвращается с результатами к вам.`,
      },
    ];
    script = `Скажите: «Для дообследования мы дарим направление в «${right.name}». Они вернут вас к нам с результатами — плюс бонус на консультацию у нас.» QR пациенту. Не передавайте базу.`;
    mailing = [
      `Тема: Подарок на диагностику у партнёра`,
      ``,
      `Здравствуйте!`,
      `Для точного плана лечения дарим вам: ${rightGift} в «${right.name}».`,
      `После — ждем вас обратно: ${returnAnchor}`,
      ``,
      `${left.name}`,
      `Dante Florens · Дарующий расцвет`,
    ].join("\n");
  } else {
    chainTitle = "гео-обмен · другой район";
    offers = [
      {
        id: "geo-pass",
        title: "Передача в удобный район",
        text: `Клиенту неудобен ваш район — передаём в «${right.name}» (${scored.district || "другой район"}) с реферальным вознаграждением с курса.`,
      },
      {
        id: "geo-revshare",
        title: `RevShare ${template.billing.revsharePct}%`,
        text: `Фиксируем за «${left.name}» долю с лечения у коллеги. Пациент получает бонус на старт курса.`,
      },
      {
        id: "geo-care",
        title: "Без потери лица",
        text: `Вы помогли найти удобную точку — лояльность сохраняется, деньги за реферал приходят через платформу.`,
      },
    ];
    script = `Скажите: «Вам далеко ездить на курс — передадим вас коллегам «${right.name}» ближе к дому, с бонусом на старт. Мы остаёмся на связи по качеству.» QR.`;
    mailing = [
      `Тема: Клиника ближе к вам`,
      ``,
      `Здравствуйте!`,
      `Подобрали удобную точку: «${right.name}». Подарок на старт: ${rightGift}.`,
      `Забрать по ссылке.`,
      ``,
      `${left.name}`,
      `Dante Florens · Дарующий расцвет`,
    ].join("\n");
  }

  const reverseMailing = [
    `Тема: Пациент от коллеги «${left.name}»`,
    ``,
    `К вам идёт пациент по заботливому сертификату. Не предлагайте: ${protectedServices.join(", ")}.`,
    `Верните с якорем: ${returnAnchor}`,
    ``,
    `Dante Florens · Дарующий расцвет`,
  ].join("\n");

  const bundle = {
    id: newId("bundle"),
    status: "draft",
    createdAt: new Date().toISOString(),
    mode: "coopetition",
    template: template.id,
    leftId: left.id,
    rightId: right.id,
    leftName: left.name,
    rightName: right.name,
    density: scored.density,
    quality: scored.quality,
    chainTitle,
    syllogism: scored.syllogism,
    offers,
    selectedOfferId: offers[0].id,
    script,
    mailing,
    reverseMailing,
    leftGift,
    rightGift,
    leftValue,
    rightValue,
    days: 7,
    code: null,
    publishedAt: null,
    trust: {
      protectedServices,
      returnAnchor,
      pactAcceptedAt: null,
    },
    billing: { ...template.billing },
  };
  db.bundles.push(bundle);
  return { bundle };
}

export function applyTrustOnPublish(bundle, body = {}) {
  if (bundle.mode !== "coopetition") return { ok: true };
  if (!body.pactAccepted) {
    return { error: "Для коопетиции нужен джентльменский пакт: запрет переманивать на базовые услуги отправителя." };
  }
  const protectedServices = Array.isArray(body.protectedServices)
    ? body.protectedServices.map((item) => clean(item, 120)).filter(Boolean).slice(0, 8)
    : bundle.trust?.protectedServices || [];
  if (!protectedServices.length) {
    return { error: "Укажите защищённые услуги отправителя." };
  }
  const returnAnchor = clean(body.returnAnchor, 500) || bundle.trust?.returnAnchor || "";
  if (!returnAnchor) return { error: "Нужен якорь возврата к отправителю." };
  const pct = Number(body.revsharePct);
  if (bundle.billing?.kind === "revshare" && Number.isFinite(pct) && pct >= 5 && pct <= 40) {
    bundle.billing.revsharePct = Math.round(pct);
  }
  bundle.trust = {
    protectedServices,
    returnAnchor,
    pactAcceptedAt: new Date().toISOString(),
  };
  return { ok: true };
}

export function recordPactBan(db, coupon, bundle) {
  if (bundle?.mode !== "coopetition" || !bundle.trust?.protectedServices?.length) return;
  db.pactBans ||= [];
  db.pactBans.push({
    id: newId("ban"),
    at: new Date().toISOString(),
    contactKey: coupon.contactKey,
    bannedBusinessId: bundle.rightId,
    sourceBusinessId: bundle.leftId,
    protectedServices: [...bundle.trust.protectedServices],
    bundleId: bundle.id,
    couponId: coupon.id,
  });
}

export function isServiceBanned(db, businessId, contactKey, serviceTitle) {
  if (!contactKey || !serviceTitle) return false;
  const needle = String(serviceTitle).toLowerCase();
  return (db.pactBans || []).some(
    (ban) =>
      ban.bannedBusinessId === businessId &&
      ban.contactKey === contactKey &&
      (ban.protectedServices || []).some((svc) => needle.includes(String(svc).toLowerCase()) || String(svc).toLowerCase().includes(needle)),
  );
}

export function filterBannedOffers(db, businessId, contactKey, offers) {
  if (!contactKey) return offers;
  return (offers || []).filter((offer) => {
    const title = offer.offer || offer.bonus || offer.name || "";
    return !isServiceBanned(db, businessId, contactKey, title);
  });
}

export function createSlot(db, business, body = {}) {
  const service = clean(body.service, 160);
  const district = clean(body.district, 80) || districtOf(business, passportOf(db, business.id));
  if (!service) return { error: "Укажите услугу свободного окна." };
  const hours = Math.min(48, Math.max(1, Number(body.hours) || 8));
  const freeUntil = new Date(Date.now() + hours * 3_600_000).toISOString();
  const slot = {
    id: newId("slot"),
    businessId: business.id,
    businessName: business.name,
    service,
    district,
    freeUntil,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  db.overloadSlots ||= [];
  db.overloadSlots.push(slot);
  return { slot };
}

export function listSlots(db, businessId) {
  return (db.overloadSlots || [])
    .filter((item) => item.businessId === businessId)
    .slice()
    .reverse();
}

export function findBestSlot(db, fromBusiness, service, district) {
  const svc = clean(service, 160).toLowerCase();
  const dist = clean(district, 80).toLowerCase();
  const now = Date.now();
  const open = (db.overloadSlots || []).filter((slot) => {
    if (slot.status !== "open") return false;
    if (slot.businessId === fromBusiness.id) return false;
    if (slot.freeUntil && new Date(slot.freeUntil).getTime() < now) return false;
    const partner = db.businesses.find((item) => item.id === slot.businessId);
    if (!partner?.atTable) return false;
    if (!sameNiche(fromBusiness, partner)) return false;
    return true;
  });
  open.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (dist && String(a.district || "").toLowerCase().includes(dist)) scoreA += 3;
    if (dist && String(b.district || "").toLowerCase().includes(dist)) scoreB += 3;
    if (svc && String(a.service || "").toLowerCase().includes(svc)) scoreA += 2;
    if (svc && String(b.service || "").toLowerCase().includes(svc)) scoreB += 2;
    return scoreB - scoreA || new Date(a.freeUntil) - new Date(b.freeUntil);
  });
  return open[0] || null;
}

export function createHandoff(db, fromBusiness, body = {}) {
  const service = clean(body.service, 160);
  const district = clean(body.district || body.urgency, 80);
  const patientName = clean(body.patientName || body.name, 120) || "Пациент";
  const contact = clean(body.contact, 160);
  if (!service) return { error: "Нужна услуга (что искал пациент)." };
  if (!district) return { error: "Нужен район или срочность (например: «сегодня, юг»)." };

  const slot = findBestSlot(db, fromBusiness, service, district);
  if (!slot) {
    return { error: "За 5 секунд не нашли открытый слот у коллег. Попросите партнёра открыть «Свободно окно сегодня»." };
  }
  const partner = db.businesses.find((item) => item.id === slot.businessId);
  const bonus = Math.min(1000, giftValue(db, partner));
  const code = shortCode(6);
  ensureCashier(db, fromBusiness.id);
  ensureCashier(db, partner.id);

  const protectedServices = defaultProtected(fromBusiness);
  const returnAnchor = `После приёма в «${partner.name}» вернитесь в «${fromBusiness.name}» за консультацией по результатам — бонус за заботу.`;

  const bundle = {
    id: newId("bundle"),
    status: "published",
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    mode: "coopetition",
    template: "overflow",
    hot: true,
    leftId: fromBusiness.id,
    rightId: partner.id,
    leftName: fromBusiness.name,
    rightName: partner.name,
    density: 80,
    quality: "горячий",
    chainTitle: "слот перегрузки · горящий клиент",
    syllogism: `Отказ в «${fromBusiness.name}» → свободное окно в «${partner.name}» (${slot.service}).`,
    offers: [
      {
        id: "hot-ticket",
        title: "Именной электронный талон",
        text: `Срочно: ${service}. Бонус ${bonus} ₽ на приём у «${partner.name}».`,
      },
    ],
    selectedOfferId: "hot-ticket",
    script: "Передайте QR пациенту на ресепшене / в Telegram.",
    mailing: "",
    reverseMailing: "",
    leftGift: giftTitle(db, fromBusiness),
    rightGift: `${slot.service} + бонус ${bonus} ₽`,
    leftValue: giftValue(db, fromBusiness),
    rightValue: bonus,
    days: 1,
    code,
    shortPath: `/#claim?code=${code}`,
    cashierLeft: ensureCashier(db, fromBusiness.id).token,
    cashierRight: ensureCashier(db, partner.id).token,
    trust: {
      protectedServices,
      returnAnchor,
      pactAcceptedAt: new Date().toISOString(),
    },
    billing: { kind: "revshare", revsharePct: REVSHARE_DEFAULT },
    slotId: slot.id,
  };
  db.bundles.push(bundle);
  slot.status = "taken";
  slot.takenAt = new Date().toISOString();
  slot.takenByBundleId = bundle.id;

  const handoff = {
    id: newId("hand"),
    at: bundle.publishedAt,
    fromId: fromBusiness.id,
    toId: partner.id,
    fromName: fromBusiness.name,
    toName: partner.name,
    service,
    district,
    patientName,
    contact,
    slotId: slot.id,
    bundleId: bundle.id,
    code,
    claimPath: bundle.shortPath,
    status: "issued",
    notify: "stub: telegram/sms администратору партнёра (этап 2)",
  };
  db.handoffs ||= [];
  db.handoffs.push(handoff);

  // Optional: pre-claim if contact given
  let coupon = null;
  if (contact) {
    const key = contactKeyLocal(contact);
    coupon = {
      id: newId("coup"),
      code: `${code}-${shortCode(4)}`.toUpperCase(),
      bundleId: bundle.id,
      status: "activated",
      issuedAt: handoff.at,
      activatedAt: handoff.at,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      contact,
      contactKey: key,
      name: patientName,
      giftTitle: bundle.rightGift,
      redeemerId: partner.id,
      issuerId: fromBusiness.id,
      issuerName: fromBusiness.name,
      redeemerName: partner.name,
      value: bonus,
      hot: true,
      checkAmount: null,
      redeemedAt: null,
    };
    db.coupons.push(coupon);
    recordPactBan(db, coupon, bundle);
    handoff.status = "activated";
    handoff.couponCode = coupon.code;
  }

  return { handoff, bundle, coupon, slot };
}

function contactKeyLocal(value) {
  const raw = String(value || "").trim().toLowerCase();
  const digits = raw.replace(/\D+/g, "");
  let phone = digits;
  if (digits.length === 11 && digits.startsWith("8")) phone = `7${digits.slice(1)}`;
  else if (digits.length === 10) phone = `7${digits}`;
  if (phone.length >= 10) return `p:${phone}`;
  return `c:${raw}`;
}

export function handoffOf(db, id) {
  return (db.handoffs || []).find((item) => item.id === id) || null;
}

/** Начисление после redeem: RevShare или повышенные коины для hot. */
export function creditAfterRedeem(db, coupon, bundle, amount) {
  const billing = bundle?.billing || { kind: "leadcoins" };
  const hot = Boolean(bundle?.hot || coupon.hot);
  let credited = 0;
  let revshareAmount = 0;
  let reason = "redeem";

  if (billing.kind === "revshare" && amount > 0) {
    const pct = Number(billing.revsharePct) || REVSHARE_DEFAULT;
    revshareAmount = Math.round((amount * pct) / 100);
    // Храним RevShare как Лид-коины по курсу + отдельное поле суммы ₽
    credited = Math.max(1, Math.round(revshareAmount / LEAD_COIN_RUB));
    reason = "revshare";
    coupon.revshareAmount = revshareAmount;
    coupon.revsharePct = pct;
  } else {
    const base = Math.max(1, Math.round((coupon.value || 1000) / LEAD_COIN_RUB));
    credited = hot ? Math.max(1, Math.round(base * HOT_COIN_MULT)) : base;
    reason = hot ? "hot_redeem" : "redeem";
  }

  const entry = {
    id: newId("lead"),
    at: coupon.redeemedAt,
    businessId: coupon.issuerId,
    delta: credited,
    reason,
    couponId: coupon.id,
    bundleId: coupon.bundleId,
    checkAmount: amount,
    revshareAmount: revshareAmount || null,
    note:
      reason === "revshare"
        ? `RevShare ${coupon.revsharePct}% = ${revshareAmount} ₽ с чека в «${coupon.redeemerName}»`
        : `Приведённый клиент погасил «${coupon.giftTitle}» в «${coupon.redeemerName}»${hot ? " (горящий)" : ""}`,
  };
  db.leadLedger.push(entry);
  return {
    credited,
    revshareAmount,
    balance: walletBalance(db, coupon.issuerId),
    reason,
  };
}

export function coopSnapshotExtras(db, business) {
  return {
    slots: listSlots(db, business.id),
    handoffs: (db.handoffs || [])
      .filter((item) => item.fromId === business.id || item.toId === business.id)
      .slice(-20)
      .reverse(),
    pactBans: (db.pactBans || [])
      .filter((item) => item.sourceBusinessId === business.id || item.bannedBusinessId === business.id)
      .slice(-20)
      .reverse(),
    coopTemplates: Object.values(COOP_TEMPLATES),
  };
}
