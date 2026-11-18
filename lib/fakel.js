/** Консультант платформы: простой умный помощник и наставник. */

import { ensureCatalog, catalogReady, rankMarket } from "./catalog.js";
import { cityOfFuture, primaryQuarter } from "./city.js";
import { licenseLive } from "./exchange.js";
import { rankPartners, SEATS } from "./engine.js";
import { readAttachments } from "./fakel-files.js";
import { seatById } from "./ontology.js";

const MAX_HISTORY = 24;
const MAX_MEMORY = 40;

export function normalizeMessage(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
}

export function detectIntent(text) {
  const t = normalizeMessage(text).toLowerCase();
  if (!t) return "empty";
  if (/^(привет|здравств|добрый|хай|hello|йо|бро)/.test(t)) return "hello";
  if (/каталог|акци|товар|услуг|офер/.test(t)) return "catalog";
  if (/баз[аые]|клиент|письм|рассыл|утро|волн/.test(t)) return "morning";
  if (/рынк|сосед|партн|коллаб|обмен|связк/.test(t)) return "market";
  if (/город|квартал|пригород|район/.test(t)) return "city";
  if (/сделк|комисс|взнос|деньг|выруч|8%|финанс/.test(t)) return "money";
  if (/секрет|напомин|задач|план на|что сделать|приоритет/.test(t)) return "secretary";
  if (/улучш|дизайн|интерфейс|виджет|соверш|баг|сломан/.test(t)) return "improve";
  if (/помощ|как работ|что ты|факел|консульт/.test(t)) return "help";
  if (/аудио|голос|скажи|произнес/.test(t)) return "voice";
  if (/файл|вложен|прикреп|документ|прочитай|csv|pdf|картинк|фото/.test(t)) return "file";
  return "counsel";
}

function seatTitle(business) {
  return seatById(business?.seat)?.title || "место ещё не выбрано";
}

export function buildMemberContext({ business, clients = [], businesses = [], deals = [], morning = null }) {
  if (!business) {
    return {
      role: "guest",
      summary: "Гость платформы. Бизнес ещё не зарегистрирован.",
      facts: [],
      next: ["Зарегистрировать бизнес", "Посмотреть партнёров", "Спросить, как работает обмен клиентами"],
    };
  }
  const catalog = ensureCatalog(business);
  const quarter = primaryQuarter(business);
  const partners = rankPartners(business, businesses, (seatById(business.seat) || SEATS[1]).partners);
  const market = rankMarket(business, businesses, 5);
  const pending = (deals || []).filter((item) => (
    (item.beneficiaryId === business.id || item.partnerId === business.id) && item.status !== "confirmed"
  ));
  const facts = [
    `Бизнес: «${business.name}» · ${business.roleTitle || business.craft} · ${business.city}`,
    `Взнос: ${licenseLive(business) ? `оплачен (${seatTitle(business)})` : "ещё не оплачен"}`,
    `База: ${clients.length} клиентов`,
    `Товары и акции: ${catalogReady(business) ? `акция «${catalog.hook?.title || "—"}», позиций ${catalog.chips.length}` : "не заполнены"}`,
    `Крепких партнёров: ${partners.filter((item) => !item.fallback).length}`,
    pending.length ? `Ждут подтверждения сделок: ${pending.length}` : "Открытых сделок на подтверждении нет",
  ];
  if (morning?.waveAt) facts.push(`Следующая рассылка: ${morning.waveAt}`);
  const next = [];
  if (!licenseLive(business)) next.push("Оплатить регистрационный взнос");
  if (!clients.length) next.push("Загрузить базу клиентов с согласием");
  if (!catalogReady(business)) next.push("Заполнить входную акцию и основные товары/услуги");
  if (partners[0]) next.push(`Настроить обмен с «${partners[0].business.name}»`);
  if (!next.length) next.push("Отметить предложения в рассылку и проверить выборку аудитории");
  return {
    role: "member",
    summary: `Участник «${business.name}». Цель — новый поток клиентов из партнёрских бизнесов и подтверждённый оборот.`,
    facts,
    next,
    partners: partners.slice(0, 4).map((item) => ({
      name: item.business.name,
      quality: item.quality,
      density: item.density,
    })),
    market: market.slice(0, 4).map((item) => item.name),
    catalog,
    quarter,
    clientCount: clients.length,
    pendingCount: pending.length,
  };
}

function memoryNote(db, businessId) {
  db.fakel ||= { sessions: {}, improvements: [], prefs: {} };
  const key = businessId || "guest";
  if (!db.fakel.sessions[key]) {
    db.fakel.sessions[key] = { history: [], notes: [], updatedAt: null };
  }
  return db.fakel.sessions[key];
}

