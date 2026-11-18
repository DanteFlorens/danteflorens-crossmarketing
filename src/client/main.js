const app = document.querySelector("#app");
const state = {
  path: "home",
  pane: "ideas",
  me: null,
  morning: null,
  example: null,
  atlas: null,
  market: null,
  city: null,
  house: null,
  crossflow: null,
  match: null,
  matchMode: "adjacent",
  coopTemplate: "overflow",
  claim: null,
  claimCode: "",
  myCoupon: null,
  cashier: null,
  cashierToken: "",
  error: "",
  notice: "",
  packet: "",
  picks: null,
  picksFor: null,
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const rub = (value) => `${new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0))} ₽`;
const when = (iso) => iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "ещё не назначено";
const day = (iso) => iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)) : "";

function countdown(iso) {
  if (!iso) return "ждёт оплату и базу клиентов";
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "рассылка готова к выпуску";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} ч ${minutes} мин`;
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}) };
  const token = localStorage.getItem("florens-token");
  const key = sessionStorage.getItem("florens-house");
  const guest = localStorage.getItem("florens-guest");
  if (token) headers["X-Florens-Token"] = token;
  if (key) headers["X-House-Key"] = key;
  if (guest) headers["X-Florens-Guest"] = guest;
  const response = await fetch(path, { method: options.method || "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !String(path).startsWith("/api/guest")) localStorage.removeItem("florens-token");
  if (!response.ok) throw new Error(data.error || "Ошибка платформы");
  return data;
}

function parseHash() {
  const raw = location.hash.slice(1) || "home";
  const [pathPart, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  if (pathPart.startsWith("cashier/")) {
    return { path: "cashier", pane: "ideas", cashierToken: pathPart.slice("cashier/".length), claimCode: "" };
  }
  if (pathPart === "claim" || pathPart.startsWith("c/")) {
    const code = params.get("code") || (pathPart.startsWith("c/") ? pathPart.slice(2) : "");
    return { path: "claim", pane: "ideas", claimCode: code, cashierToken: "" };
  }
  const path = pathPart || "home";
  return {
    path,
    pane: params.get("pane") || (path === "cabinet" ? "hq" : "ideas"),
    claimCode: "",
    cashierToken: "",
  };
}

function shell(body) {
  const path = state.path;
  const door = state.me ? `#cabinet` : `#enter`;
  const doorLabel = state.me ? state.me.name : "Войти";
  return `
    <header class="top">
      <div class="top-in">
        <a class="brand" href="#home">
          <span class="seal"><img src="/fakel.svg" alt="Dante Florens" width="42" height="42"></span>
          <span><span class="brand-name">Dante Florens</span><span class="brand-sub">Дарующий расцвет</span></span>
        </a>
        <nav class="nav">
          <a href="#home" class="${path === "home" ? "on" : ""}">Главная</a>
          <a href="#atlas" class="${path === "atlas" ? "on" : ""}">Партнёры</a>
          <a href="#market" class="${path === "market" ? "on" : ""}">Бизнесы</a>
          <a href="#guest" class="${path === "guest" ? "on" : ""}">Клиентам</a>
          <a href="${door}" class="${path === "cabinet" || path === "enter" || path === "pay" ? "on" : ""}">${esc(doorLabel)}</a>
          <a href="#house" class="${path === "house" ? "on" : ""}">Финансы</a>
        </nav>
      </div>
    </header>
    <main class="wrap">${state.error ? `<p class="alert">${esc(state.error)}</p>` : ""}${state.notice ? `<p class="ok">${esc(state.notice)}</p>` : ""}${body}</main>`;
}

function home() {
  const example = state.example;
  return shell(`
    <section class="hero">
      <div>
        <p class="small">Dante Florens · Дарующий расцвет</p>
        <h1>Поток живых клиентов без бюджета на рекламу</h1>
        <p class="lede">Кладёте подарок-локомотив. ИИ-Расцвет находит партнёра, пишет сертификат и скрипт кассира. Клиент сам забирает подарок по QR. В штабе собственника загорается только тот рубль, который кассир подтвердил.</p>
        <div class="actions">
          <a class="btn" href="#enter">Зарегистрировать бизнес</a>
          <a class="btn-line" href="#cabinet?pane=passport">Паспорт ресурсов</a>
        </div>
      </div>
      <aside class="ledger">
        <div><span>1. Подарок</span><b>локомотив</b></div>
        <div><span>2. Партнёры</span><b>ИИ-подбор</b></div>
        <div><span>3. QR-купон</span><b>до кассы</b></div>
        <div><span>4. Лид-коины</span><b>клиринг</b></div>
      </aside>
    </section>
    <section class="marks">
      <article class="mark"><span>01</span><strong>Подарок вместо скидки</strong><p class="muted">Низкая себестоимость, высокая ценность — не обесценивает бренд.</p></article>
      <article class="mark"><span>02</span><strong>Умный подбор</strong><p class="muted">Неконкуренты со смежной ЦА и оценкой совместимости.</p></article>
      <article class="mark"><span>03</span><strong>Лид-коины</strong><p class="muted">Привели клиента — получили баллы. Тратьте у любого участника сети.</p></article>
      <article class="mark"><span>04</span><strong>Трекинг до кассы</strong><p class="muted">Взяли купон → пришли → выручка. Цифра появляется после гашения, не до него.</p></article>
      <article class="mark"><span>05</span><strong>Пример</strong><p class="muted">Автосервис + мойка + кофейня рядом: одна дорога клиента, три дома.</p></article>
      <article class="mark"><span>06</span><strong>152‑ФЗ</strong><p class="muted">Базы не передаём. Клиент сам оставляет контакт тому, чей подарок забирает.</p></article>
    </section>
    <section class="panel">
      <p class="small">Пример связки</p>
      <h2>${example ? `${esc(example.left)} × ${esc(example.right)}` : "Подбираем партнёров"}</h2>
      ${example ? `<p class="tag">${esc(example.chainTitle || "смежный интерес")} · ${esc(example.quality)} · совпадение ${esc(example.density)}%</p><p class="syllogism">${esc(example.syllogism)}</p>${(example.ideas || []).map((idea) => `<article class="pair"><p class="tag">${esc(idea.kindTitle)}</p><h3>${esc(idea.title)}</h3><p>${esc(idea.trade)}</p><p class="muted">${esc(idea.move)}</p></article>`).join("")}` : `<p class="muted">Готовим пример.</p>`}
    </section>
    <p class="foot">Dante Florens · Дарующий расцвет — подарки, QR до кассы, Лид-коины. <a href="#cabinet?pane=bundles">Собрать связку</a> · <a href="#city">Следующий этап</a>.</p>`);
}

function atlas() {
  const data = state.atlas;
  if (!data) return shell(`<p class="muted">Загружаю партнёров.</p>`);
  return shell(`
    <section class="hero">
      <div>
        <p class="small">Партнёры</p>
        <h1>Кто уже в сети и какие связки крепкие</h1>
        <p class="lede">Бизнесы любого формата — офлайн и онлайн — если у клиентов смежный интерес. У каждого — карточка с входной акцией и основными товарами/услугами.</p>
      </div>
      <div class="stats">
        <div><b>${data.houses.length}</b><span class="muted">бизнесов</span></div>
        <div><b>${data.threads.length}</b><span class="muted">крепких связок</span></div>
      </div>
    </section>
    <div class="offer-grid">${data.houses.map(offerCard).join("")}</div>
    <h2 style="margin-top:28px">По городам</h2>
    <table class="table">
      <thead><tr><th>Город</th><th>Бизнесы</th><th>Оплатили взнос</th><th>Связки</th></tr></thead>
      <tbody>${(data.cities || []).map((city) => `<tr><td>${esc(city.city)}</td><td>${city.houses}</td><td>${city.licenses}</td><td>${city.threads}</td></tr>`).join("")}</tbody>
    </table>
    <h2 style="margin-top:36px">Крепкие связки</h2>
    <table class="table">
      <thead><tr><th>Пара</th><th>Интерес</th><th>Город</th><th>Совпадение</th></tr></thead>
      <tbody>${data.threads.map((thread) => `<tr><td>${esc(thread.a)} × ${esc(thread.b)}</td><td>${esc(thread.chainTitle || "смежный интерес")}</td><td>${esc(thread.city)}</td><td>${esc(thread.density)}</td></tr>`).join("")}</tbody>
    </table>`);
}

function enter() {
  return shell(`
    <section class="hero"><div>
      <p class="small">Регистрация</p>
      <h1>Подключите свой бизнес</h1>
      <p class="lede">Любая сфера и формат. Укажите входную акцию для клиентов партнёров — система подберёт бизнесы со смежной аудиторией.</p>
    </div></section>
    <form class="sheet" data-act="register">
      <label>Название бизнеса<input name="name" required placeholder="Магазин колясок, детские товары, онлайн-курс"></label>
      <label>Владелец<input name="owner" required></label>
      <label>Почта<input name="email" type="email" required placeholder="you@domain.ru"></label>
      <label>Телефон<input name="phone"></label>
      <label>Город<input name="city" required list="cities" placeholder="Москва"></label>
      <label>Средний чек, ₽<input name="ticket" type="number" min="1" required placeholder="3500"></label>
      <label class="wide">Чем занимаетесь<input name="craft" required placeholder="магазин, услуга, онлайн-бизнес"></label>
      <label class="wide">Кому вы нужны<input name="about" placeholder="семьи с детьми, новосёлы, автовладельцы"></label>
      <label class="wide">Подарок-локомотив для клиента партнёра<input name="offer" required placeholder="диагностика подвески в подарок к первому визиту"></label>
      <label class="wide">Что получает клиент от вас<input name="benefit" placeholder="первый визит со скидкой"></label>
      <label class="wide">Чью аудиторию ищете<input name="seek" placeholder="родители с детьми, новосёлы"></label>
      <div class="actions wide"><button class="btn" type="submit">Зарегистрировать бизнес</button></div>
    </form>
    <form class="sheet" data-act="login" style="margin-top:28px">
      <label>Уже зарегистрированы — почта<input name="email" type="email" required></label>
      <div class="actions"><button class="btn-line" type="submit">Войти</button></div>
    </form>
    <datalist id="cities"><option value="Москва"><option value="Санкт-Петербург"><option value="Казань"></datalist>`);
}

