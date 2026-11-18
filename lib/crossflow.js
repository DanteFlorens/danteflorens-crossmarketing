import crypto from "crypto";
import { ensureCatalog } from "./catalog.js";
import {
  applyTrustOnPublish,
  coopSnapshotExtras,
  creditAfterRedeem,
  createHandoff,
  createSlot,
  filterBannedOffers,
  generateCoopBundle,
  handoffOf,
  listSlots,
  matchCoopetition,
  recordPactBan,
} from "./coopetition.js";
import { scorePair, rankPartners } from "./engine.js";
import { buildIdeas } from "./ideas.js";
import { newId } from "./store.js";

/** 1 Лид-коин = 100 ₽ рекламной ценности */
export const LEAD_COIN_RUB = 100;

export const TARIFFS = {
  start: {
    id: "start",
    title: "Старт",
    priceMonth: 0,
    gifts: 1,
    partners: 3,
    visitsMonth: 20,
    note: "1 подарок, 3 партнёра, до 20 визитов в месяц. Навсегда бесплатно.",
  },
  pro: {
    id: "pro",
    title: "Бизнес Pro",
    priceMonth: 7900,
    gifts: Infinity,
    partners: Infinity,
    visitsMonth: Infinity,
    note: "Безлимит связок, ИИ-генерация, биржа Лид-коинов, полная аналитика.",
  },
  network: {
    id: "network",
    title: "Сеть / Франшиза",
    priceMonth: 29000,
    gifts: Infinity,
    partners: Infinity,
    visitsMonth: Infinity,
    note: "Несколько точек, единый кабинет кассиров.",
  },
};

export function readyCrossflow(db) {
  db.passports ||= [];
  db.gifts ||= [];
  db.bundles ||= [];
  db.coupons ||= [];
  db.leadLedger ||= [];
  db.cashierTokens ||= [];
  db.overloadSlots ||= [];
  db.handoffs ||= [];
  db.pactBans ||= [];
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normPhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function contactKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  const phone = normPhone(raw);
  if (phone.length >= 10) return `p:${phone}`;
  return `c:${raw}`;
}

function shortCode(bytes = 5) {
  return crypto.randomBytes(bytes).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
}

export function tariffOf(business) {
  const id = business?.crossTariff || "start";
  return TARIFFS[id] || TARIFFS.start;
}

export function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function passportOf(db, businessId) {
  return db.passports.find((item) => item.businessId === businessId) || null;
}

export function giftsOf(db, businessId) {
  return db.gifts.filter((item) => item.businessId === businessId);
}

export function bundlesOf(db, businessId) {
  return db.bundles.filter(
    (item) => item.leftId === businessId || item.rightId === businessId,
  );
}

export function walletBalance(db, businessId) {
  return db.leadLedger
    .filter((item) => item.businessId === businessId)
    .reduce((sum, item) => sum + Number(item.delta || 0), 0);
}

export function visitsThisMonth(db, businessId, now = new Date()) {
  const key = monthKey(now);
  return db.coupons.filter((coupon) => {
    if (coupon.status !== "redeemed" || !coupon.redeemedAt) return false;
    if (coupon.redeemerId !== businessId) return false;
    return monthKey(new Date(coupon.redeemedAt)) === key;
  }).length;
}

export function parsePassportBody(body = {}) {
  const idealClient = clean(body.idealClient, 400);
  const touchpoints = clean(body.touchpoints, 400);
  const locomotive = clean(body.locomotive, 400);
  const idleWindows = clean(body.idleWindows, 300);
  const gender = clean(body.gender, 40) || "любой";
  const ageFrom = Number(body.ageFrom) || 25;
  const ageTo = Number(body.ageTo) || 55;
  const avgCheck = Number(body.avgCheck) || 0;
  const inn = clean(body.inn, 12).replace(/\D+/g, "").slice(0, 12);
  const district = clean(body.district, 80);
  if (!idealClient || !touchpoints || !locomotive) {
    return { error: "Нужны идеальный клиент, точки контакта и подарок-локомотив." };
  }
  return {
    passport: {
      idealClient,
      touchpoints,
      locomotive,
      idleWindows,
      gender,
      ageFrom,
      ageTo,
      avgCheck: avgCheck > 0 ? avgCheck : null,
      inn: inn.length >= 10 ? inn : "",
      district,
      filledAt: new Date().toISOString(),
    },
  };
}