export function pushHistory(db, businessId, role, text) {
  const session = memoryNote(db, businessId);
  session.history.push({ role, text: normalizeMessage(text), at: new Date().toISOString() });
  if (session.history.length > MAX_HISTORY) session.history = session.history.slice(-MAX_HISTORY);
  session.updatedAt = new Date().toISOString();
  return session;
}

export function rememberImprovement(db, idea, businessId) {
  db.fakel ||= { sessions: {}, improvements: [], prefs: {} };
  db.fakel.improvements.push({
    id: `imp-${Date.now()}`,
    at: new Date().toISOString(),
    businessId: businessId || null,
    idea: normalizeMessage(idea).slice(0, 500),
    status: "noted",
  });
  if (db.fakel.improvements.length > MAX_MEMORY) {
    db.fakel.improvements = db.fakel.improvements.slice(-MAX_MEMORY);
  }
}

function lineList(items) {
  return (items || []).map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function replyHello(ctx) {
  if (ctx.role === "member") {
    return [
      `Здравствуйте. Я AI-консультант — отвечаю на любые вопросы, а по платформе знаю ваш контекст: «${ctx.facts[0]?.replace(/^Бизнес: /, "") || "ваш бизнес"}».`,
      `Если про дело здесь, сейчас логично:\n${lineList(ctx.next)}`,
      "Спрашивайте о чём угодно: бизнес, маркетинг, решение, идея — или просто обычный вопрос.",
    ].join("\n\n");
  }
  return [
    "Здравствуйте. Я AI-консультант: умный помощник и наставник.",
    "Отвечаю на любые темы. Если вопрос про Dante Florens · Дарующий расцвет — помогу с подарками-локомотивами, связками, QR-купонами, Лид-коинами, базой и рассылкой.",
    "Пишите как удобно — даже коротко или нечётко. Разберёмся.",
  ].join("\n\n");
}

function replySecretary(ctx) {
  const care = [];
  if (ctx.clientCount === 0) care.push("База пуста. Загрузите 10–30 клиентов с короткой заметкой.");
  else care.push(`В базе ${ctx.clientCount} человек — перед рассылкой сузьте сегмент.`);
  if (ctx.pendingCount) care.push(`${ctx.pendingCount} сделок ждут подтверждения партнёра.`);
  return [
    "На сегодня:",
    lineList(ctx.next),
    "",
    lineList(care),
    ctx.partners?.length ? `\nПартнёры: ${ctx.partners.map((p) => `${p.name} (${p.quality})`).join("; ")}.` : "",
  ].join("\n");
}

function replyCatalog(ctx) {
  if (ctx.role !== "member") {
    return "После регистрации заполните входную акцию и до двух основных товаров/услуг — по ним подбираются партнёры.";
  }
  const cat = ctx.catalog;
  return [
    cat?.hook || (cat?.chips || []).length
      ? `Сейчас: акция «${cat.hook?.title || "—"}»${cat.hook?.price ? ` (${cat.hook.price} ₽)` : ""}; товары/услуги: ${(cat.chips || []).map((c) => c.title).join(", ") || "пока нет"}.`
      : "Товары и акции ещё не заполнены. Откройте кабинет → Товары и акции.",
    "Входная акция зовёт клиента партнёра. Основные позиции держат ваш чек. Укажите, чью аудиторию ищете.",
    "Сохраните карточку — предложения и письма станут точнее.",
  ].join("\n\n");
}

function replyMorning(ctx) {
  if (ctx.role !== "member") {
    return "Ежедневная рассылка — письма вашей базе о партнёрах. Нужны регистрация, взнос и база. Письма только тем, кого вы загрузили.";
  }
  return [
    lineList(ctx.facts.filter((f) => /База|Взнос|рассыл|Товары/i.test(f))),
    "",
    "Шаги: 1) отметьте предложения, 2) выберите сегмент базы, 3) проверьте письма перед выпуском.",
    ctx.next.includes("Загрузить базу клиентов с согласием")
      ? "Без базы рассылка не стартует — так защищены клиенты."
      : "База есть. Смотрите кабинет → Рассылка и Письма.",
  ].join("\n");
}

function replyMarket(ctx) {
  if (ctx.role !== "member") {
    return "Раздел «Бизнесы» показывает акции участников. Войдите в кабинет, чтобы видеть взаимную выгоду.";
  }
  const names = (ctx.market || []).join(", ") || "пока мало карточек";
  const partners = (ctx.partners || []).map((p) => `«${p.name}» — ${p.quality}, совпадение ${p.density}`).join("\n");
  return [
    "Обмен строится на смежном интересе клиента. Прямые конкуренты одной роли не связываются.",
    partners ? `Ближние партнёры:\n${partners}` : "Крепких партнёров мало — уточните аудиторию в описании бизнеса.",
    `Рядом в сети: ${names}.`,
    "В «Предложениях» отметьте совместную акцию — письмо уйдёт с конкретной выгодой, не с пустой скидкой.",
  ].join("\n\n");
}

function replyCity() {
  return [
    "Город будущего — следующий этап. Сейчас продукт — обмен клиентами между бизнесами.",
    "Раздел оставлен в зачаточном виде и не мешает ежедневной работе.",
    "Вернитесь к регистрации, базе и предложениям партнёров.",
  ].join("\n\n");
}

function replyMoney(ctx) {
  return [
    "Деньги просто: бизнесу 92%, платформе 8% — только со сделки, которую подтвердили оба бизнеса.",
    "Плюс регистрационный взнос за доступ к партнёрам и ежедневным предложениям.",
    "Приоритет: база → рассылка → подтверждённые сделки → взнос продлён.",
    ctx.pendingCount ? `Сейчас у вас ${ctx.pendingCount} незакрытых подтверждений — закройте их, чтобы учесть оборот.` : "Открытых подтверждений нет — растите рассылку и карточки товаров.",
  ].join("\n\n");
}

function replyImprove(ctx, text, db) {
  const idea = normalizeMessage(text).slice(0, 200);
  rememberImprovement(db, idea, ctx.role === "member" ? "member" : "guest");
  return "Записал. Если нужно — уточните, что именно мешает в работе, и разберём.";
}

function replyHelp() {
  return "Я универсальный AI-консультант. Можно спрашивать о чём угодно. По платформе Dante Florens особенно силён: партнёры, база, рассылка, акции, сделки. Просто напишите вопрос своими словами.";
}

function replyVoice() {
  return "Нажмите микрофон, чтобы говорить. Ответ могу озвучить, если голос включён.";
}

function replyFile(ctx, bundle) {
  if (!bundle?.count) {
    return "Жми «+» в чате и прикрепи любой файл: текст, CSV базы, JSON, PDF, картинку, офисный документ. Я прочитаю в ядре и отвечу по смыслу для роста дома и нитей.";
  }
  const lines = (bundle.files || []).map((file, i) => `${i + 1}. ${file.name} — ${file.kind}${file.readable ? ", прочитан" : ", частично"}; ${file.summary}`);
  const hint = [];
  if (bundle.files.some((f) => f.ext === "csv" || /клиент|база|contact/i.test(f.summary + f.name))) {
    hint.push("Похоже на базу: могу подсказать, как занести в кабинет → База (имя, контакт, заметка, траты, город) и не слать без согласия.");
  }
  if (bundle.files.some((f) => f.kind === "image")) {
    hint.push("Картинка принята. Кратко опишите, что на ней важно.");
  }
  if (ctx.role === "member") {
    hint.push(`Дальше логично: ${ctx.next[0] || "проверить предложения партнёрам"}.`);
  }
  return [
    `Прочитал ${bundle.count} файл(ов):`,
    lines.join("\n"),
    "",
    bundle.digest ? `Кратко:\n${bundle.digest.slice(0, 3500)}` : "",
    hint.length ? `\n${hint.join("\n")}` : "",
    "\nНапишите, что сделать с этим дальше.",
  ].filter(Boolean).join("\n");
}

function isPlatformish(text) {
  return /партн|баз[аые]|рассыл|акци|комисс|взнос|сделк|клиент|обмен|платформ|dante|florens|бизнес|регистр/i.test(text || "");
}

function replyCounsel(ctx, text) {
  const q = normalizeMessage(text);
  if (!q) return "Напишите вопрос — любая тема. Можно коротко и своими словами.";

  if (isPlatformish(q)) {
    return [
      `Понял запрос: «${q.slice(0, 120)}».`,
      ctx.role === "member"
        ? `В вашем кабинете сейчас: ${ctx.next[0] || "можно отмечать предложения партнёрам"}.`
        : "Если ещё не в сети — зарегистрируйте бизнес, оплатите взнос, загрузите базу: дальше появятся ежедневные предложения партнёров.",
      "Уточните одну деталь (цель / город / сфера), и дам конкретный шаг.",
    ].join("\n\n");
  }

  return [
    `Слышу вопрос: «${q.slice(0, 160)}».`,
    "Короткий ход: сформулируйте, чего хотите добиться одним предложением — решение, проверка или совет. Тогда разрежу на 2–3 ясных шага.",
    ctx.role === "member"
      ? `Если захотите связать это с платформой: ${ctx.next[0] || "откройте предложения партнёрам в кабинете"}.`
      : "Могу помочь и по общим темам, и по росту клиентов через партнёрские бизнесы на платформе.",
  ].join("\n\n");
}

export function localReply({ text, ctx, db, files }) {
  const intent = files?.count ? "file" : detectIntent(text);
  let answer;
  switch (intent) {
    case "empty":
      answer = files?.count
        ? replyFile(ctx, files)
        : "Напишите вопрос — или прикрепите файл.";
      break;
    case "file":
      answer = replyFile(ctx, files);
      break;
    case "hello":
      answer = replyHello(ctx);
      break;
    case "secretary":
      answer = replySecretary(ctx);
      break;
    case "catalog":
      answer = replyCatalog(ctx);
      break;
    case "morning":
      answer = replyMorning(ctx);
      break;
    case "market":
      answer = replyMarket(ctx);
      break;
    case "city":
      answer = replyCity(ctx);
      break;
    case "money":
      answer = replyMoney(ctx);
      break;
    case "improve":
      answer = replyImprove(ctx, text, db);
      break;
    case "help":
      answer = replyHelp();
      break;
    case "voice":
      answer = replyVoice();
      break;
    default:
      answer = replyCounsel(ctx, text);
  }
  return { intent, answer, speak: true };
}

async function llmReply({ text, ctx, history, files }) {
  const key = process.env.FAKEL_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.FAKEL_MODEL || "gpt-4o-mini";
  const system = [
    "Ты — универсальный AI-консультант: умный помощник и наставник.",
    "Отвечай на любые темы: бизнес, люди, решения, идеи, бытовые и общие вопросы. Если формулировка нечёткая — сначала мягко проясни смысл, затем дай полезный ответ.",
    "Когда вопрос про Dante Florens или рост клиентов — опирайся на продукт: обмен клиентскими базами между бизнесами со смежной аудиторией; клиенту акции от обоих; платформе регистрационный взнос и 8% с подтверждённой сделки обоими бизнесами.",
    "Тон: спокойный, мудрый, простой. Без пафоса и лишних ролей. Один ясный ход лучше длинного списка.",
    "Не назначай лекарства, дозировки и юридические схемы под ключ — дай рамку и направь к специалисту, если нужно.",
    `Контекст пользователя на платформе:\n${ctx.summary}\n${(ctx.facts || []).join("\n")}\nВозможные шаги в кабинете: ${(ctx.next || []).join("; ") || "нет"}`,
    files?.digest ? `Вложения:\n${files.digest.slice(0, 12000)}` : "",
  ].filter(Boolean).join("\n");
  const messages = [
    { role: "system", content: system },
    ...(history || []).slice(-10).map((item) => ({
      role: item.role === "fakel" ? "assistant" : "user",
      content: item.text,
    })),
    { role: "user", content: text || (files?.count ? "Разбери вложения и ответь полезно." : "") },
  ];
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 900 }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) return null;
    return { intent: "llm", answer, speak: true, engine: "llm" };
  } catch {
    return null;
  }
}