function pay() {
  const seats = state.seats || [];
  if (!state.me) return shell(`<p>Сначала <a href="#enter">зарегистрируйте бизнес</a>.</p>`);
  if (state.me.licenseLive) return shell(`<p>Взнос оплачен${state.me.licenseUntil ? ` до ${esc(day(state.me.licenseUntil))}` : ""}. <a href="#cabinet">Открыть кабинет</a>.</p>`);
  return shell(`
    <section class="hero"><div>
      <p class="small">${esc(state.me.roleTitle)} · ${esc(state.me.city)}</p>
      <h1>Регистрационный взнос</h1>
      <p class="lede">Взнос открывает ежедневные предложения и лимит партнёров. Комиссия 8% — только со сделки, которую подтвердили оба бизнеса.</p>
    </div></section>
    <div class="seats">
      <div class="muted">Тариф задаёт максимум партнёров. Слабые связки в рассылку не попадают.</div>
      ${seats.map((seat) => `<div><p class="tag">${esc(seat.title)}</p><p class="money">${rub(seat.price)}</p><p>${esc(seat.note)}</p><button class="btn" data-act="pay" data-seat="${esc(seat.id)}">Оплатить</button></div>`).join("")}
    </div>`);
}

function cabinet() {
  const me = state.me;
  const morning = state.morning;
  if (!me) return shell(`<p>Сначала <a href="#enter">войдите</a>.</p>`);
  const pane = state.pane;
  const links = {
    hq: "Штаб",
    passport: "Паспорт",
    gifts: "Подарки",
    bundles: "Связки",
    hot: "Горящий клиент",
    funnel: "Воронка",
    wallet: "Лид-коины",
    ideas: "Предложения",
    catalog: "Товары и акции",
    morning: "Рассылка",
    thread: "Партнёры",
    base: "База клиентов",
    letters: "Письма",
    journal: "Журнал",
    treasury: "Расчёты",
    tariff: "Тариф",
  };
  return shell(`
    <div class="stage">
      <aside class="rail">
        ${Object.entries(links).map(([id, label]) => `<a class="${pane === id ? "on" : ""}" href="#cabinet?pane=${id}">${label}</a>`).join("")}
        <a href="#pay">Взнос</a>
        <a href="#home" data-act="logout">Выйти</a>
      </aside>
      <section>${paneBody(pane, me, morning)}</section>
    </div>`);
}

function paneBody(pane, me, morning) {
  if (pane === "hq") return hqPane(me);
  if (pane === "passport") return passportPane(me);
  if (pane === "gifts") return giftsPane(me);
  if (pane === "bundles") return bundlesPane(me);
  if (pane === "hot") return hotPane(me);
  if (pane === "funnel") return funnelPane(me);
  if (pane === "wallet") return walletPane(me);
  if (pane === "tariff") return tariffPane(me);
  if (pane === "catalog") return catalogPane(me);
  if (!morning) return `<p class="muted">Готовлю рассылку.</p>`;
  const plan = packet(morning);
  if (pane === "ideas") return ideasPane(me, morning);
  if (pane === "base") return basePane(me);
  if (pane === "treasury") return treasuryPane(me, plan);
  if (pane === "letters") return lettersPane(morning, plan);
  if (pane === "journal") return journalPane(me);
  if (pane === "thread") return threadPane(plan);
  return morningPane(me, morning, plan);
}

function hqPane(me) {
  const cf = state.crossflow;
  const funnel = cf?.funnel || [];
  const revenue = funnel.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
  const redeemed = funnel.reduce((sum, row) => sum + (Number(row.redeemed) || 0), 0);
  const taken = funnel.reduce((sum, row) => sum + (Number(row.taken) || 0), 0);
  const published = (cf?.bundles || []).filter((item) => item.status === "published");
  const wallet = cf?.wallet || { balance: 0, ledger: [] };
  const ready = Boolean(cf?.matchReady);
  const pulse = (wallet.ledger || []).slice(0, 5);
  const next = !ready
    ? { href: "#cabinet?pane=passport", label: "Открыть паспорт", note: "Четыре ответа о клиенте, точках контакта и подарке — и ИИ-Расцвет сможет предложить связку." }
    : published.length
      ? { href: "#cabinet?pane=hot", label: "Срочный перелив", note: "Нет окна или нужной услуги — передайте клиента коллеге. Доля пишется только с чека, который подтвердили оба." }
      : { href: "#cabinet?pane=bundles", label: "Запустить связку", note: "Паспорт готов. Выберите партнёра, сертификат и скрипт уже собираются в одном шаге." };
  const quiet = revenue
    ? `Подтверждено кассой в этом контуре. Визитов с погашением: ${redeemed}.`
    : "Пока ни один чек не подтверждён. Штаб молчит, пока кассир не погасит сертификат.";
  return `
    <section class="hq-night">
      <div>
        <p class="hq-kicker">ИИ-Расцвет · ${esc(me.name)}</p>
        <p class="hq-money">${rub(revenue)}</p>
        <p class="hq-sub">${esc(quiet)}</p>
      </div>
      <div class="hq-side">
        <div><span>Забрали подарок</span><b>${taken}</b></div>
        <div><span>Пришли и купили</span><b>${redeemed}</b></div>
        <div><span>Живых связок</span><b>${published.length}</b></div>
        <div><span>Лид-коины</span><b>${wallet.balance}</b></div>
      </div>
    </section>
    <div class="hq-grid">
      <article class="hq-move">
        <p class="small">Следующий ход</p>
        <h2>${esc(next.label)}</h2>
        <p>${esc(next.note)}</p>
        <div class="actions"><a class="btn" href="${next.href}">${esc(next.label)}</a></div>
      </article>
      <article>
        <p class="small">Кошелёк</p>
        <h2>${wallet.balance} Лид-коинов</h2>
        <p class="muted">Баллы появляются после погашения у партнёра. На рекламу их не обещают заранее.</p>
        <div class="actions"><a class="btn-line" href="#cabinet?pane=wallet">Открыть проводки</a></div>
      </article>
    </div>
    <section class="panel">
      <p class="small">Пульс</p>
      <h2>Что уже произошло</h2>
      ${pulse.length ? pulse.map((row) => `<div class="pulse-row"><span>${esc(when(row.at))}</span><b>${row.delta > 0 ? "+" : ""}${row.delta}</b><span>${esc(row.note || row.reason || "проводка")}</span></div>`).join("") : `<p class="muted">Лента пустая. Первое погашение появится здесь строкой: время, партнёр, сумма чека, Лид-коины.</p>`}
    </section>`;
}

function passportPane(me) {
  const cf = state.crossflow;
  const p = cf?.passport || {};
  return `
    <p class="small">Дарующий расцвет · паспорт</p>
    <h2>Паспорт скрытых ресурсов</h2>
    <p class="lede">Пять ответов — и ИИ открывает подбор партнёров. ИНН можно указать вручную (автозаполнение подключим позже).</p>
    <form class="sheet" data-act="passport">
      <label>ИНН<input name="inn" value="${esc(p.inn || "")}" placeholder="10 или 12 цифр"></label>
      <label>Район<input name="district" value="${esc(p.district || "")}" placeholder="север / юг / центр"></label>
      <label>Средний чек, ₽<input name="avgCheck" type="number" min="0" value="${esc(p.avgCheck ?? me.ticket ?? "")}"></label>
      <label>Пол ЦА<select name="gender"><option ${p.gender === "любой" || !p.gender ? "selected" : ""}>любой</option><option ${p.gender === "жен" ? "selected" : ""}>жен</option><option ${p.gender === "муж" ? "selected" : ""}>муж</option></select></label>
      <label>Возраст от<input name="ageFrom" type="number" min="14" max="90" value="${esc(p.ageFrom ?? 25)}"></label>
      <label>Возраст до<input name="ageTo" type="number" min="14" max="90" value="${esc(p.ageTo ?? 55)}"></label>
      <label class="wide">1. Кто идеальный клиент<textarea name="idealClient" required rows="2" placeholder="пол, возраст, средний чек, ситуация">${esc(p.idealClient || "")}</textarea></label>
      <label class="wide">2. Точки контакта<textarea name="touchpoints" required rows="2" placeholder="трафик в день, CRM/Telegram, чеки, зона ожидания">${esc(p.touchpoints || "")}</textarea></label>
      <label class="wide">3. Подарок-локомотив<textarea name="locomotive" required rows="2" placeholder="бесплатная диагностика / укладка к первому визиту">${esc(p.locomotive || me.offer || "")}</textarea></label>
      <label class="wide">4. Окна простоя<textarea name="idleWindows" rows="2" placeholder="часы/дни, когда мастера или столики свободны">${esc(p.idleWindows || "")}</textarea></label>
      <div class="actions wide"><button class="btn" type="submit">Сохранить паспорт</button></div>
    </form>
    ${cf?.matchReady ? `<p class="ok">Паспорт заполнен. Откройте <a href="#cabinet?pane=bundles">Связки</a>.</p>` : `<p class="muted">Без паспорта матчмейкер закрыт.</p>`}`;
}