export function upsertPassport(db, business, fields) {
  let row = passportOf(db, business.id);
  if (!row) {
    row = { id: newId("pass"), businessId: business.id, createdAt: new Date().toISOString() };
    db.passports.push(row);
  }
  Object.assign(row, fields, { updatedAt: new Date().toISOString() });
  business.passportReady = true;
  if (fields.locomotive && !business.offer) business.offer = fields.locomotive;
  return row;
}

export function parseGiftBody(body = {}) {
  const title = clean(body.title, 180);
  const valueNote = clean(body.valueNote, 400);
  const cost = Math.max(0, Math.round(Number(body.cost) || 0));
  const clientValue = Math.max(0, Math.round(Number(body.clientValue) || 0));
  const days = Math.min(90, Math.max(3, Math.round(Number(body.days) || 14)));
  if (!title) return { error: "Нужно название подарка-локомотива." };
  if (clientValue < 100) return { error: "Ценность для клиента — от 100 ₽." };
  return {
    gift: {
      title,
      valueNote: valueNote || "Подарок с высокой ценностью и низкой себестоимостью",
      cost,
      clientValue,
      days,
    },
  };
}

export function createGift(db, business, giftFields) {
  const tariff = tariffOf(business);
  const existing = giftsOf(db, business.id).filter((item) => item.active !== false);
  if (Number.isFinite(tariff.gifts) && existing.length >= tariff.gifts) {
    return { error: `На тарифе «${tariff.title}» можно ${tariff.gifts} активный подарок. Перейдите на Pro.` };
  }
  const gift = {
    id: newId("gift"),
    businessId: business.id,
    active: true,
    createdAt: new Date().toISOString(),
    ...giftFields,
  };
  db.gifts.push(gift);
  return { gift };
}

export function matchPartners(db, business, limit = 12, options = {}) {
  const mode = options.mode === "coopetition" ? "coopetition" : "adjacent";
  if (mode === "coopetition") return matchCoopetition(db, business, limit);

  const passport = passportOf(db, business.id);
  const ranked = rankPartners(business, db.businesses, Math.max(limit * 2, 16));
  return ranked
    .filter((row) => row.business.id !== business.id)
    .slice(0, limit)
    .map((row) => {
      const scored = scorePair(business, row.business) || row;
      const gift = giftsOf(db, row.business.id).find((item) => item.active !== false);
      const theirPass = passportOf(db, row.business.id);
      const density = scored.density ?? Math.round((scored.score || 0) * 100);
      const why = [
        scored.syllogism || scored.chainTitle || "смежная аудитория",
        passport?.avgCheck && theirPass?.avgCheck
          ? `средний чек рядом: ${passport.avgCheck} ₽ и ${theirPass.avgCheck} ₽`
          : null,
        `нет прямой конкуренции по нише «${business.roleTitle || business.craft}»`,
      ]
        .filter(Boolean)
        .join("; ");
      return {
        businessId: row.business.id,
        name: row.business.name,
        city: row.business.city,
        craft: row.business.roleTitle || row.business.craft,
        density,
        quality: scored.quality || "крепкая",
        chainTitle: scored.chainTitle || "смежный интерес",
        why,
        mode: "adjacent",
        gift: gift
          ? { id: gift.id, title: gift.title, clientValue: gift.clientValue }
          : null,
        catalog: ensureCatalog(row.business),
      };
    });
}

function giftTitleFor(db, business) {
  const gift = giftsOf(db, business.id).find((item) => item.active !== false);
  if (gift) return gift.title;
  const catalog = ensureCatalog(business);
  return catalog.hook?.title || business.offer || "приветственный подарок";
}

function giftValueFor(db, business) {
  const gift = giftsOf(db, business.id).find((item) => item.active !== false);
  if (gift) return gift.clientValue;
  const catalog = ensureCatalog(business);
  return Number(catalog.hook?.price) || Math.round((business.ticket || 3000) * 0.3) || 1000;
}

