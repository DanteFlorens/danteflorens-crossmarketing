import { ensureCatalog, tradePitch } from "./catalog.js";
import { licenseLive } from "./exchange.js";
import { clientMatches, cobrandCopy, describeSlices } from "./ideas.js";
import {
  CHAINS,
  FEE_RATE,
  LEXICON,
  PERSONA_KEYS,
  ROLES,
  SEATS,
  SITUATION_KEYS,
  SITUATION_TITLES,
  bandFromTicket,
  cityKey,
  hasStem,
  normalize,
  seatById,
} from "./ontology.js";

export { FEE_RATE, SEATS };

const BANDS = ["modest", "middle", "high", "estate"];

export function inferProfile({ craft, about, ticket, city }) {
  const text = `${craft || ""} ${about || ""}`;
  let best = { role: "bespoke", score: 0 };
  const hits = [];
  for (const row of LEXICON) {
    let score = 0;
    for (const key of row.keys) {
      if (hasStem(text, key)) score += normalize(key).length;
    }
    if (score > 0) hits.push({ role: row.role, score });
    if (score > best.score) best = { role: row.role, score };
  }
  const role = best.score > 0 ? best.role : "bespoke";
  const def = ROLES[role] || ROLES.bespoke;
  const situations = new Set(def.situations);
  for (const [sit, keys] of Object.entries(SITUATION_KEYS)) {
    if (keys.some((key) => hasStem(text, key))) situations.add(sit);
  }
  const personas = new Set(def.personas);
  for (const [persona, keys] of Object.entries(PERSONA_KEYS)) {
    if (keys.some((key) => hasStem(text, key))) personas.add(persona);
  }
  const amount = Number(ticket) || 0;
  return {
    role,
    roleTitle: def.title,
    situations: [...situations],
    personas: [...personas],
    band: bandFromTicket(amount),
    ticket: amount,
    city: String(city || "").trim(),
    hits: hits.sort((a, b) => b.score - a.score).slice(0, 3),
  };
}

export function nextMorningMoscow(from = new Date()) {
  const parts = moscowParts(from);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 6, 0, 0)).toISOString();
}

export function addDaysMoscow(from, days) {
  const parts = moscowParts(from);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 6, 0, 0)).toISOString();
}

function moscowParts(from) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(from);
  const pick = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