function giftsPane() {
  const cf = state.crossflow;
  const gifts = cf?.gifts || [];
  return `
    <p class="small">Подарок-локомотив</p>
    <h2>Что дарите новым клиентам</h2>
    <p class="lede">Низкая себестоимость, высокая ценность. На тарифе «Старт» — один активный подарок.</p>
    <form class="sheet" data-act="gift">
      <label class="wide">Название<input name="title" required placeholder="Бесплатная диагностика подвески"></label>
      <label>Себестоимость, ₽<input name="cost" type="number" min="0" value="300"></label>
      <label>Ценность для клиента, ₽<input name="clientValue" type="number" min="100" value="2000"></label>
      <label>Срок, дней<input name="days" type="number" min="3" max="90" value="14"></label>
      <label class="wide">Зачем это клиенту<input name="valueNote" placeholder="Снимает страх первого визита"></label>
      <div class="actions wide"><button class="btn" type="submit">Добавить подарок</button></div>
    </form>
    <div class="offer-grid">${gifts.map((g) => `<article class="offer-card"><p class="tag">${g.active === false ? "выкл" : "активен"} · ${g.days || 14} дн</p><h3>${esc(g.title)}</h3><p class="money">${rub(g.clientValue)}</p><p class="muted">себестоимость ${rub(g.cost)} · ${esc(g.valueNote || "")}</p></article>`).join("") || `<p class="muted">Подарков пока нет.</p>`}</div>`;
}

function bundlesPane() {
  const cf = state.crossflow;
  const partners = state.match || [];
  const bundles = cf?.bundles || [];
  const draft = bundles.find((item) => item.status === "draft");
  const mode = state.matchMode || "adjacent";
  const coop = mode === "coopetition";
  const tpl = state.coopTemplate || "overflow";
  return `
    <p class="small">Связки · ИИ-подбор</p>
    <h2>Партнёры и коллаборации</h2>
    <p class="lede">Два режима: смежные ниши (без конкурентов) или коллеги по нише — отказы, долечивание, гео.</p>
    <div class="actions">
      <button class="btn${mode === "adjacent" ? "" : "-line"}" type="button" data-act="set-match-mode" data-mode="adjacent">Смежные ниши</button>
      <button class="btn${coop ? "" : "-line"}" type="button" data-act="set-match-mode" data-mode="coopetition">Коллеги по нише</button>
      <button class="btn-line" type="button" data-act="load-match">Обновить подбор</button>
      ${cf?.cashierPath ? `<a class="btn-line" href="${esc(cf.cashierPath)}">Экран кассира</a>` : ""}
    </div>
    ${coop ? `<div class="actions" style="margin-top:8px">
      <button class="btn${tpl === "overflow" ? "" : "-line"}" type="button" data-act="set-coop-tpl" data-tpl="overflow">Отказ / нет окна</button>
      <button class="btn${tpl === "specialty" ? "" : "-line"}" type="button" data-act="set-coop-tpl" data-tpl="specialty">Долечивание</button>
      <button class="btn${tpl === "geo" ? "" : "-line"}" type="button" data-act="set-coop-tpl" data-tpl="geo">Гео</button>
    </div>` : ""}
    ${!cf?.matchReady ? `<p class="alert">Сначала заполните <a href="#cabinet?pane=passport">паспорт</a>.</p>` : ""}
    <div class="offer-grid">${partners.map((p) => `<article class="offer-card">
      <p class="tag">${esc(p.craft)} · ${esc(p.city)} · ${esc(p.density)}%${p.district ? ` · ${esc(p.district)}` : ""}</p>
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.why)}</p>
      ${p.openSlots ? `<p class="tag">слотов перегрузки: ${p.openSlots}</p>` : ""}
      ${p.gift ? `<p class="tag">их подарок: ${esc(p.gift.title)}</p>` : ""}
      <button class="btn" type="button" data-act="gen-bundle" data-id="${esc(p.businessId)}">Сделать коллаборацию</button>
    </article>`).join("") || (cf?.matchReady ? `<p class="muted">Нажмите «Обновить подбор».</p>` : "")}
    </div>
    ${draft ? `<section class="panel" style="margin-top:28px">
      <p class="small">Черновик · ${esc(draft.mode || "adjacent")} · ${esc(draft.template || "gift")}</p>
      <h2>${esc(draft.leftName)} × ${esc(draft.rightName)}</h2>
      <p class="tag">${esc(draft.chainTitle || "")} · ${esc(draft.density)}%</p>
      ${(draft.offers || []).map((o) => `<article class="pair"><p class="tag">${esc(o.id)}</p><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p>
        <button class="btn-line" type="button" data-act="pick-offer" data-bundle="${esc(draft.id)}" data-offer="${esc(o.id)}">${draft.selectedOfferId === o.id ? "выбран" : "выбрать"}</button>
      </article>`).join("")}
      <h3>Скрипт кассира</h3><p>${esc(draft.script)}</p>
      <h3>Рассылка</h3><pre class="packet-pre">${esc(draft.mailing)}</pre>
      ${draft.mode === "coopetition" ? `<form class="sheet" data-act="publish-coop" data-id="${esc(draft.id)}">
        <p class="small wide">Протокол доверия</p>
        <label class="wide"><input type="checkbox" name="pactAccepted" value="1" required> Джентльменский пакт: коллега не продаёт базовые услуги отправителя этому пациенту</label>
        <label class="wide">Защищённые услуги (по строке)<textarea name="protectedServicesText" rows="3" required>${esc((draft.trust?.protectedServices || []).join("\n"))}</textarea></label>
        <label class="wide">Якорь возврата<textarea name="returnAnchor" rows="2" required>${esc(draft.trust?.returnAnchor || "")}</textarea></label>
        ${draft.billing?.kind === "revshare" ? `<label>RevShare %<input name="revsharePct" type="number" min="5" max="40" value="${esc(draft.billing.revsharePct || 15)}"></label>` : ""}
        <div class="actions wide"><button class="btn" type="submit">Опубликовать QR</button></div>
      </form>` : `<div class="actions"><button class="btn" type="button" data-act="publish-bundle" data-id="${esc(draft.id)}">Опубликовать QR</button></div>`}
    </section>` : ""}
    <h2 style="margin-top:36px">Опубликованные</h2>
    <table class="table">
      <thead><tr><th>Связка</th><th>Режим</th><th>Код</th><th>Ссылка</th><th></th></tr></thead>
      <tbody>${bundles.filter((b) => b.status === "published").map((b) => `<tr>
        <td>${esc(b.leftName)} × ${esc(b.rightName)}${b.hot ? " · горящий" : ""}</td>
        <td>${esc(b.mode || "adjacent")}/${esc(b.template || "gift")}</td>
        <td><code>${esc(b.code)}</code></td>
        <td><a href="${esc(b.shortPath || `#claim?code=${b.code}`)}">${esc(b.shortPath || "")}</a></td>
        <td>${b.cashierToken ? `<a href="#cashier/${esc(b.cashierToken)}">кассир</a>` : ""}</td>
      </tr>`).join("") || `<tr><td colspan="5">Пока нет опубликованных связок.</td></tr>`}</tbody>
    </table>`;
}

function hotPane() {
  const cf = state.crossflow;
  const slots = cf?.slots || [];
  const handoffs = cf?.handoffs || [];
  return `
    <p class="small">Слот перегрузки · монетизация отказов</p>
    <h2>Горящий клиент</h2>
    <p class="lede">Два поля — услуга и район. Система находит коллегу со свободным окном и даёт ссылку. Клиент забирает талон сам. Телефон в чужой бизнес не уходит.</p>
    <form class="sheet" data-act="create-slot">
      <p class="small wide">Открыть своё окно (принять чужой отказ)</p>
      <label class="wide">Услуга / кресло<input name="service" required placeholder="УЗИ сегодня / терапия / хирургия"></label>
      <label>Район<input name="district" placeholder="юг"></label>
      <label>Часов свободно<input name="hours" type="number" min="1" max="48" value="8"></label>
      <div class="actions"><button class="btn-line" type="submit">Открыть слот</button></div>
    </form>
    <form class="sheet" data-act="handoff" style="margin-top:20px">
      <p class="small wide">Передать горящего клиента</p>
      <label class="wide">Услуга<input name="service" required placeholder="острая зубная боль / УЗИ сегодня"></label>
      <label class="wide">Район или срочность<input name="district" required placeholder="сегодня, юг города"></label>
      <div class="actions wide"><button class="btn" type="submit">Передать за секунды</button></div>
    </form>
    <h3>Ваши слоты</h3>
    <table class="table">
      <thead><tr><th>Услуга</th><th>Район</th><th>До</th><th>Статус</th></tr></thead>
      <tbody>${slots.map((s) => `<tr><td>${esc(s.service)}</td><td>${esc(s.district)}</td><td>${esc(when(s.freeUntil))}</td><td>${esc(s.status)}</td></tr>`).join("") || `<tr><td colspan="4">Нет открытых слотов.</td></tr>`}</tbody>
    </table>
    <h3>Передачи</h3>
    <table class="table">
      <thead><tr><th>Когда</th><th>Куда</th><th>Услуга</th><th>Ссылка</th></tr></thead>
      <tbody>${handoffs.map((h) => `<tr>
        <td>${esc(when(h.at))}</td>
        <td>${esc(h.fromName)} → ${esc(h.toName)}</td>
        <td>${esc(h.service)}</td>
        <td>${h.claimPath ? `<a href="${esc(h.claimPath)}">${esc(h.code)}</a>` : esc(h.status)}</td>
      </tr>`).join("") || `<tr><td colspan="4">Передач ещё нет.</td></tr>`}</tbody>
    </table>`;
}

