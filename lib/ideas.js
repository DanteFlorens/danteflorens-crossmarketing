import { catalogComplement, ensureCatalog, tradePitch } from "./catalog.js";
import { pairReasons } from "./exchange.js";
import {
  CHAINS,
  ROLES,
  SITUATION_KEYS,
  SITUATION_TITLES,
  cityKey,
  hasStem,
} from "./ontology.js";

const JOINTS = {
  celebration: {
    name: (a, b) => `Совместная акция «${a.name}» и «${b.name}» к торжеству`,
    move: "Одна акция на два бизнеса: клиент получает скидки у обоих.",
    trade: "Клиент закрывает два связанных покупки одним решением. Средний чек связки выше.",
    flow: "В базу уходит одно письмо с двумя предложениями, а не две отдельные рекламы.",
  },
  new_home: {
    name: (a, b) => `Пакет для новосёлов «${a.name}» и «${b.name}»`,
    move: "Два бизнеса — одно предложение после переезда.",
    trade: "Новосёл берёт смежную услугу, пока решение ещё свежее.",
    flow: "Письмо уходит тем, у кого в заметке переезд, ремонт или ключи.",
  },
  appearance: {
    name: (a, b) => `Пакет образа «${a.name}» и «${b.name}»`,
    move: "Две услуги одного запроса — одна запись.",
    trade: "Клиент добирает смежную услугу, средний чек визита растёт.",
    flow: "Письмо зовёт на конкретную связку, а не на абстрактную скидку.",
  },
  health: {
    name: (a, b) => `Пакет заботы о теле «${a.name}» и «${b.name}»`,
    move: "Два кабинета — одно предложение для одной аудитории.",
    trade: "Абонемент и смежная услуга продаются вместе.",
    flow: "Поток идёт между теми, кто уже платит за здоровье и тело.",
  },
  mobility: {
    name: (a, b) => `Пакет для автовладельцев «${a.name}» и «${b.name}»`,
    move: "Автосервис и смежная услуга — одним предложением.",
    trade: "Клиент закрывает второй чек, пока машина уже в работе.",
    flow: "Письмо уходит владельцам авто из базы, не всей книге.",
  },
  child: {
    name: (a, b) => `Семейный пакет «${a.name}» и «${b.name}»`,
    move: "Один семейный визит — два бизнеса.",
    trade: "Родитель берёт пару смежных предложений, а не ищет второй бизнес с нуля.",
    flow: "В выборку попадают заметки про детей и семью.",
  },
  pet: {
    name: (a, b) => `Пакет для питомцев «${a.name}» и «${b.name}»`,
    move: "Две заботы о животном под одной акцией.",
    trade: "Хозяин питомца добирает смежную покупку в тот же визит.",
    flow: "Письмо уходит тем, у кого в базе животное.",
  },
  business_ops: {
    name: (a, b) => `Пакет для предпринимателей «${a.name}» и «${b.name}»`,
    move: "Два деловых сервиса — одно предложение.",
    trade: "Владелец бизнеса закрывает смежную задачу, пока уже платит за первую.",
    flow: "Поток идёт между базами владельцев бизнесов.",
  },
  travel: {
    name: (a, b) => `Пакет к поездке «${a.name}» и «${b.name}»`,
    move: "Поездка и смежная услуга — одним предложением.",
    trade: "Клиент докупает смежное, пока бронь уже есть.",
    flow: "Письмо тем, кто уже собирается, а не всей базе.",
  },
  gift: {
    name: (a, b) => `Подарочный набор «${a.name}» и «${b.name}»`,
    move: "Подарок от двух бизнесов.",
    trade: "Подарок из двух предложений стоит дороже одного предмета.",
    flow: "В выборку — те, кто уже брал подарок или праздник.",
  },
  food_out: {
    name: (a, b) => `Вечерний пакет «${a.name}» и «${b.name}»`,
    move: "Ужин и смежный шаг — в один вечер.",
    trade: "Гость оставляет второй чек в ту же ночь.",
    flow: "Письмо перед вечером, не общая рассылка.",
  },
  education: {
    name: (a, b) => `Учебный пакет «${a.name}» и «${b.name}»`,
    move: "Два смежных навыка — одной записью.",
    trade: "Ученик остаётся дольше и платит второму бизнесу.",
    flow: "Поток между школами и клубами одной аудитории.",
  },
  ritual: {
    name: (a, b) => `Связка «${a.name}» и «${b.name}»`,
    move: "Два тихих шага одного запроса. Без лишней витрины.",
    trade: "Семья закрывает смежный шаг там, где уже есть доверие.",
    flow: "Письмо короткое и только тем, кто уже в этом деле.",
  },
  status: {
    name: (a, b) => `Закрытый приём «${a.name}» и «${b.name}»`,
    move: "Совместное предложение двух бизнесов для статусных клиентов.",
    trade: "Клиент берёт пару, а не одну позицию.",
    flow: "В рассылку попадает верхний чек базы.",
  },
};