function overlap(a, b) {
  const left = [...new Set(a || [])];
  const right = new Set(b || []);
  if (!left.length || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / Math.min(left.length, right.size);
}

function priceFit(a, b) {
  const gap = Math.abs(BANDS.indexOf(a) - BANDS.indexOf(b));
  return [1, 0.88, 0.62, 0.36][gap] ?? 0.36;
}

function geoFit(a, b) {
  const left = cityKey(a.city);
  const right = cityKey(b.city);
  if (left && left === right) return 1;
  if (left === "вся страна" || right === "вся страна") return 0.72;
  return 0.4;
}

function chainLink(aRole, bRole) {
  let best = null;
  for (const chain of CHAINS) {
    const i = chain.roles.indexOf(aRole);
    const j = chain.roles.indexOf(bRole);
    if (i < 0 || j < 0 || i === j) continue;
    const distance = Math.abs(i - j);
    const score = distance === 1 ? 1 : distance === 2 ? 0.74 : distance === 3 ? 0.5 : 0.24;
    if (!best || score > best.score) best = { chain, distance, score };
  }
  return best;
}

function sharedSituations(a, b) {
  const right = new Set(b.situations || []);
  return (a.situations || []).filter((item) => right.has(item));
}

function qualityOf(score, fallback) {
  if (fallback) return "едва держится";
  if (score >= 0.62) return "крепкая";
  if (score >= 0.45) return "ровная";
  return "тонкая";
}

function conversionOf(quality) {
  if (quality === "крепкая") return 0.11;
  if (quality === "ровная") return 0.08;
  if (quality === "тонкая") return 0.05;
  return 0.03;
}

function syllogism(a, b, meta) {
  const situation = meta.shared[0] ? SITUATION_TITLES[meta.shared[0]] : "смежный интерес";
  const chainLine = meta.chain
    ? `Оба бизнеса закрывают связанные потребности («${meta.chain.title}»).`
    : `Связка по интересу клиента: «${situation}».`;
  const geoLine = meta.geo === 1 ? "Город совпадает — удобнее для офлайн-визита." : "Города разные — подходит и для онлайн-бизнесов.";
  return [
    `Клиенты «${a.name}» (${a.roleTitle}) уже в теме «${situation}».`,
    `«${b.name}» (${b.roleTitle}) предлагает смежный товар или услугу, а не конкурирует.`,
    chainLine,
    `Поэтому обмен базами даёт новый поток обеим сторонам. ${geoLine}`,
  ].join(" ");
}

function weakSyllogism(a, b) {
  return [
    `Пока мало данных, чем именно интересны клиенты «${a.name}».`,
    `«${b.name}» (${b.roleTitle}) не прямой конкурент.`,
    `Связка пока слабая: уточните аудиторию и оффер — тогда обмен базами станет точнее.`,
  ].join(" ");
}

export function scorePair(a, b) {
  if (!a || !b || a.id === b.id) return null;
  if (a.role && a.role === b.role && a.role !== "bespoke") return null;
  const chain = chainLink(a.role, b.role);
  const shared = sharedSituations(a, b);
  const sit = overlap(a.situations, b.situations);
  const per = overlap(a.personas, b.personas);
  const chainPart = chain?.score || 0;
  const affinity = sit > 0 ? Math.max(sit, per * 0.8) : 0;
  const raw = Math.max(chainPart * 0.75 + affinity * 0.25, affinity * 0.84);
  const geo = geoFit(a, b);
  const price = chainPart >= 0.74 ? Math.max(priceFit(a.band, b.band), 0.82) : priceFit(a.band, b.band);
  const score = raw * geo * price;
  if (chainPart === 0 && score < 0.48) return null;
  if (score < 0.3) return null;
  return {
    score,
    density: Math.round(score * 100),
    quality: qualityOf(score, false),
    chainId: chain?.chain.id || null,
    chainTitle: chain?.chain.title || null,
    distance: chain?.distance || null,
    shared,
    geo,
    syllogism: syllogism(a, b, { chain: chain?.chain, distance: chain?.distance, shared, geo }),
    fallback: false,
  };
}

function fallbackPair(a, b) {
  const geo = geoFit(a, b);
  const price = priceFit(a.band, b.band);
  return {
    score: 0.22 * geo * price,
    density: Math.round(22 * geo * price),
    quality: "едва держится",
    chainId: null,
    chainTitle: null,
    distance: null,
    shared: [],
    geo,
    syllogism: weakSyllogism(a, b),
    fallback: true,
  };
}

export function rankPartners(business, businesses, limit) {
  const seated = (businesses || []).filter((item) => item && item.atTable && item.id !== business.id);
  const ranked = [];
  for (const other of seated) {
    const scored = scorePair(business, other);
    if (!scored) continue;
    ranked.push({ business: publicHouse(other), ...scored });
  }
  ranked.sort(comparePartners);
  const strong = ranked.filter((item) => item.score >= 0.3);
  let picked = strong.slice(0, limit);
  if (!picked.length && ranked[0]) picked = ranked.slice(0, 1);
  if (!picked.length) {
    const pool = seated
      .filter((item) => item.role !== business.role)
      .map((item) => ({ business: publicHouse(item), ...fallbackPair(business, item) }))
      .sort(comparePartners);
    if (pool[0]) picked = pool.slice(0, 1);
  }
  return picked;
}

/** Живой member выше учебного seat при близком скоре — иначе письма уходят в демо. */
function comparePartners(a, b) {
  const rank = (item) => Number(item.score || 0) + (item.business?.kind === "member" ? 0.2 : 0);
  return rank(b) - rank(a)
    || Number(b.business?.kind === "member") - Number(a.business?.kind === "member")
    || Number(b.business?.ticket || 0) - Number(a.business?.ticket || 0)
    || Number(b.geo || 0) - Number(a.geo || 0);
}

function publicHouse(house) {
  return {
    id: house.id,
    kind: house.kind,
    name: house.name,
    city: house.city,
    craft: house.craft,
    role: house.role,
    roleTitle: house.roleTitle,
    offer: house.offer,
    benefit: house.benefit,
    catalog: ensureCatalog(house),
    ticket: house.ticket,
    situations: house.situations,
    personas: house.personas,
    band: house.band,
  };
}

function clientFit(client, house, partner) {
  const text = `${client.note || ""} ${client.city || ""}`;
  let hits = 0;
  for (const situation of partner.situations || []) {
    const keys = SITUATION_KEYS[situation] || [];
    if (keys.some((key) => hasStem(text, key))) hits += 1;
  }
  let score = 0.56;
  if (hits) score += Math.min(0.36, hits * 0.18);
  if (client.city && cityKey(client.city) === cityKey(house.city)) score += 0.04;
  score += Math.min(0.08, (Number(client.spend) || 0) / 1_500_000);
  return score;
}

function writeLetter(client, from, to, mode) {
  const reason = client.note ? ` В вашей карточке сказано: «${client.note}».` : "";
  const theirs = ensureCatalog(to);
  const ours = ensureCatalog(from);
  if (mode === "trade") {
    const pitch = tradePitch(from, to);
    const hook = theirs.hook;
    const chip = theirs.chips[0];
    const line = hook
      ? `Акция «${to.name}»: «${hook.title}»${hook.price ? ` — ${hook.price} ₽` : ""}.${hook.note ? ` ${hook.note}.` : ""}`
      : `Предложение «${to.name}»: ${to.offer || to.craft}.`;
    const lift = chip
      ? `Основной товар/услуга: «${chip.title}»${chip.price ? ` — ${chip.price} ₽` : ""}.`
      : "";
    const yours = ours.hook
      ? `Вы клиент «${from.name}» (акция «${ours.hook.title}»).`
      : `Вы клиент «${from.name}».`;
    return {
      direction: "outbound",
      clientName: client.name,
      contact: client.contact,
      partnerId: to.id,
      partnerName: to.name,
      subject: pitch.title,
      body: [
        `${client.name}, здравствуйте.`,
        `${yours}${reason}`,
        pitch.trade,
        line,
        lift,
        `Ваша выгода: ${to.benefit || "скидка или акция как клиенту партнёра"}.`,
        `Если письмо не нужно, ответьте «стоп» — адрес уберут из следующих рассылок.`,
        `Dante Florens.`,
      ].filter(Boolean).join("\n"),
    };
  }
  const joint = mode === "flow" ? null : cobrandCopy(from, to);
  const offer = joint
    ? `${joint.title}. ${joint.move}`
    : `Партнёр «${to.name}» предлагает смежное: ${theirs.hook?.title || to.offer || "товар или услугу той же аудитории"}${theirs.hook?.price ? ` (${theirs.hook.price} ₽)` : ""}.`;
  const mutual = mode === "cobrand"
    ? `Оба бизнеса в одной акции. «${to.name}» предлагает то же своим клиентам.`
    : `Обмен взаимный: «${to.name}» так же рекомендует «${from.name}» своей базе.`;
  return {
    direction: "outbound",
    clientName: client.name,
    contact: client.contact,
    partnerId: to.id,
    partnerName: to.name,
    subject: joint ? `${joint.title}` : `${to.name} — партнёр «${from.name}»`,
    body: [
      `${client.name}, здравствуйте.`,
      `Вы клиент «${from.name}».${reason}`,
      offer,
      `Ваша выгода: ${to.benefit || "скидка или акция от партнёрского бизнеса"}.`,
      mutual,
      `Если письмо не нужно, ответьте «стоп» — адрес уберут из следующих рассылок.`,
      `Dante Florens.`,
    ].join("\n"),
  };
}

function writeReturn(client, from, to) {
  return {
    direction: "return",
    clientName: client.name,
    contact: client.contact,
    partnerId: from.id,
    partnerName: from.name,
    subject: `${to.name} — ответ от партнёра «${from.name}»`,
    body: [
      `${client.name}, здравствуйте.`,
      `Вы клиент «${from.name}».`,
      `Партнёр — «${to.name}»: ${to.offer || to.craft}.`,
      `Ваша выгода: ${to.benefit || "скидка или акция от партнёрского бизнеса"}.`,
      `Ответ «стоп» убирает адрес из следующих рассылок.`,
      `Dante Florens.`,
    ].join("\n"),
  };
}

function redactForeignLetter(letter, { fromName, toName, offer, benefit }) {
  return {
    direction: letter.direction,
    partnerId: letter.partnerId,
    partnerName: letter.partnerName,
    subject: letter.subject,
    clientName: "клиент партнёра",
    contact: null,
    body: [
      `Клиент «${fromName}» (адрес скрыт).`,
      `Партнёр — «${toName}»: ${offer || "смежный товар или услуга"}.`,
      `Выгода клиента: ${benefit || "скидка или акция от партнёра"}.`,
      `Контакт клиента видит только владелец своей базы. Партнёру уходит лишь счётчик потока.`,
      `Dante Florens.`,
    ].join("\n"),
  };
}

function emptySeats(business, businesses, partners) {
  const present = new Set(
    (businesses || [])
      .filter((item) => item.atTable && cityKey(item.city) === cityKey(business.city))
      .map((item) => item.role),
  );
  present.add(business.role);
  const themed = thematicChain(business, present, partners);
  if (!themed) return [];
  return themed.roles
    .filter((role) => role !== business.role && !present.has(role) && ROLES[role])
    .slice(0, 3)
    .map((role) => ({
      role,
      roleTitle: ROLES[role].title,
      city: business.city,
      chainTitle: themed.title,
      draft: [
        `Владельцам бизнеса «${ROLES[role].title}» в городе ${business.city}.`,
        `«${business.name}» уже в Dante Florens, на связке «${themed.title}».`,
        `Вас ещё нет в связке. Зарегистрируйтесь, загрузите базу — и обмен клиентами пойдёт в обе стороны.`,
        `Регистрационный взнос годовой. С подтверждённой сделки вам 92%, платформе 8% комиссии.`,
      ].join("\n"),
    }));
}

function thematicChain(business, present, partners) {
  const used = (partners || []).map((item) => item.chainId).filter(Boolean);
  if (used.length) {
    const counts = new Map();
    for (const id of used) counts.set(id, (counts.get(id) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const found = CHAINS.find((chain) => chain.id === top);
    if (found) return found;
  }
  let best = null;
  for (const chain of CHAINS) {
    let hits = 0;
    let seated = 0;
    for (const role of chain.roles) {
      const share = overlap(ROLES[role]?.situations, business.situations);
      if (share > 0) hits += share;
      if (present.has(role)) seated += 1;
    }
    const score = hits + seated * 0.35;
    if (!best || score > best.score) best = { chain, score };
  }
  return best?.chain || null;
}

function letterMode(picks, partnerId) {
  if (!Array.isArray(picks?.ideas)) return "flow";
  const flow = picks.ideas.includes(`flow:${partnerId}`);
  const brand = picks.ideas.includes(`cobrand:${partnerId}`);
  const trade = picks.ideas.includes(`trade:${partnerId}`);
  if (trade && !brand) return "trade";
  if (brand && flow) return "both";
  if (brand) return "cobrand";
  if (trade) return "trade";
  return "flow";
}

export function buildPlan({ business, businesses, clientsByHouse, seat, picks }) {
  const chosen = seatById(seat || business.seat) || SEATS[1];
  const mine = (clientsByHouse[business.id] || []).filter((client) => !isSuppressed(business, client));
  const slices = describeSlices(mine, business);
  const audience = Array.isArray(picks?.audience) ? picks.audience : null;
  const pool = audience ? mine.filter((client) => clientMatches(client, audience, slices)) : mine;
  let partners = rankPartners(business, businesses, chosen.partners);
  if (Array.isArray(picks?.ideas)) {
    const allow = new Set(picks.ideas);
    partners = partners.filter((partner) => (
      allow.has(`flow:${partner.business.id}`)
      || allow.has(`cobrand:${partner.business.id}`)
      || allow.has(`trade:${partner.business.id}`)
    ));
  }
  const letters = [];
  for (const client of [...pool].sort((a, b) => b.spend - a.spend)) {
    const fits = partners
      .map((partner) => ({ partner, fit: clientFit(client, business, partner.business) }))
      .sort((a, b) => b.fit - a.fit)
      .filter((item, index) => item.fit >= 0.62 || index === 0)
      .slice(0, chosen.lettersPerClient);
    for (const fit of fits) {
      if (fit.fit < 0.5 && letters.length >= 3) continue;
      letters.push(writeLetter(client, business, fit.partner.business, letterMode(picks, fit.partner.business.id)));
    }
  }

  const links = partners.map((partner) => {
    const outbound = letters.filter((letter) => letter.partnerId === partner.business.id);
    const source = (businesses || []).find((item) => item.id === partner.business.id);
    const foreign = (clientsByHouse[partner.business.id] || []).filter((client) => !isSuppressed(source, client));
    const rankedForeign = foreign
      .map((client) => ({ client, fit: clientFit(client, partner.business, business) }))
      .sort((a, b) => b.fit - a.fit);
    const returning = rankedForeign.filter((item) => item.fit >= 0.6).slice(0, 12);
    const illustrated = source?.kind === "member";
    // Чужие contact/имя в превью соседу не отдаём — только обезличенный вид потока.
    const returnLetters = returning.map((item) => ({
      ...redactForeignLetter(writeReturn(item.client, partner.business, business), {
        fromName: partner.business.name,
        toName: business.name,
        offer: business.offer || business.craft,
        benefit: business.benefit,
      }),
      status: illustrated ? "в пачку партнёра" : "расчёт ответного потока",
    }));
    const conv = conversionOf(partner.quality);
    const expectedForPartner = Math.round(outbound.length * conv * (partner.business.ticket || 0));
    const expectedForMember = Math.round(returnLetters.length * conv * (business.ticket || 0));
    let balance = "Потоки сопоставимы.";
    if (expectedForPartner > expectedForMember * 2.5 && expectedForMember > 0) {
      balance = `В сторону «${partner.business.name}» поток гуще. В следующей рассылке приоритет вернётся к «${business.name}».`;
    } else if (expectedForMember > expectedForPartner * 2.5 && expectedForPartner > 0) {
      balance = `В сторону «${business.name}» поток гуще. Партнёр получает больше писем в следующей рассылке.`;
    } else if (!returnLetters.length) {
      balance = "Ответный поток появится, когда у партнёра будет своя база клиентов.";
    }
    return {
      ...partner,
      outbound: outbound.length,
      inbound: returnLetters.length,
      conversion: conv,
      expectedForPartner,
      expectedForMember,
      balance,
      invitation: invitationText({ business, partner, outbound: outbound.length, inbound: returnLetters.length, expectedForPartner, expectedForMember }),
      returnLetters,
    };
  });

  const expected = {
    forMember: links.reduce((sum, link) => sum + link.expectedForMember, 0),
    forPartners: links.reduce((sum, link) => sum + link.expectedForPartner, 0),
    letters: letters.length,
    formula: "ожидание = число писем × доля ответа × средний чек бизнеса, который принимает клиента",
  };

  let invitations = emptySeats(business, businesses, links);
  if (Array.isArray(picks?.ideas)) {
    const allow = new Set(picks.ideas);
    invitations = invitations.filter((item) => allow.has(`invite:${item.role}`) || allow.has(`sketch:${item.role}`));
  }

  return {
    seat: { id: chosen.id, title: chosen.title, price: chosen.price },
    letters,
    links,
    invitations,
    expected,
    audience: audience || ["all"],
  };
}

function invitationText({ business, partner, outbound, inbound, expectedForPartner, expectedForMember }) {
  return [
    `«${partner.business.name}», платформа связала вас с «${business.name}» по смежной аудитории.`,
    partner.syllogism,
    `«${business.name}» отправляет ${outbound} писем своей базе о вас. Ожидаемый оборот у вас: ${money(expectedForPartner)}.`,
    `Ответный поток: ${inbound} клиентов «${partner.business.name}» подходят к «${business.name}». Ожидание у них: ${money(expectedForMember)}.`,
    partner.business.kind === "member"
      ? "Оба бизнеса в сети — обмен клиентами идёт в обе стороны."
      : "Партнёр пока учебный. Ответный поток посчитан внутри платформы.",
  ].join("\n");
}

function isSuppressed(house, client) {
  const list = house?.suppressed || [];
  const contact = normalize(client?.contact);
  if (!contact) return false;
  return list.some((item) => normalize(item) === contact);
}

function money(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value || 0))} ₽`;
}

export function waveReady(business, clientCount) {
  return licenseLive(business) && clientCount > 0 && business.kind === "member";
}