export function generateBundle(db, left, rightId, options = {}) {
  const mode = options.mode === "coopetition" ? "coopetition" : "adjacent";
  const template = options.template || "gift";
  if (mode === "coopetition") {
    return generateCoopBundle(db, left, rightId, template === "gift" ? "overflow" : template);
  }

  const right = db.businesses.find((item) => item.id === rightId && item.atTable);
  if (!right || right.id === left.id) return { error: "Партнёр не найден." };
  let scored = scorePair(left, right);
  if (!scored || scored.score < 0.28) {
    // Члены с разными нишами и паспортом могут собрать связку вручную (пилот).
    const sameRole = left.role && right.role && left.role === right.role;
    if (sameRole || left.id === right.id) {
      return {
        error: "В смежном режиме коллеги по нише закрыты. Включите тумблер «Коллеги по нише (коопетиция)».",
      };
    }
    scored = {
      score: 0.55,
      density: 55,
      quality: "рабочая",
      chainTitle: "смежный интерес клиента",
      syllogism: `Клиенты «${left.name}» и «${right.name}» пересекаются по аудитории без прямой конкуренции.`,
    };
  }

  const tariff = tariffOf(left);
  const publishedPartners = new Set(
    bundlesOf(db, left.id)
      .filter((item) => item.status === "published")
      .map((item) => (item.leftId === left.id ? item.rightId : item.leftId)),
  );
  if (Number.isFinite(tariff.partners) && !publishedPartners.has(right.id) && publishedPartners.size >= tariff.partners) {
    return { error: `На тарифе «${tariff.title}» максимум ${tariff.partners} партнёра. Перейдите на Pro.` };
  }

  const leftGift = giftTitleFor(db, left);
  const rightGift = giftTitleFor(db, right);
  const leftValue = giftValueFor(db, left);
  const rightValue = giftValueFor(db, right);
  const partners = rankPartners(left, db.businesses, 8).filter((item) => item.business.id === right.id);
  const ideas = buildIdeas({
    business: left,
    partners,
    businesses: db.businesses,
    clients: db.clients.filter((client) => client.businessId === left.id),
  }).filter((item) => item.partnerId === right.id);

  const offers = [
    {
      id: "gift-first",
      title: `Подарок вместо скидки: «${rightGift}»`,
      text: `Клиентам «${left.name}» — сертификат на «${rightGift}» у «${right.name}» (ценность ~${rightValue} ₽). Без уценки вашего прайса.`,
    },
    {
      id: "twin-visit",
      title: `Двойной визит «${left.name}» × «${right.name}»`,
      text: `Кто пришёл к вам — получает «${rightGift}». Кто пришёл к партнёру — получает «${leftGift}». Один интерес, два дома.`,
    },
    {
      id: ideas[0]?.kind || "cobrand",
      title: ideas[0]?.title || `Совместная акция к моменту «${scored.chainTitle || "смежный интерес"}»`,
      text: ideas[0]?.trade || scored.syllogism || "Клиент закрывает два связанных шага одним решением.",
    },
  ];

  const script = [
    `На кассе скажите: «У нас подарок от партнёра «${right.name}» — ${rightGift}. Хотите забрать?»`,
    `Если да — покажите QR / короткую ссылку. Клиент сам оставляет контакт партнёру.`,
    `Не передавайте чужие базы. Не обещайте скидку на ваш основной прайс — только подарок.`,
  ].join(" ");

  const mailing = [
    `Тема: Подарок от «${right.name}» для клиентов «${left.name}»`,
    ``,
    `Здравствуйте!`,
    `Мы подружились с «${right.name}» — у вас смежный запрос.`,
    `Ваш подарок: ${rightGift} (ценность ~${rightValue} ₽). Действует ограниченный срок.`,
    `Забрать: по ссылке/QR из письма. Один контакт — один подарок.`,
    ``,
    `С уважением,`,
    `${left.name}`,
    `Dante Florens · Дарующий расцвет`,
  ].join("\n");

  const reverseMailing = [
    `Тема: Подарок от «${left.name}» для клиентов «${right.name}»`,
    ``,
    `Здравствуйте!`,
    `Партнёр «${left.name}» дарит вам: ${leftGift} (ценность ~${leftValue} ₽).`,
    `Забрать по ссылке. Без приложения — один клик.`,
    ``,
    `${right.name}`,
    `Dante Florens · Дарующий расцвет`,
  ].join("\n");

  const days =
    giftsOf(db, right.id).find((item) => item.active !== false)?.days ||
    giftsOf(db, left.id).find((item) => item.active !== false)?.days ||
    14;

  const bundle = {
    id: newId("bundle"),
    status: "draft",
    createdAt: new Date().toISOString(),
    mode: "adjacent",
    template: "gift",
    leftId: left.id,
    rightId: right.id,
    leftName: left.name,
    rightName: right.name,
    density: scored.density,
    quality: scored.quality,
    chainTitle: scored.chainTitle,
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
    days,
    code: null,
    publishedAt: null,
    trust: null,
    billing: { kind: "leadcoins", revsharePct: 0 },
  };
  db.bundles.push(bundle);
  return { bundle };
}