function funnelPane() {
  const rows = state.crossflow?.funnel || [];
  return `
    <p class="small">Аналитика собственника</p>
    <h2>Воронка по связкам</h2>
    <p class="lede">Четыре цифры: взяли купон → пришли и купили → выручка → затраты на рекламу.</p>
    <table class="table">
      <thead><tr><th>Связка</th><th>Взяли</th><th>Пришли</th><th>Выручка</th><th>Реклама</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${esc(r.title)}<div class="muted">${esc(r.chainTitle || "")}</div></td>
        <td>${r.taken}</td>
        <td>${r.redeemed}</td>
        <td>${rub(r.revenue)}</td>
        <td>${rub(r.adSpend)}</td>
      </tr>`).join("") || `<tr><td colspan="5">Опубликуйте связку и проведите первых клиентов.</td></tr>`}</tbody>
    </table>`;
}

function walletPane() {
  const w = state.crossflow?.wallet || { balance: 0, ledger: [], coinRub: 100 };
  return `
    <p class="small">Лид-коины</p>
    <h2>Баланс: ${w.balance}</h2>
    <p class="lede">1 Лид-коин = ${rub(w.coinRub)} рекламной ценности. Начисляются за погашенный у партнёра купон.</p>
    <form class="sheet" data-act="spend-coins">
      <label>Списать коинов<input name="amount" type="number" min="1" required></label>
      <label class="wide">ID партнёра для размещения<input name="partnerId" required placeholder="member-… или seat-…"></label>
      <div class="actions"><button class="btn" type="submit">Потратить</button></div>
    </form>
    <table class="table">
      <thead><tr><th>Когда</th><th>Δ</th><th>Заметка</th></tr></thead>
      <tbody>${(w.ledger || []).map((row) => `<tr><td>${esc(when(row.at))}</td><td>${row.delta > 0 ? "+" : ""}${row.delta}</td><td>${esc(row.note || row.reason)}</td></tr>`).join("") || `<tr><td colspan="3">Проводок пока нет.</td></tr>`}</tbody>
    </table>`;
}

function tariffPane() {
  const cf = state.crossflow;
  const current = cf?.tariff?.id || "start";
  const tariffs = cf?.tariffs || [];
  return `
    <p class="small">Тарифы</p>
    <h2>Старт · Pro · Сеть</h2>
    <p class="lede">Сейчас оплата симулируется в контуре (как регистрационный взнос). ЮKassa — на следующем этапе.</p>
    <div class="seats">${tariffs.map((t) => `<div>
      <p class="tag">${esc(t.title)}${current === t.id ? " · ваш" : ""}</p>
      <p class="money">${t.priceMonth ? `${rub(t.priceMonth)}/мес` : "0 ₽"}</p>
      <p>${esc(t.note)}</p>
      ${current === t.id ? `<p class="ok">Активен</p>` : `<button class="btn" type="button" data-act="set-tariff" data-id="${esc(t.id)}">Выбрать</button>`}
    </div>`).join("")}</div>`;
}

function claimView() {
  const data = state.claim;
  const mine = state.myCoupon;
  if (!state.claimCode) return shell(`<p class="muted">Нет кода подарка в ссылке.</p>`);
  if (!data && !state.error) return shell(`<p class="muted">Открываю подарок…</p>`);
  if (!data) return shell(`<p class="alert">${esc(state.error || "Подарок не найден")}</p>`);
  const left = Math.max(0, new Date(mine?.expiresAt || Date.now() + data.days * 86400000) - Date.now());
  const daysLeft = Math.ceil(left / 86400000);
  return shell(`
    <section class="hero"><div>
      <p class="small">${esc(data.brand || "Dante Florens · Дарующий расцвет")}</p>
      <h1>${esc(data.giftTitle)}</h1>
      <p class="lede">Подарок от «${esc(data.giftFrom)}» в «${esc(data.giftAt)}». Ценность ~${rub(data.value)}. Действует ${data.days} дней.</p>
      <p class="muted">${esc(data.offerText || "")}</p>
      ${data.mode === "coopetition" ? `<p class="tag">коллега по нише${data.hot ? " · горящий талон" : ""}</p>` : ""}
      ${data.returnAnchor ? `<p class="ok"><strong>Якорь возврата:</strong> ${esc(data.returnAnchor)}</p>` : ""}
    </div>
    <aside class="ledger">
      <div><span>Срок</span><b>${mine ? `${daysLeft} дн` : `${data.days} дн`}</b></div>
      <div><span>Приложение</span><b>не нужно</b></div>
    </aside></section>
    ${mine ? `<section class="panel"><p class="small">Ваш купон</p><h2><code>${esc(mine.code)}</code></h2><p>Покажите код на кассе «${esc(mine.at)}». Статус: ${esc(mine.status)}.</p>${mine.returnAnchor ? `<p class="muted">${esc(mine.returnAnchor)}</p>` : ""}<p class="muted">До ${esc(when(mine.expiresAt))}</p></section>` : `
    <form class="sheet" data-act="claim-coupon">
      <label>Имя<input name="name" placeholder="Как к вам обращаться"></label>
      <label class="wide">Телефон или Telegram<input name="contact" required placeholder="+7… или @username"></label>
      <p class="muted wide">Контакт уходит только бизнесу, чей подарок вы забираете. Чужие базы не передаём.</p>
      <div class="actions wide"><button class="btn" type="submit">Забрать подарок</button></div>
    </form>`}`);
}

function cashierView() {
  const data = state.cashier;
  if (!state.cashierToken) return shell(`<p class="muted">Нет токена кассира.</p>`);
  if (!data && !state.error) return shell(`<p class="muted">Открываю сканер…</p>`);
  if (!data) return shell(`<p class="alert">${esc(state.error || "Ссылка недействительна")}</p>`);
  return shell(`
    <section class="hero"><div>
      <p class="small">Кассир · ${esc(data.brand || "")}</p>
      <h1>${esc(data.businessName)}</h1>
      <p class="lede">Введите код клиента или отсканируйте QR → сумма чека → погасить. Пароль не нужен.</p>
    </div></section>
    <form class="sheet" data-act="redeem">
      <label class="wide">Код купона<input name="code" required placeholder="XXXXXXXX" autocomplete="off"></label>
      <label>Сумма чека, ₽<input name="amount" type="number" min="0" required value="0"></label>
      <div class="actions"><button class="btn" type="submit">Погасить</button></div>
    </form>`);
}

function offerCard(card) {
  const catalog = card.catalog || {};
  const hook = catalog.hook;
  const chips = catalog.chips || [];
  const quarter = card.quarterTitle ? `${card.quarterTitle}${card.placeTitle ? ` · ${card.placeTitle}` : ""}` : "";
  return `<article class="offer-card">
    <p class="tag">${esc(card.roleTitle || card.craft || "")} · ${esc(card.city || "")}${quarter ? ` · ${esc(quarter)}` : ""}</p>
    <h3>${esc(card.name)}</h3>
    ${hook ? `<div class="price-red"><span class="tag">входная акция</span><div class="pair-top"><strong>${esc(hook.title)}</strong><span>${hook.price ? rub(hook.price) : ""}</span></div>${hook.note ? `<p class="muted">${esc(hook.note)}</p>` : ""}</div>` : ""}
    ${chips.map((chip) => `<div class="price-blue"><span class="tag">товар / услуга</span><div class="pair-top"><strong>${esc(chip.title)}</strong><span>${chip.price ? rub(chip.price) : ""}</span></div>${chip.note ? `<p class="muted">${esc(chip.note)}</p>` : ""}</div>`).join("")}
    ${(card.complement || []).length ? `<p class="tag">${card.complement.map((item) => esc(item)).join(" · ")}</p>` : ""}
    <p class="muted">${esc(card.whole || card.benefit || "")}</p>
  </article>`;
}

function catalogPane(me) {
  const catalog = me.catalog || { hook: null, chips: [], seek: "" };
  const hook = catalog.hook || { title: me.offer || "", price: "", note: "" };
  const chip1 = catalog.chips?.[0] || { title: me.craft || "", price: me.ticket || "", note: "" };
  const chip2 = catalog.chips?.[1] || { title: "", price: "", note: "" };
  return `
    <p class="small">${esc(me.roleTitle)} · ${esc(me.city)}</p>
    <h2>Товары и акции</h2>
    <p class="lede">Одна входная акция для клиентов партнёров и до двух основных товаров/услуг. По ним платформа собирает обмен.</p>
    <form class="sheet" data-act="catalog">
      <label class="wide">Подарок-локомотив — название<input name="hookTitle" required value="${esc(hook.title || "")}" placeholder="диагностика подвески в подарок"></label>
      <label>Цена, ₽<input name="hookPrice" type="number" min="0" value="${esc(hook.price ?? "")}"></label>
      <label>Заметка<input name="hookNote" value="${esc(hook.note || "")}" placeholder="для клиента партнёра"></label>
      <label class="wide">Товар / услуга 1<input name="chip1Title" value="${esc(chip1.title || "")}" placeholder="основной продукт"></label>
      <label>Цена, ₽<input name="chip1Price" type="number" min="0" value="${esc(chip1.price ?? "")}"></label>
      <label>Заметка<input name="chip1Note" value="${esc(chip1.note || "")}"></label>
      <label class="wide">Товар / услуга 2<input name="chip2Title" value="${esc(chip2.title || "")}" placeholder="по желанию"></label>
      <label>Цена, ₽<input name="chip2Price" type="number" min="0" value="${esc(chip2.price ?? "")}"></label>
      <label>Заметка<input name="chip2Note" value="${esc(chip2.note || "")}"></label>
      <label class="wide">Чью аудиторию ищете<input name="seek" value="${esc(catalog.seek || me.seek || "")}" placeholder="семьи с детьми, новосёлы"></label>
      <div class="actions wide">
        <button class="btn" type="submit">Сохранить</button>
        <button class="btn-line" type="button" data-act="pdf-catalog">Скачать каталог PDF</button>
      </div>
    </form>
    <h3>Как вас видят партнёры</h3>
    ${offerCard({ name: me.name, city: me.city, roleTitle: me.roleTitle, craft: me.craft, benefit: me.benefit, catalog, whole: "Два бизнеса делятся клиентами: каждый получает новый поток, клиент — выгоду от обоих." })}`;
}

function market() {
  const data = state.market;
  if (!data) return shell(`<p class="muted">Загружаю бизнесы.</p>`);
  return shell(`
    <section class="hero"><div>
      <p class="small">Бизнесы в сети</p>
      <h1>Акции и товары участников</h1>
      <p class="lede">${esc(data.motto || "Находите партнёров со смежной аудиторией и обменивайтесь клиентами.")}</p>
      ${data.me ? `<p class="muted">Вы: ${esc(data.me.name)}. Список отсортирован под ваши товары и акции.</p>` : `<p class="muted"><a href="#enter">Войдите</a>, чтобы видеть взаимную выгоду с каждым.</p>`}
      <div class="actions"><a class="btn-line" href="#cabinet?pane=catalog">Заполнить свои товары и акции</a></div>
    </div></section>
    <div class="offer-grid">${(data.cards || []).map(offerCard).join("") || `<p class="muted">Пока нет участников.</p>`}</div>`);
}

function city() {
  const data = state.city;
  if (!data) return shell(`<p class="muted">Загружаю следующий этап.</p>`);
  return shell(`
    <section class="hero"><div>
      <p class="small">Следующий этап</p>
      <h1>Город будущего</h1>
      <p class="lede">${esc(data.vision)}</p>
      <p class="muted">${esc(data.motto)}</p>
      <div class="actions"><a class="btn" href="#enter">К обмену клиентами</a></div>
    </div></section>
    <p class="muted">Ниже — черновик идей. Сейчас продукт — ежедневный обмен базами между бизнесами.</p>
    <div class="quarter-grid">${(data.quarters || []).slice(0, 4).map((quarter) => `<article class="quarter-card">
      <p class="tag">${esc(quarter.placeTitle)}</p>
      <h3>${esc(quarter.title)}</h3>
      <p class="muted">${esc(quarter.purpose)}</p>
    </article>`).join("")}</div>`);
}

function packet(morning) {
  if (state.packet === "last" && morning.last) return morning.last.plan;
  return morning.preview;
}

function morningPane(me, morning, plan) {
  const checks = morning.checks;
  return `
    <p class="small">${esc(me.name)} · ${esc(me.roleTitle)}</p>
    <h2>Рассылка ${morning.ready ? "запланирована" : "ждёт условия"}</h2>
    <p class="lede" data-countdown>${esc(countdown(morning.waveAt))}</p>
    <p>Выпуск: <b>${esc(when(morning.waveAt))}</b>. Проведённых рассылок: ${morning.wavesDone}. Уйдут только отмеченные предложения и выборка «${esc(audienceLabel(morning))}».</p>
    <div class="ledger">
      <div><span>Регистрация</span><b class="${checks.registered ? "ok" : ""}">${checks.registered ? "есть" : "нет"}</b></div>
      <div><span>Взнос</span><b class="${checks.paid ? "ok" : ""}">${checks.paid ? "оплачен" : "ещё нет"}</b></div>
      <div><span>База</span><b class="${checks.base ? "ok" : ""}">${checks.base ? `${morning.clientCount} клиентов` : "пуста"}</b></div>
    </div>
    ${!checks.paid ? `<p><a class="btn" href="#pay">Оплатить взнос</a></p>` : ""}
    ${!checks.base ? `<p><a class="btn-line" href="#cabinet?pane=base">Загрузить базу</a></p>` : ""}
    <div class="split">
      <div><p class="small">Ожидание вам</p><p class="money">${rub(plan.expected.forMember)}</p></div>
      <div><p class="small">Ожидание партнёрам</p><p class="money">${rub(plan.expected.forPartners)}</p></div>
    </div>
    <p class="muted">${esc(plan.expected.formula)}. Доля ответа — от 3% до 11% по силе связки. В расчёты попадает только подтверждённая сделка.</p>
    <div class="actions">
      <button class="btn-line" data-act="packet" data-which="next">Смотреть следующую рассылку</button>
      ${morning.last ? `<button class="btn-line" data-act="packet" data-which="last">Смотреть прошлую рассылку</button>` : ""}
      <button class="btn-line" data-act="export" data-which="${state.packet === "last" ? "last" : "next"}">Выгрузить</button>
    </div>
    ${plan.links.slice(0, 3).map(linkCard).join("") || `<p>Партнёры появятся, когда система прочитает, чем вы занимаетесь.</p>`}`;
}

function audienceLabel(morning) {
  const chosen = state.picks?.audience || ["all"];
  const titles = (morning.slices || []).filter((slice) => chosen.includes(slice.id)).map((slice) => slice.title);
  return titles.join(", ") || "вся база";
}

function ideasPane(me, morning) {
  const ideas = morning.ideas || [];
  const picks = state.picks || { ideas: ideas.map((idea) => idea.id), audience: ["all"] };
  const selected = new Set(picks.ideas);
  const audience = new Set(picks.audience || ["all"]);
  const partners = [];
  const gaps = [];
  const seenPartners = new Map();
  const seenGaps = new Map();
  for (const idea of ideas) {
    const keyed = Boolean(idea.partnerId);
    const key = keyed ? idea.partnerId : (idea.role ? `gap:${idea.role}` : idea.id);
    const map = keyed ? seenPartners : seenGaps;
    const bucket = keyed ? partners : gaps;
    if (!map.has(key)) {
      const card = {
        with: idea.with,
        quality: idea.quality,
        density: idea.density,
        syllogism: idea.syllogism,
        chainTitle: idea.chainTitle,
        items: [],
      };
      map.set(key, card);
      bucket.push(card);
    }
    map.get(key).items.push(idea);
  }
  return `
    <p class="small">${esc(me.roleTitle)} · ${esc(me.city)}</p>
    <h2>Ежедневные предложения</h2>
    <p class="lede">Идеи рассылок к базам партнёров со смежными интересами клиентов. В рассылку попадает только отмеченное и выбранный кусок вашей базы.</p>
    <h3>Кому писать из вашей базы</h3>
    <p class="muted">Отметьте предложения и сегмент базы — только они уйдут в следующую рассылку.</p>
    <div class="chips">${(morning.slices || []).map((slice) => `<button type="button" class="chip ${audience.has(slice.id) ? "on" : ""}" data-act="slice" data-id="${esc(slice.id)}">${esc(slice.title)} · ${slice.count}</button>`).join("")}</div>
    ${partners.map((card) => ideaCard(card, selected)).join("") || `<p>Опишите, кому вы нужны — тогда появятся партнёры.</p>`}
    ${gaps.length ? `<h3>Каких партнёров не хватает</h3>${gaps.map((card) => ideaCard(card, selected)).join("")}` : ""}`;
}

function ideaCard(card, selected) {
  const mark = card.density ? `${card.quality} · ${card.density}` : (card.chainTitle || card.quality || "");
  return `<article class="pair">
    <div class="pair-top"><h3>${esc(card.with)}</h3><span class="tag">${esc(mark)}</span></div>
    ${card.syllogism ? `<p class="syllogism">${esc(card.syllogism)}</p>` : ""}
    ${card.items.map((idea) => `<div class="solution">
      <div class="pair-top">
        <p class="tag">${esc(idea.kindTitle)}</p>
        <label class="pick"><input type="checkbox" data-act="idea" data-id="${esc(idea.id)}" ${selected.has(idea.id) ? "checked" : ""}> В рассылку</label>
      </div>
      <h3>${esc(idea.title)}</h3>
      <p>${esc(idea.trade)}</p>
      <p>${esc(idea.flow)}</p>
      ${(idea.reasons || []).length ? `<p class="tag">${idea.reasons.map((reason) => esc(reason)).join(" · ")}</p>` : ""}
      <p class="muted">${esc(idea.move)} ${esc(idea.fit || "")}</p>
    </div>`).join("")}
  </article>`;
}

function threadPane(plan) {
  return `
    <h2>Партнёры</h2>
    <p class="muted">Тариф ограничивает число партнёров. Слабые связки в рассылку не попадают.</p>
    ${plan.links.map(linkCard).join("") || `<p>Крепких партнёров пока нет.</p>`}
    <h3>Кого можно пригласить</h3>
    ${(plan.invitations || []).map((item) => `<article class="pair"><p class="tag">${esc(item.chainTitle)} · ${esc(item.city)}</p><h3>${esc(item.roleTitle)}</h3><p class="quote">${esc(item.draft)}</p></article>`).join("") || `<p class="muted">Подходящие роли рядом уже заняты.</p>`}`;
}

function linkCard(link) {
  return `<article class="pair">
    <div class="pair-top"><h3>${esc(link.business.name)}</h3><span class="tag">${esc(link.quality)} · ${esc(link.density)}</span></div>
    <p class="muted">${esc(link.business.roleTitle)} · ${esc(link.business.city)} · чек ${rub(link.business.ticket)}</p>
    <p class="syllogism">${esc(link.syllogism)}</p>
    <div class="split">
      <div><p class="small">Писем им</p><b>${link.outbound}</b><div class="muted">ожидание партнёру ${rub(link.expectedForPartner)}</div></div>
      <div><p class="small">Писем вам</p><b>${link.inbound}</b><div class="muted">ожидание вам ${rub(link.expectedForMember)}</div></div>
    </div>
    <p>${esc(link.balance)}</p>
  </article>`;
}

function lettersPane(morning, plan) {
  const title = state.packet === "last" && morning.last ? "Прошлая рассылка" : "Следующая рассылка";
  return `
    <h2>${title}</h2>
    <div class="actions">
      <button class="btn-line" data-act="packet" data-which="next">Следующая</button>
      ${morning.last ? `<button class="btn-line" data-act="packet" data-which="last">Прошлая</button>` : ""}
      <button class="btn-line" data-act="export" data-which="${state.packet === "last" ? "last" : "next"}">Выгрузить</button>
    </div>
    <h3>Сообщения партнёрам</h3>
    ${plan.links.map((link) => `<article class="letter"><b>${esc(link.business.name)}</b><p>${esc(link.invitation)}</p></article>`).join("")}
    <h3>Письма вашим клиентам</h3>
    ${plan.letters.map((letter) => `<article class="letter"><b>${esc(letter.clientName)}</b> → ${esc(letter.partnerName)}<div class="muted">${esc(letter.contact)}</div><p>${esc(letter.body)}</p></article>`).join("") || `<p class="muted">Письма появятся после загрузки базы.</p>`}
    <h3>Ответный поток от партнёров</h3>
    ${plan.links.flatMap((link) => (link.returnLetters || []).slice(0, 2).map((letter) => `<article class="letter"><span class="tag">${esc(letter.status)}</span><p>${esc(letter.body)}</p></article>`)).join("")}`;
}

function journalPane(me) {
  const rows = me.journal || [];
  return `
    <h2>Журнал отправки</h2>
    <p class="muted">Рассылка попадает в журнал. Адрес снимается ответом «стоп» или формой в базе. Пока почта не подключена, письма хранятся здесь.</p>
    <table class="table">
      <thead><tr><th>Когда</th><th>Кому</th><th>Тема</th><th>Статус</th></tr></thead>
      <tbody>${rows.slice().reverse().map((row) => `<tr><td>${esc(when(row.at))}</td><td>${esc(row.name)}<div class="muted">${esc(row.contact)}</div></td><td>${esc(row.subject)}</td><td>${esc(row.status === "stopped" ? "стоп" : "в журнале")}</td></tr>`).join("") || `<tr><td colspan="4">Журнал пуст до первой рассылки.</td></tr>`}</tbody>
    </table>`;
}

function guest() {
  const offers = state.offers || [];
  return shell(`
    <section class="hero"><div>
      <p class="small">Для клиентов</p>
      <h1>Скидки и акции от связанных бизнесов</h1>
      <p class="lede">Укажите запрос — покажем предложения партнёров со смежным интересом. Адрес можно снять в любой момент.</p>
    </div></section>
    <form class="sheet" data-act="guest">
      <label>Имя<input name="name" required></label>
      <label>Почта или телефон<input name="contact" required></label>
      <label>Город<input name="city" required value="Москва"></label>
      <label>Возраст<select name="age" required><option value="family">Семьи с детьми</option><option value="young">18–30</option><option value="mid">31–45</option><option value="mature">46–60</option><option value="senior">60+</option></select></label>
      <label>Комфортная цена<select name="price" required><option value="modest">до 5 тыс.</option><option value="middle">5–30 тыс.</option><option value="high">30–150 тыс.</option><option value="estate">выше 150 тыс.</option></select></label>
      <label class="wide">Что ищете<input name="request" required placeholder="коляска, детский массаж, детские товары"></label>
      <label class="check wide"><input type="checkbox" name="consent" required><span>Согласен получать предложения связанных бизнесов и могу написать «стоп».</span></label>
      <div class="actions wide"><button class="btn" type="submit">Показать предложения</button></div>
    </form>
    <div class="offer-grid">${offers.map((offer) => `<div>${offerCard({
      name: offer.name,
      city: offer.city,
      roleTitle: offer.craft,
      catalog: offer.catalog,
      benefit: `Бонус: ${offer.bonus}`,
      whole: offer.whole,
      complement: offer.reasons,
    })}<button class="btn" data-act="claim" data-id="${esc(offer.businessId)}">Забрать предложение</button></div>`).join("")}</div>
    ${state.notice ? `<p class="ok">${esc(state.notice)}</p>` : ""}
    <form class="sheet" data-act="stop" style="margin-top:28px">
      <label>Снять адрес<input name="contact" placeholder="почта или телефон" required></label>
      <div class="actions"><button class="btn-line" type="submit">Стоп</button></div>
    </form>`);
}

function basePane(me) {
  return `
    <h2>База клиентов</h2>
    <p class="muted">Сейчас ${me.clientCount} клиентов. Формат: имя, контакт, заметка, траты, город. Письма только тем, кого вы загрузили; в каждом есть «стоп».</p>
    <form data-act="base">
      <label class="check"><input type="checkbox" name="attest" required><span>Это мои клиенты, и у меня есть основание написать им.</span></label>
      <label class="wide">Строки<textarea name="csv" id="base" placeholder="имя,контакт,заметка,траты,город"></textarea></label>
      <div class="actions">
        <button class="btn" type="submit">Загрузить</button>
        <button class="btn-line" type="button" data-act="sample">Пример базы</button>
        <button class="btn-line" type="button" data-act="file">Файл CSV</button>
      </div>
      <input id="file" type="file" accept=".csv,text/csv,text/plain" hidden>
    </form>
    <table class="table">
      <thead><tr><th>Клиент</th><th>Заметка</th><th>Траты</th></tr></thead>
      <tbody>${(me.clients || []).slice().reverse().map((client) => `<tr><td>${esc(client.name)}<div class="muted">${esc(client.contact)}</div></td><td>${esc(client.note)}</td><td>${rub(client.spend)}</td></tr>`).join("")}</tbody>
    </table>
    <form data-act="suppress" class="sheet" style="margin-top:18px">
      <label>Убрать адрес из следующих рассылок<input name="contact" placeholder="почта или телефон"></label>
      <div class="actions"><button class="btn-line" type="submit">Убрать</button></div>
    </form>`;
}

function treasuryPane(me, plan) {
  const books = me.books || { paid: 0, nets: 0, fees: 0, deals: 0 };
  const options = (plan.links || []).filter((link) => link.business.kind === "member").map((link) => `<option value="${esc(link.business.id)}">${esc(link.business.name)}</option>`).join("");
  return `
    <h2>Расчёты · ${esc(me.name)}</h2>
    <div class="split">
      <div><p class="small">Вам после комиссии, 92%</p><p class="money">${rub(books.nets)}</p></div>
      <div><p class="small">Комиссия платформы, 8%</p><p class="money">${rub(books.fees)}</p></div>
    </div>
    <p>Взнос${me.licenseUntil ? ` до ${esc(day(me.licenseUntil))}` : " активен"}. Оплачено ${rub(books.paid)}. Подтверждённых сделок: ${books.deals}. Ждут второго бизнеса: ${books.pending || 0}.</p>
    <p class="muted">Ожидание до двойного подтверждения: ${rub(plan.expected.forMember)}. Клиент получает акцию от обоих бизнесов.</p>
    ${(me.pendingDeals || []).map((deal) => `<article class="pair"><p class="tag">${deal.status === "confirmed" ? "подтверждено" : "ждёт"}</p><h3>${esc(deal.clientName || "Клиент")} · ${rub(deal.amount)}</h3><p>${esc(deal.sellerName || "")} ← ${esc(deal.partnerName || "")}</p><p class="muted">${esc(deal.bonus || "")}</p><div class="actions"><button class="btn-line" type="button" data-act="pdf-deal" data-id="${esc(deal.id)}">Скачать PDF</button></div>${deal.partnerId === me.id && !deal.partnerConfirmed ? `<button class="btn" data-act="confirm-deal" data-id="${esc(deal.id)}">Подтвердить, что клиент ваш</button>` : ""}${deal.beneficiaryId === me.id && !deal.sellerConfirmed ? `<form data-act="confirm-deal" class="sheet"><input type="hidden" name="dealId" value="${esc(deal.id)}"><label>Сумма визита, ₽<input name="amount" type="number" min="1" required></label><div class="actions"><button class="btn" type="submit">Клиент пришёл</button></div></form>` : ""}</article>`).join("")}
    <form class="sheet" data-act="deal">
      <label>Партнёр, от которого пришёл клиент<select name="partnerId">${options}</select></label>
      <label>Имя клиента в базе партнёра<input name="clientName" required></label>
      <label>Контакт клиента в базе партнёра<input name="clientContact" placeholder="почта или телефон — точнее имени"></label>
      <label>Сумма сделки, ₽<input name="amount" type="number" min="1" required></label>
      <p class="muted">Сделка только на клиента из базы партнёра. После двойного подтверждения сумму не изменить.</p>
      <div class="actions"><button class="btn" type="submit">Отправить партнёру</button></div>
    </form>`;
}

function house() {
  const data = state.house;
  if (!data) {
    return shell(`
      <section class="hero"><div>
        <p class="small">Финансы платформы</p>
        <h1>Вход владельца</h1>
        <p class="lede">Здесь регистрационные взносы и 8% комиссии с подтверждённых сделок. Ключ — в окне запуска и в файле data/house-key.txt.</p>
        <form data-act="house-key" class="sheet">
          <label>Ключ<input name="key" required placeholder="DF-..."></label>
          <div class="actions"><button class="btn" type="submit">Открыть</button></div>
        </form>
      </div></section>`);
  }
  const t = data.treasury;
  const room = data.room || { licenses: 0, journal: 0, stops: 0, gmv: 0, pending: 0 };
  return shell(`
    <section class="hero">
      <div>
        <p class="small">Финансы платформы</p>
        <h1>${rub(t.total)}</h1>
        <p class="lede">Взносы: ${rub(t.seats)}. Комиссия со сделок: ${rub(t.fees)}. Бизнесов с взносом: ${t.members}.</p>
      </div>
    </section>
    <h2>Сводка</h2>
    <div class="ledger">
      <div><span>Взносы</span><b>${room.licenses}</b></div>
      <div><span>Письма в журнале</span><b>${room.journal}</b></div>
      <div><span>Стоп</span><b>${room.stops}</b></div>
      <div><span>Подтверждённый оборот</span><b>${rub(room.gmv)}</b></div>
      <div><span>8% комиссии</span><b>${rub(t.fees)}</b></div>
      <div><span>Ждут второго бизнеса</span><b>${room.pending}</b></div>
    </div>
    <h2>Города</h2>
    <table class="table">
      <thead><tr><th>Город</th><th>Бизнесы</th><th>Взносы</th></tr></thead>
      <tbody>${(data.cities || []).map((city) => `<tr><td>${esc(city.city)}</td><td>${city.businesses}</td><td>${city.licenses}</td></tr>`).join("")}</tbody>
    </table>
    <h2>Бизнесы</h2>
    <table class="table">
      <thead><tr><th>Бизнес</th><th>База</th><th>Рассылка</th><th>Их выручка</th><th></th></tr></thead>
      <tbody>${data.members.map((member) => `<tr>
        <td>${esc(member.name)}<div class="muted">${esc(member.city)} · ${esc(member.craft)}</div></td>
        <td>${member.clientCount}</td>
        <td>${member.paidAt ? esc(when(member.waveAt)) : "взнос не оплачен"}<div class="muted">рассылок: ${member.wavesDone}</div></td>
        <td>${rub(member.books.nets)}</td>
        <td>${member.paidAt && member.clientCount ? `<button class="btn-line" data-act="open-morning" data-id="${esc(member.id)}">Открыть рассылку</button>` : ""}</td>
      </tr>`).join("") || `<tr><td colspan="5">Оплаченных взносов ещё нет.</td></tr>`}</tbody>
    </table>
    <h2>Проводки</h2>
    <table class="table">
      <thead><tr><th>Когда</th><th>Что</th><th>Сумма</th></tr></thead>
      <tbody>
        ${data.payments.map((item) => `<tr><td>${esc(when(item.at))}</td><td>Взнос «${esc(item.title)}»</td><td>${rub(item.amount)}</td></tr>`).join("")}
        ${data.deals.map((item) => `<tr><td>${esc(when(item.at))}</td><td>8% со сделки «${esc(item.partnerName)}»</td><td>${rub(item.fee)}</td></tr>`).join("")}
      </tbody>
    </table>`);
}

function render() {
  const view = {
    home,
    atlas,
    city,
    market,
    enter,
    pay,
    cabinet,
    house,
    guest,
    claim: claimView,
    cashier: cashierView,
  }[state.path] || home;
  app.innerHTML = view();
}

const CROSS_PANES = new Set(["hq", "passport", "gifts", "bundles", "hot", "funnel", "wallet", "tariff"]);

async function show() {
  const next = parseHash();
  state.path = next.path;
  state.pane = next.pane;
  state.claimCode = next.claimCode || "";
  state.cashierToken = next.cashierToken || "";
  state.error = "";
  state.notice = "";
  render();
  try {
    if (state.path === "home" && !state.example) state.example = await api("/api/example");
    if (state.path === "atlas" && !state.atlas) state.atlas = await api("/api/atlas");
    if (state.path === "market") state.market = await api("/api/market");
    if (state.path === "city") state.city = await api("/api/city");
    if ((state.path === "cabinet" || state.path === "pay") && localStorage.getItem("florens-token")) {
      const data = await api("/api/me");
      state.me = data.me;
      state.seats = data.seats;
      if (state.path === "cabinet") {
        if (CROSS_PANES.has(state.pane) || state.pane === "ideas") {
          state.crossflow = await api("/api/crossflow");
        }
        if ((state.pane === "bundles" || state.pane === "hot") && state.crossflow?.matchReady && state.pane === "bundles" && !state.match) {
          try {
            state.match = (await api(`/api/match?mode=${encodeURIComponent(state.matchMode || "adjacent")}`)).partners;
          } catch {
            state.match = [];
          }
        }
        if (!CROSS_PANES.has(state.pane) || state.pane === "ideas") {
          state.morning = await api("/api/morning");
          if (!state.picks || state.picksFor !== state.me.id) {
            const saved = state.morning.picks;
            state.picks = {
              ideas: saved?.ideas ? [...saved.ideas] : (state.morning.ideas || []).map((idea) => idea.id),
              audience: saved?.audience?.length ? [...saved.audience] : ["all"],
            };
            state.picksFor = state.me.id;
          }
        }
      }
    }
    if (state.path === "house" && sessionStorage.getItem("florens-house")) state.house = await api("/api/house");
    if (state.path === "guest" && localStorage.getItem("florens-guest")) {
      const data = await api("/api/guest/offers");
      state.offers = data.offers;
    }
    if (state.path === "claim" && state.claimCode) {
      state.claim = await api(`/api/c/${encodeURIComponent(state.claimCode)}`);
    }
    if (state.path === "cashier" && state.cashierToken) {
      state.cashier = await api(`/api/cashier/${encodeURIComponent(state.cashierToken)}`);
    }
  } catch (error) {
    state.error = error.message;
  }
  render();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function download(which) {
  const response = await fetch(`/api/packet?which=${which}`, { headers: { "X-Florens-Token": localStorage.getItem("florens-token") || "" } });
  if (!response.ok) throw new Error("Рассылка не собралась");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "florens-rassylka.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(header, fallback) {
  const raw = String(header || "");
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(raw);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* keep fallback */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(raw) || /filename=([^;]+)/i.exec(raw);
  if (plain?.[1]) return plain[1].trim().replace(/^"|"$/g, "");
  return fallback || "document.pdf";
}

async function downloadPdf(url, { button, fallbackName = "document.pdf" } = {}) {
  const label = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Формируем PDF...";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      headers: { "X-Florens-Token": localStorage.getItem("florens-token") || "" },
      signal: controller.signal,
    });
    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (!response.ok || contentType.includes("application/json")) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || data.message || "PDF не сформировался");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("Сервер вернул пустой PDF");
    const name = filenameFromDisposition(response.headers.get("Content-Disposition"), fallbackName);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || /Telegram/i.test(navigator.userAgent);
    // WebView / iOS: если download проигнорирован — открыть blob средствами системы.
    if (mobile) {
      try {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
    }, mobile ? 10_000 : 1000);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Таймаут: PDF не ответил за 30 секунд");
    throw error;
  } finally {
    clearTimeout(timer);
    if (button) {
      button.disabled = false;
      button.textContent = label || "Скачать PDF";
    }
  }
}

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-act]");
  if (!form) return;
  event.preventDefault();
  const act = form.dataset.act;
  const data = formData(form);
  state.error = "";
  try {
    if (act === "register") {
      const result = await api("/api/register", { method: "POST", body: data });
      localStorage.setItem("florens-token", result.token);
      location.hash = "pay";
      return;
    }
    if (act === "login") {
      const result = await api("/api/login", { method: "POST", body: data });
      localStorage.setItem("florens-token", result.token);
      location.hash = result.me.paidAt ? "cabinet" : "pay";
      return;
    }
    if (act === "base") {
      const result = await api("/api/clients", { method: "POST", body: { csv: data.csv, attest: true } });
      state.me = result.me;
      state.morning = result.morning;
      location.hash = "cabinet?pane=morning";
      return;
    }
    if (act === "catalog") {
      const chips = [];
      if (data.chip1Title) chips.push({ title: data.chip1Title, price: data.chip1Price, note: data.chip1Note });
      if (data.chip2Title) chips.push({ title: data.chip2Title, price: data.chip2Price, note: data.chip2Note });
      const result = await api("/api/catalog", {
        method: "POST",
        body: {
          hook: { title: data.hookTitle, price: data.hookPrice, note: data.hookNote },
          chips,
          seek: data.seek,
        },
      });
      state.me = result.me;
      state.morning = result.morning;
      state.atlas = null;
      state.market = null;
      state.notice = "Сохранено. Предложения партнёрам обновятся под ваши товары и акции.";
    }
    if (act === "deal") {
      const result = await api("/api/deals", { method: "POST", body: data });
      state.me = result.me;
      state.atlas = null;
    }
    if (act === "suppress") {
      const result = await api("/api/suppress", { method: "POST", body: data });
      state.me = result.me;
      state.morning = await api("/api/morning");
    }
    if (act === "guest") {
      const result = await api("/api/guest", { method: "POST", body: { ...data, consent: true } });
      localStorage.setItem("florens-guest", result.token);
      state.offers = result.offers;
    }
    if (act === "stop") {
      await api("/api/stop", { method: "POST", body: data });
      state.notice = "Адрес убран из следующих рассылок.";
    }
    if (act === "confirm-deal") {
      const result = await api("/api/deals/confirm", { method: "POST", body: data });
      state.me = result.me;
    }
    if (act === "house-key") {
      sessionStorage.setItem("florens-house", data.key.trim());
      state.house = await api("/api/house");
    }
    if (act === "passport") {
      const result = await api("/api/passport", { method: "PUT", body: data });
      state.me = result.me;
      state.crossflow = result.crossflow;
      state.match = null;
      state.notice = "Паспорт сохранён. Можно подбирать партнёров.";
    }
    if (act === "gift") {
      const result = await api("/api/gifts", { method: "POST", body: data });
      state.crossflow = result.crossflow;
      state.notice = "Подарок-локомотив добавлен.";
    }
    if (act === "spend-coins") {
      const result = await api("/api/wallet/spend", { method: "POST", body: data });
      state.crossflow = { ...(state.crossflow || {}), wallet: result.wallet };
      state.notice = `Списано. Баланс: ${result.balance}.`;
    }
    if (act === "claim-coupon") {
      const result = await api(`/api/c/${encodeURIComponent(state.claimCode)}/claim`, { method: "POST", body: data });
      state.myCoupon = result.coupon;
      state.notice = "Подарок у вас. Покажите код на кассе партнёра.";
    }
    if (act === "redeem") {
      const result = await api(`/api/cashier/${encodeURIComponent(state.cashierToken)}/redeem`, { method: "POST", body: data });
      const extra = result.revshareAmount
        ? ` RevShare ${rub(result.revshareAmount)}.`
        : "";
      state.notice = `Погашено. Начислено ${result.credited} Лид-коинов источнику.${extra} Чек ${rub(result.checkAmount)}.`;
      form.reset();
    }
    if (act === "publish-coop") {
      const protectedServicesText = data.protectedServicesText || "";
      const result = await api(`/api/bundles/${encodeURIComponent(form.dataset.id)}/publish`, {
        method: "POST",
        body: {
          pactAccepted: Boolean(data.pactAccepted),
          protectedServicesText,
          returnAnchor: data.returnAnchor,
          revsharePct: data.revsharePct,
        },
      });
      state.crossflow = result.crossflow;
      state.notice = `Опубликовано с пактом. Ссылка: ${result.claimPath}`;
    }
    if (act === "create-slot") {
      const result = await api("/api/slots", { method: "POST", body: data });
      state.crossflow = result.crossflow;
      state.notice = "Слот перегрузки открыт — коллеги могут слить вам горящий трафик.";
    }
    if (act === "handoff") {
      const result = await api("/api/handoff", { method: "POST", body: data });
      state.crossflow = result.crossflow;
      state.notice = `Передано в «${result.handoff.toName}». Талон: ${result.claimPath}`;
    }
    render();
  } catch (error) {
    state.error = error.message;
    render();
  }
});

app.addEventListener("click", async (event) => {
  const node = event.target.closest("[data-act]");
  if (!node) return;
  const act = node.dataset.act;
  try {
    if (act === "logout") {
      event.preventDefault();
      localStorage.removeItem("florens-token");
      state.me = null;
      state.morning = null;
      state.picks = null;
      state.picksFor = null;
      location.hash = "home";
    }
    if (act === "pay") {
      const result = await api("/api/pay", { method: "POST", body: { seat: node.dataset.seat } });
      state.me = result.me;
      state.morning = result.morning;
      state.atlas = null;
      location.hash = "cabinet?pane=base";
    }
    if (act === "idea" || act === "slice") {
      event.preventDefault();
      if (!state.picks) return;
      if (act === "idea") {
        const set = new Set(state.picks.ideas);
        if (set.has(node.dataset.id)) set.delete(node.dataset.id);
        else set.add(node.dataset.id);
        state.picks.ideas = [...set];
      } else if (node.dataset.id === "all") {
        state.picks.audience = ["all"];
      } else {
        const set = new Set((state.picks.audience || []).filter((item) => item !== "all"));
        if (set.has(node.dataset.id)) set.delete(node.dataset.id);
        else set.add(node.dataset.id);
        state.picks.audience = set.size ? [...set] : ["all"];
      }
      const result = await api("/api/picks", { method: "POST", body: state.picks });
      state.me = result.me;
      state.morning = result.morning;
      state.picks = {
        ideas: [...(result.morning.picks?.ideas || [])],
        audience: [...(result.morning.picks?.audience || ["all"])],
      };
      render();
    }
    if (act === "packet") {
      state.packet = node.dataset.which;
      render();
    }
    if (act === "export") await download(node.dataset.which || "next");
    if (act === "pdf-deal") {
      event.preventDefault();
      const id = node.dataset.id;
      if (!id) throw new Error("Нет id сделки");
      await downloadPdf(`/api/deals/pdf?id=${encodeURIComponent(id)}`, {
        button: node,
        fallbackName: "deal.pdf",
      });
    }
    if (act === "pdf-catalog") {
      event.preventDefault();
      await downloadPdf("/api/catalog/pdf", {
        button: node,
        fallbackName: "catalog.pdf",
      });
    }
    if (act === "sample") {
      const city = state.me?.city || "Москва";
      const area = document.querySelector("#base");
      if (area) area.value = `имя,контакт,заметка,траты,город\nМария Соколова,maria@contour.local,готовит свадьбу в июне,120000,${city}\nИван Кузнецов,ivan@contour.local,получил ключи от квартиры,90000,${city}\nСофия Морозова,sofia@contour.local,ребёнок идёт на занятия,20000,${city}\nЕлена Волкова,elena@contour.local,ведёт своё дело и смотрит договоры,40000,${city}\nКирилл Белов,kirill@contour.local,после бани болит спина,8000,${city}\nАнна Лебедева,anna@contour.local,ищет подарок и цветы к торжеству,22000,${city}`;
    }
    if (act === "file") document.querySelector("#file")?.click();
    if (act === "confirm-deal" && node.dataset.id) {
      event.preventDefault();
      const result = await api("/api/deals/confirm", { method: "POST", body: { dealId: node.dataset.id } });
      state.me = result.me;
      render();
    }
    if (act === "claim") {
      event.preventDefault();
      const result = await api("/api/guest/claim", { method: "POST", body: { businessId: node.dataset.id } });
      state.notice = `Предложение «${result.offer}». Бонус: ${result.bonus}. Бизнес подтвердит визит.`;
      render();
    }
    if (act === "open-morning") {
      await api("/api/house/open", { method: "POST", body: { businessId: node.dataset.id } });
      state.house = await api("/api/house");
      state.morning = null;
      render();
    }
    if (act === "set-match-mode") {
      event.preventDefault();
      state.matchMode = node.dataset.mode === "coopetition" ? "coopetition" : "adjacent";
      state.match = null;
      if (state.crossflow?.matchReady) {
        state.match = (await api(`/api/match?mode=${encodeURIComponent(state.matchMode)}`)).partners;
      }
      render();
    }
    if (act === "set-coop-tpl") {
      event.preventDefault();
      state.coopTemplate = node.dataset.tpl || "overflow";
      render();
    }
    if (act === "load-match") {
      event.preventDefault();
      state.match = (await api(`/api/match?mode=${encodeURIComponent(state.matchMode || "adjacent")}`)).partners;
      state.notice = `Найдено партнёров (${state.matchMode}): ${state.match.length}`;
      render();
    }
    if (act === "gen-bundle") {
      event.preventDefault();
      const result = await api("/api/bundles/generate", {
        method: "POST",
        body: {
          partnerId: node.dataset.id,
          mode: state.matchMode || "adjacent",
          template: state.matchMode === "coopetition" ? state.coopTemplate || "overflow" : "gift",
        },
      });
      state.crossflow = result.crossflow;
      state.notice = "Связка собрана: 3 оффера, скрипт и рассылка.";
      render();
    }
    if (act === "pick-offer") {
      event.preventDefault();
      await api("/api/bundles/select", {
        method: "POST",
        body: { bundleId: node.dataset.bundle, offerId: node.dataset.offer },
      });
      state.crossflow = await api("/api/crossflow");
      render();
    }
    if (act === "publish-bundle") {
      event.preventDefault();
      const result = await api(`/api/bundles/${encodeURIComponent(node.dataset.id)}/publish`, { method: "POST", body: {} });
      state.crossflow = result.crossflow;
      state.notice = `Опубликовано. Ссылка: ${result.claimPath}`;
      render();
    }
    if (act === "set-tariff") {
      event.preventDefault();
      const result = await api("/api/tariff", { method: "POST", body: { tariff: node.dataset.id } });
      state.me = result.me;
      state.crossflow = result.crossflow;
      state.notice = `Тариф «${result.tariff.title}» активен.`;
      render();
    }
  } catch (error) {
    state.error = error.message;
    render();
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.id !== "file" || !event.target.files?.[0]) return;
  const text = await event.target.files[0].text();
  const area = document.querySelector("#base");
  if (area) area.value = text;
});

window.addEventListener("hashchange", show);
setInterval(() => {
  const node = document.querySelector("[data-countdown]");
  if (node && state.morning?.waveAt) node.textContent = countdown(state.morning.waveAt);
}, 1000);

show();