export async function adviseFakel({ db, text, business, clients, businesses, deals, morning, files }) {
  const message = normalizeMessage(text);
  const bundle = readAttachments(files);
  const ctx = buildMemberContext({ business, clients, businesses, deals, morning });
  const businessId = business?.id || "guest";
  const userLine = [
    message || (bundle.count ? "Прикрепил файл(ы)." : "(пусто)"),
    bundle.count ? `Вложения: ${bundle.files.map((f) => f.name).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  pushHistory(db, businessId, "user", userLine);
  const session = memoryNote(db, businessId);
  if (bundle.count) {
    session.notes = [...(session.notes || []), {
      at: new Date().toISOString(),
      files: bundle.files,
      digest: bundle.digest.slice(0, 8000),
    }].slice(-10);
  }
  // Любой осмысленный запрос сначала к AI; узкие ответы платформы — запасной контур.
  const remote = (message || bundle.count)
    ? await llmReply({
      text: message || "Разбери вложения и ответь полезно.",
      ctx,
      history: session.history,
      files: bundle,
    })
    : null;
  const result = remote || localReply({ text: message, ctx, db, files: bundle });
  pushHistory(db, businessId, "fakel", result.answer);
  return {
    ...result,
    engine: result.engine || "local",
    files: bundle.files,
    context: {
      role: ctx.role,
      next: ctx.next,
      facts: ctx.facts.slice(0, 6),
    },
    history: session.history.slice(-12),
  };
}

export function fakelBootstrap(db, business) {
  const ctx = buildMemberContext({
    business,
    clients: [],
    businesses: db.businesses || [],
    deals: db.deals || [],
  });
  const future = cityOfFuture(db.businesses || []);
  return {
    name: "Консультант",
    title: "AI-помощник на любые темы",
    seal: "/fakel.svg",
    greeting: replyHello(ctx),
    voiceHint: "Спрашивайте о чём угодно. Можно голосом и с файлами.",
    next: ctx.next,
    vision: future.vision,
    improvements: (db.fakel?.improvements || []).slice(-5),
  };
}