export function selectBundleOffer(bundle, offerId) {
  const offer = (bundle.offers || []).find((item) => item.id === offerId);
  if (!offer) return { error: "Такого варианта оффера нет." };
  bundle.selectedOfferId = offer.id;
  return { bundle };
}

export function publishBundle(db, business, bundleId, trustBody = {}) {
  const bundle = db.bundles.find((item) => item.id === bundleId);
  if (!bundle) return { error: "Связка не найдена." };
  if (bundle.leftId !== business.id && bundle.rightId !== business.id) {
    return { error: "Публиковать может только участник связки." };
  }
  if (bundle.status === "published" && bundle.code) {
    return { bundle, coupons: db.coupons.filter((item) => item.bundleId === bundle.id) };
  }

  const trust = applyTrustOnPublish(bundle, trustBody);
  if (trust.error) return trust;

  const code = shortCode(6);
  const tokenLeft = ensureCashier(db, bundle.leftId);
  const tokenRight = ensureCashier(db, bundle.rightId);
  bundle.status = "published";
  bundle.code = code;
  bundle.publishedAt = new Date().toISOString();
  bundle.shortPath = `/#claim?code=${code}`;
  bundle.cashierLeft = tokenLeft.token;
  bundle.cashierRight = tokenRight.token;

  return { bundle, cashier: { left: tokenLeft, right: tokenRight } };
}

