/** Каталог участника: 1 входная акция + до 2 основных товаров/услуг. */

function clean(value, max = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function money(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function normalizeItem(raw, fallbackTitle = "") {
  if (!raw || typeof raw !== "object") return null;
  const title = clean(raw.title || raw.name || fallbackTitle, 120);
  if (!title) return null;
  return {
    title,
    price: money(raw.price),
    note: clean(raw.note || raw.desc || "", 240),
  };
}

export function normalizeCatalog(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const hook = normalizeItem(source.hook);
  const chips = (Array.isArray(source.chips) ? source.chips : [])
    .map((item) => normalizeItem(item))
    .filter(Boolean)
    .slice(0, 2);
  return {
    hook,
    chips,
    seek: clean(source.seek, 280),
  };
}

/** Если хозяин ещё не собрал каталог — вывести из оффера и чека. */
export function ensureCatalog(business) {
  if (!business) return normalizeCatalog(null);
  if (business.catalog && (business.catalog.hook || (business.catalog.chips || []).length)) {
    return normalizeCatalog(business.catalog);
  }
  const ticket = money(business.ticket);
  const hookTitle = clean(business.offer, 120);
  const chipTitle = clean(business.craft || business.roleTitle, 120) || "основная услуга";
  return normalizeCatalog({
    hook: hookTitle
      ? {
          title: hookTitle,
          price: ticket ? Math.max(500, Math.round(ticket * 0.35)) : 0,
          note: "входная акция для клиента партнёра",
        }
      : null,
    chips: [
      {
        title: chipTitle,
        price: ticket,
        note: clean(business.benefit, 240) || "основной товар или услуга",
      },
    ],
    seek: clean(business.seek, 280),
  });
}

export function catalogReady(business) {
  const catalog = ensureCatalog(business);
  return Boolean(catalog.hook || catalog.chips.length);
}

export function catalogComplement(a, b) {
  const left = ensureCatalog(a);
  const right = ensureCatalog(b);
  const reasons = [];
  if (left.hook && right.chips[0]) {
    reasons.push(`ваша акция «${left.hook.title}» → их товар «${right.chips[0].title}»`);
  }
  if (right.hook && left.chips[0]) {
    reasons.push(`их акция «${right.hook.title}» → ваш товар «${left.chips[0].title}»`);
  }
  if (left.chips[0] && right.chips[0] && left.chips[0].title !== right.chips[0].title) {
    reasons.push(`два товара одной аудитории: «${left.chips[0].title}» × «${right.chips[0].title}»`);
  }
  if (left.seek) reasons.push(`вы ищете: ${left.seek}`);
  if (right.seek) reasons.push(`они ищут: ${right.seek}`);
  return reasons;
}

export function tradePitch(a, b) {
  const left = ensureCatalog(a);
  const right = ensureCatalog(b);
  const give = left.hook?.title || left.chips[0]?.title || a.offer || a.craft;
  const take = right.hook?.title || right.chips[0]?.title || b.offer || b.craft;
  return {
    title: `Совместная акция «${a.name}» × «${b.name}»`,
    trade: `Клиент берёт «${give}» у вас и «${take}» у «${b.name}» — два бизнеса, одна аудитория, скидки и акции от обоих.`,
    move: left.hook && right.chips[0]
      ? `Клиенту с вашей акции «${left.hook.title}» предлагают «${right.chips[0].title}» (${money(right.chips[0].price)} ₽). В обратную сторону — то же.`
      : `Вы предлагаете «${give}», партнёр предлагает «${take}». Каждая сторона получает новых клиентов.`,
    flow: "В ежедневную рассылку идёт конкретное предложение. Комиссия платформы — только после подтверждения сделки обоими бизнесами.",
  };
}

export function marketCard(business, viewer = null) {
  const catalog = ensureCatalog(business);
  const complement = viewer ? catalogComplement(viewer, business) : [];
  return {
    businessId: business.id,
    name: business.name,
    city: business.city,
    craft: business.craft,
    roleTitle: business.roleTitle || business.craft,
    kind: business.kind,
    benefit: business.benefit || "скидка или акция для клиента партнёра",
    catalog,
    whole: "Два бизнеса делятся клиентами: каждый получает новый поток, клиент — выгоду от обоих.",
    complement,
    ready: catalogReady(business),
  };
}

export function rankMarket(viewer, businesses, limit = 24) {
  const seated = (businesses || []).filter((item) => item?.atTable && item.id !== viewer?.id);
  const rows = seated.map((item) => {
    const card = marketCard(item, viewer);
    let score = card.complement.length * 2;
    if (viewer?.city && item.city && String(viewer.city).toLowerCase() === String(item.city).toLowerCase()) score += 2;
    if (viewer?.role && item.role && viewer.role !== item.role) score += 1;
    if (card.catalog.hook) score += 1;
    if (card.catalog.chips.length) score += 1;
    return { ...card, score };
  });
  return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru")).slice(0, limit);
}

export function parseCatalogBody(body) {
  const catalog = normalizeCatalog({
    hook: body?.hook || null,
    chips: Array.isArray(body?.chips) ? body.chips : [body?.chip1, body?.chip2].filter(Boolean),
    seek: body?.seek,
  });
  if (!catalog.hook && !catalog.chips.length) {
    return { error: "Укажите хотя бы одну входную акцию или основной товар/услугу." };
  }
  return { catalog };
}