export function sharedSituation(a, b) {
  const right = new Set(b?.situations || []);
  const hit = (a?.situations || []).find((item) => right.has(item));
  if (hit) return hit;
  return (a?.situations || [])[0] || (b?.situations || [])[0] || "gift";
}

export function cobrandCopy(a, b) {
  const situation = sharedSituation(a, b);
  const joint = JOINTS[situation] || JOINTS.gift;
  return {
    situation,
    situationTitle: SITUATION_TITLES[situation] || "общий интерес",
    title: joint.name(a, b),
    move: joint.move,
    trade: joint.trade,
    flow: joint.flow,
  };
}

function momentLine(clients, situation) {
  const list = clients || [];
  if (!list.length) return "База ещё не загружена. Предложение попадёт в рассылку сразу после загрузки.";
  const keys = SITUATION_KEYS[situation] || [];
  const count = list.filter((client) => keys.some((key) => hasStem(client.note || "", key))).length;
  const title = SITUATION_TITLES[situation] || "этот интерес";
  if (!count) return "В заметках базы этот интерес не отмечен. Письмо уйдёт по выбранной выборке.";
  return `В базе уже ${count} ${people(count)} по интересу «${title}».`;
}

function people(count) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return "клиентов";
  if (n1 === 1) return "клиент";
  if (n1 > 1 && n1 < 5) return "клиента";
  return "клиентов";
}

function flowIdea(business, partner, clients) {
  const other = partner.business;
  const situation = partner.shared?.[0] || sharedSituation(business, other);
  const moment = SITUATION_TITLES[situation] || "смежный интерес";
  const thin = Boolean(partner.fallback);
  return {
    id: `flow:${other.id}`,
    kind: "flow",
    kindTitle: "Обмен клиентами",
    partnerId: other.id,
    role: other.role,
    with: other.name,
    title: `Обмен клиентами с «${other.name}»`,
    trade: thin
      ? `Общего интереса почти не видно. Уточните аудиторию — тогда обмен даст результат.`
      : `«${other.name}» получает визит по интересу «${moment}», когда клиент уже ваш. Вы получаете такой же визит из их базы.`,
    flow: thin
      ? "Поток слабый: письма уйдут, но ответ будет слабее, чем у крепкой связки."
      : "В ежедневную рассылку встанет взаимный обмен. Деньги считаются после подтверждения сделки обоими бизнесами.",
    move: `Клиент «${business.name}» получает предложение «${other.name}». Выгода: ${other.benefit || "скидка или акция для клиента партнёра"}.`,
    fit: momentLine(clients, situation),
    quality: partner.quality,
    density: partner.density,
    syllogism: partner.syllogism,
    reasons: pairReasons(business, other),
    thin,
  };
}

function tradeIdea(business, partner, clients) {
  const other = partner.business;
  const pitch = tradePitch(business, other);
  const complement = catalogComplement(business, other);
  const thin = Boolean(partner.fallback) || complement.length === 0;
  const situation = partner.shared?.[0] || sharedSituation(business, other);
  return {
    id: `trade:${other.id}`,
    kind: "trade",
    kindTitle: "Совместная акция",
    partnerId: other.id,
    role: other.role,
    with: other.name,
    title: pitch.title,
    trade: thin
      ? "Каталоги ещё не сложились в пару. Добавьте входную акцию и основные товары — тогда предложение станет точным."
      : pitch.trade,
    flow: pitch.flow,
    move: pitch.move,
    fit: momentLine(clients, situation),
    quality: partner.quality,
    density: partner.density,
    syllogism: partner.syllogism,
    reasons: [...new Set([...pairReasons(business, other), ...complement])],
    thin,
    catalog: {
      ours: ensureCatalog(business),
      theirs: ensureCatalog(other),
    },
  };
}

function cobrandIdea(business, partner, clients) {
  const other = partner.business;
  const joint = cobrandCopy(business, other);
  const thin = Boolean(partner.fallback);
  return {
    id: `cobrand:${other.id}`,
    kind: "cobrand",
    kindTitle: "Кобрендинг",
    partnerId: other.id,
    role: other.role,
    with: other.name,
    title: joint.title,
    trade: thin ? "Общую акцию можно собрать, но без общего интереса клиента она слабо поднимет продажи." : joint.trade,
    flow: thin ? "Лучше не ставить в рассылку, пока интерес клиента не назван." : joint.flow,
    move: joint.move,
    fit: momentLine(clients, joint.situation),
    quality: partner.quality,
    density: partner.density,
    syllogism: partner.syllogism,
    reasons: pairReasons(business, other),
    thin,
  };
}

function chainScore(business, chain) {
  const situations = new Set(business.situations || []);
  let score = chain.roles.includes(business.role) ? 1 : 0;
  for (const role of chain.roles) {
    if (role === business.role) continue;
    for (const situation of ROLES[role]?.situations || []) {
      if (situations.has(situation)) score += 1;
    }
  }
  return score;
}