export function ensureCashier(db, businessId) {
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

export function publicCouponView(db, code) {
  const bundle = db.bundles.find(
    (item) => item.code === code && item.status === "published",
  );
  if (!bundle) return { error: "Подарок не найден или ещё не опубликован.", status: 404 };
  const offer =
    (bundle.offers || []).find((item) => item.id === bundle.selectedOfferId) ||
    bundle.offers?.[0];
  return {
    code: bundle.code,
    bundleId: bundle.id,
    leftName: bundle.leftName,
    rightName: bundle.rightName,
    giftTitle: bundle.rightGift,
    giftFrom: bundle.leftName,
    giftAt: bundle.rightName,
    offerTitle: offer?.title || "",
    offerText: offer?.text || "",
    days: bundle.days || 14,
    value: bundle.rightValue,
    brand: "Dante Florens · Дарующий расцвет",
    mode: bundle.mode || "adjacent",
    template: bundle.template || "gift",
    hot: Boolean(bundle.hot),
    returnAnchor: bundle.trust?.returnAnchor || null,
    protectedServices: bundle.trust?.protectedServices || [],
    billing: bundle.billing || null,
  };
}

export function claimCoupon(db, code, body, meta = {}) {
  const view = publicCouponView(db, code);
  if (view.error) return view;
  const bundle = db.bundles.find((item) => item.id === view.bundleId);
  const contact = clean(body.contact || body.phone || body.telegram, 160);
  const name = clean(body.name, 120) || "Гость";
  if (!contact) return { error: "Нужен телефон или Telegram — клиент сам оставляет контакт." };

  const key = contactKey(contact);
  const already = db.coupons.find(
    (item) =>
      item.bundleId === bundle.id &&
      item.contactKey === key &&
      item.status !== "expired",
  );
  if (already) {
    return {
      error: "Этот подарок уже забран с этого контакта. Один человек — один купон на связку.",
      coupon: publicPersonalCoupon(already, bundle),
    };
  }

  const expiresAt = new Date(Date.now() + (bundle.days || 14) * 86_400_000).toISOString();
  const coupon = {
    id: newId("coup"),
    code: `${bundle.code}-${shortCode(4)}`.toUpperCase(),
    bundleId: bundle.id,
    status: "activated",
    issuedAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
    expiresAt,
    contact,
    contactKey: key,
    name,
    giftTitle: bundle.rightGift,
    redeemerId: bundle.rightId,
    issuerId: bundle.leftId,
    issuerName: bundle.leftName,
    redeemerName: bundle.rightName,
    value: bundle.rightValue,
    ip: meta.ip || "",
    checkAmount: null,
    redeemedAt: null,
  };
  db.coupons.push(coupon);
  recordPactBan(db, coupon, bundle);

  return { coupon: publicPersonalCoupon(coupon, bundle) };
}

function publicPersonalCoupon(coupon, bundle) {
  return {
    id: coupon.id,
    code: coupon.code,
    status: coupon.status,
    giftTitle: coupon.giftTitle,
    from: coupon.issuerName,
    at: coupon.redeemerName,
    expiresAt: coupon.expiresAt,
    value: coupon.value,
    brand: "Dante Florens · Дарующий расцвет",
    bundleCode: bundle?.code || null,
    returnAnchor: bundle?.trust?.returnAnchor || null,
    mode: bundle?.mode || "adjacent",
    hot: Boolean(bundle?.hot || coupon.hot),
  };
}

export function cashierContext(db, token) {
  const row = db.cashierTokens.find((item) => item.token === token && item.active !== false);
  if (!row) return { error: "Ссылка кассира недействительна.", status: 404 };
  const business = db.businesses.find((item) => item.id === row.businessId);
  if (!business) return { error: "Точка не найдена.", status: 404 };
  return {
    token: row.token,
    businessId: business.id,
    businessName: business.name,
    city: business.city,
    brand: "Dante Florens · Дарующий расцвет",
  };
}

export function redeemCoupon(db, token, body, meta = {}) {
  const ctx = cashierContext(db, token);
  if (ctx.error) return ctx;
  const code = clean(body.code, 40).toUpperCase();
  const amount = Math.round(Number(body.amount));
  if (!code) return { error: "Введите или отсканируйте код купона." };
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
    return { error: "Сумма чека не читается." };
  }

  const coupon = db.coupons.find(
    (item) => item.code.toUpperCase() === code || item.code.toUpperCase() === code.replace(/\s+/g, ""),
  );
  if (!coupon) return { error: "Купон не найден." };
  if (coupon.redeemerId !== ctx.businessId) {
    return { error: "Этот купон гасится в другом бизнесе." };
  }
  if (coupon.status === "redeemed") return { error: "Купон уже погашен." };
  if (coupon.status === "expired" || (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())) {
    coupon.status = "expired";
    return { error: "Срок купона истёк." };
  }
  if (coupon.status !== "activated" && coupon.status !== "issued") {
    return { error: "Купон нельзя погасить в этом статусе." };
  }

  // Anti-fraud v1: same IP redeeming many distinct contacts in a short window
  const ip = meta.ip || "";
  if (ip) {
    const recent = db.coupons.filter(
      (item) =>
        item.redeemerId === ctx.businessId &&
        item.status === "redeemed" &&
        item.redeemIp === ip &&
        item.redeemedAt &&
        Date.now() - new Date(item.redeemedAt).getTime() < 15 * 60_000,
    );
    if (recent.length >= 8) {
      return { error: "Слишком много гашений с одного адреса. Проверьте, нет ли накрутки." };
    }
  }

  const tariffBiz = db.businesses.find((item) => item.id === coupon.issuerId);
  if (tariffBiz) {
    const tariff = tariffOf(tariffBiz);
    const used = visitsThisMonth(db, coupon.redeemerId);
    // visits limit applies to redeemer point traffic attributed; also check issuer side monthly redemptions from their gifts
    const issuerVisits = db.coupons.filter((item) => {
      if (item.status !== "redeemed" || item.issuerId !== tariffBiz.id || !item.redeemedAt) return false;
      return monthKey(new Date(item.redeemedAt)) === monthKey();
    }).length;
    if (Number.isFinite(tariff.visitsMonth) && issuerVisits >= tariff.visitsMonth) {
      return {
        error: `Лимит тарифа «${tariff.title}»: ${tariff.visitsMonth} визитов в месяц. Перейдите на Pro.`,
      };
    }
    void used;
  }

  coupon.status = "redeemed";
  coupon.redeemedAt = new Date().toISOString();
  coupon.checkAmount = amount;
  coupon.redeemIp = ip;

  const bundle = db.bundles.find((item) => item.id === coupon.bundleId);
  const pay = creditAfterRedeem(db, coupon, bundle, amount);

  return {
    coupon: publicPersonalCoupon(coupon, bundle),
    credited: pay.credited,
    revshareAmount: pay.revshareAmount || 0,
    reason: pay.reason,
    balance: pay.balance,
    checkAmount: amount,
  };
}

export function spendLeadCoins(db, business, body) {
  const amount = Math.round(Number(body.amount));
  const partnerId = clean(body.partnerId, 80);
  if (!Number.isFinite(amount) || amount < 1) return { error: "Сколько Лид-коинов списать?" };
  const balance = walletBalance(db, business.id);
  if (amount > balance) return { error: `Недостаточно Лид-коинов. Баланс: ${balance}.` };
  const partner = db.businesses.find((item) => item.id === partnerId);
  if (!partner) return { error: "Партнёр для размещения не найден." };
  const entry = {
    id: newId("lead"),
    at: new Date().toISOString(),
    businessId: business.id,
    delta: -amount,
    reason: "spend",
    partnerId,
    partnerName: partner.name,
    note: `Размещение подарка у «${partner.name}»`,
  };
  db.leadLedger.push(entry);
  return { balance: walletBalance(db, business.id), entry };
}

export function funnelOf(db, businessId) {
  const mine = bundlesOf(db, businessId).filter((item) => item.status === "published");
  return mine.map((bundle) => {
    const coupons = db.coupons.filter((item) => item.bundleId === bundle.id);
    const taken = coupons.filter((item) => item.status === "activated" || item.status === "redeemed").length;
    const redeemed = coupons.filter((item) => item.status === "redeemed");
    const revenue = redeemed.reduce((sum, item) => sum + (Number(item.checkAmount) || 0), 0);
    return {
      bundleId: bundle.id,
      code: bundle.code,
      title: `${bundle.leftName} × ${bundle.rightName}`,
      chainTitle: bundle.chainTitle,
      density: bundle.density,
      taken,
      redeemed: redeemed.length,
      revenue,
      adSpend: 0,
      shortPath: bundle.shortPath,
    };
  });
}

export function setTariff(db, business, tariffId) {
  const tariff = TARIFFS[tariffId];
  if (!tariff) return { error: "Такой тариф не найден." };
  const at = new Date().toISOString();
  business.crossTariff = tariff.id;
  business.crossTariffAt = at;
  if (tariff.priceMonth > 0) {
    db.payments.push({
      id: newId("pay"),
      businessId: business.id,
      seat: `cross-${tariff.id}`,
      title: `Подписка ${tariff.title}`,
      amount: tariff.priceMonth,
      at,
      method: "contour",
      term: "month",
    });
  }
  if (!business.atTable && business.paidAt) business.atTable = true;
  return { tariff, meTariff: tariff };
}

export function crossflowSnapshot(db, business) {
  readyCrossflow(db);
  const passport = passportOf(db, business.id);
  const gifts = giftsOf(db, business.id);
  const bundles = bundlesOf(db, business.id);
  const tariff = tariffOf(business);
  const cashier = ensureCashier(db, business.id);
  return {
    brand: "Dante Florens · Дарующий расцвет",
    passport,
    gifts,
    bundles: bundles.map((item) => ({
      id: item.id,
      status: item.status,
      mode: item.mode || "adjacent",
      template: item.template || "gift",
      hot: Boolean(item.hot),
      leftName: item.leftName,
      rightName: item.rightName,
      density: item.density,
      code: item.code,
      shortPath: item.shortPath,
      selectedOfferId: item.selectedOfferId,
      offers: item.offers,
      script: item.script,
      mailing: item.mailing,
      leftGift: item.leftGift,
      rightGift: item.rightGift,
      publishedAt: item.publishedAt,
      trust: item.trust || null,
      billing: item.billing || null,
      cashierToken:
        item.leftId === business.id ? item.cashierLeft : item.cashierRight,
    })),
    wallet: {
      balance: walletBalance(db, business.id),
      ledger: db.leadLedger
        .filter((item) => item.businessId === business.id)
        .slice(-40)
        .reverse(),
      coinRub: LEAD_COIN_RUB,
    },
    funnel: funnelOf(db, business.id),
    tariff,
    tariffs: Object.values(TARIFFS),
    cashierPath: `/#cashier/${cashier.token}`,
    visitsThisMonth: visitsThisMonth(db, business.id),
    matchReady: Boolean(passport?.filledAt),
    ...coopSnapshotExtras(db, business),
  };
}

export {
  createSlot,
  createHandoff,
  listSlots,
  handoffOf,
  filterBannedOffers,
};