function relevantChains(business) {
  return CHAINS
    .map((chain) => ({ chain, score: chainScore(business, chain) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((item) => item.chain);
}

function missingRole(chain, business, present) {
  let best = null;
  for (const role of chain.roles) {
    if (role === business.role || present.has(role) || !ROLES[role]) continue;
    const overlap = (ROLES[role].situations || []).filter((item) => (business.situations || []).includes(item)).length;
    if (!overlap) continue;
    if (!best || overlap > best.overlap) best = { role, overlap };
  }
  return best?.role || null;
}

function gapIdeas(business, businesses, partners) {
  const present = new Set(
    (businesses || [])
      .filter((item) => item.atTable && cityKey(item.city) === cityKey(business.city))
      .map((item) => item.role),
  );
  present.add(business.role);
  for (const partner of partners || []) present.add(partner.business.role);
  const chain = relevantChains(business)[0];
  if (!chain) return [];
  const role = missingRole(chain, business, present);
  if (!role) return [];
  const ghost = { name: ROLES[role].title, situations: ROLES[role].situations, role };
  const joint = cobrandCopy(business, ghost);
  const situation = SITUATION_TITLES[joint.situation] || "смежный интерес";
  return [
    {
      id: `invite:${role}`,
      kind: "invite",
      kindTitle: "Кого не хватает",
      partnerId: null,
      role,
      with: ROLES[role].title,
      title: `Пригласить «${ROLES[role].title}» в связку`,
      trade: `Для интереса «${situation}» не хватает партнёра «${ROLES[role].title}». С ним обмен базами станет полнее.`,
      flow: "Пока партнёра нет — можно сохранить идею и пригласить его на платформу.",
      move: joint.move,
      fit: momentLine(business.clients || [], joint.situation),
      quality: "нужен партнёр",
      density: null,
      syllogism: null,
      reasons: [`интерес: ${situation}`, `связка: ${chain.title}`],
      thin: true,
    },
  ];
}

export function buildIdeas({ business, businesses, partners, clients }) {
  const list = [];
  for (const partner of partners || []) {
    list.push(flowIdea(business, partner, clients));
    list.push(tradeIdea(business, partner, clients));
    list.push(cobrandIdea(business, partner, clients));
  }
  list.push(...gapIdeas(business, businesses, partners));
  if (list.length) return list;
  return [
    {
      id: "wait:situation",
      kind: "flow",
      kindTitle: "Обмен клиентами",
      partnerId: null,
      role: null,
      with: business.city || "ваш город",
      title: "Сначала опишите аудиторию",
      trade: "Без понимания, кому вы нужны, платформа не подберёт партнёров для обмена базой.",
      flow: "Укажите, кто ваши клиенты и какой интерес у них смежный. Тогда появятся партнёры и ежедневные предложения.",
      move: "Допишите сферу и кому вы нужны. Подойдёт любой формат бизнеса — офлайн или онлайн.",
      fit: "Сферу можно не выбирать из списка: её читают из ваших слов.",
      quality: "ждёт описание",
      density: null,
      syllogism: "Бизнесы связываются не отраслью, а смежным интересом одного и того же клиента.",
      thin: true,
    },
  ];
}

export function describeSlices(clients, business) {
  const list = clients || [];
  const slices = [{ id: "all", title: "Вся база", count: list.length }];
  const seen = new Set();
  for (const situation of Object.keys(SITUATION_TITLES)) {
    const keys = SITUATION_KEYS[situation] || [];
    const count = list.filter((client) => keys.some((key) => hasStem(`${client.note || ""} ${client.city || ""}`, key))).length;
    if (!count || seen.has(situation)) continue;
    seen.add(situation);
    slices.push({
      id: `sit:${situation}`,
      title: SITUATION_TITLES[situation],
      count,
    });
  }
  const spends = list.map((client) => Number(client.spend) || 0).filter((value) => value > 0).sort((a, b) => a - b);
  if (spends.length) {
    const floor = spends[Math.floor(spends.length / 2)];
    const count = list.filter((client) => (Number(client.spend) || 0) >= floor).length;
    if (count && count < list.length) {
      slices.push({ id: "spend:upper", title: "Верхний чек базы", count, floor });
    }
  }
  const cities = [...new Set(list.map((client) => cityKey(client.city)).filter(Boolean))];
  if (cities.length > 1) {
    for (const city of cities) {
      slices.push({
        id: `city:${city}`,
        title: city,
        count: list.filter((client) => cityKey(client.city) === city).length,
      });
    }
  }
  return slices;
}

export function clientMatches(client, audience, slices) {
  if (!audience?.length || audience.includes("all")) return true;
  const upper = (slices || []).find((item) => item.id === "spend:upper");
  return audience.some((id) => {
    if (id === "note:empty") return true;
    if (id.startsWith("sit:")) {
      const keys = SITUATION_KEYS[id.slice(4)] || [];
      return keys.some((key) => hasStem(`${client.note || ""} ${client.city || ""}`, key));
    }
    if (id === "spend:upper") return Boolean(upper) && (Number(client.spend) || 0) >= upper.floor;
    if (id.startsWith("city:")) return cityKey(client.city) === id.slice(5);
    return false;
  });
}
