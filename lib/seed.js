import { normalizeCatalog } from "./catalog.js";
import { bandFromTicket } from "./ontology.js";
import { inferProfile } from "./engine.js";

export const SPECS = [
  { id: "seat-bridal", expectedRole: "bridal", name: "Северная фата", owner: "Анна Лебедева", city: "Москва", ticket: 180000, craft: "свадебный дом платьев", about: "Платье и сбор образа к торжеству.", offer: "примерка и пошив платья к торжеству", benefit: "приоритетная примерка в будний день", phone: "+7 495 000-01-01" },
  { id: "seat-jewel", expectedRole: "jeweler", name: "Ландыш", owner: "Мария Соколова", city: "Москва", ticket: 90000, craft: "ювелирный дом", about: "Кольца и украшения к торжеству.", offer: "подбор украшения к торжеству", benefit: "закрытый подбор без витринной спешки", phone: "+7 495 000-01-02" },
  { id: "seat-beauty", expectedRole: "beauty", name: "Тихая вода", owner: "Елена Волкова", city: "Москва", ticket: 12000, craft: "салон красоты", about: "Сбор образа в день торжества.", offer: "сбор образа в утро торжества", benefit: "утренний час для клиентов смежных бизнесов", phone: "+7 495 000-01-03" },
  { id: "seat-photo", expectedRole: "photographer", name: "Свет и клятва", owner: "Павел Орлов", city: "Москва", ticket: 45000, craft: "фотограф торжеств", about: "Съёмка дня и семейного стола.", offer: "съёмка дня", benefit: "тихий час съёмки для пар от смежных бизнесов", phone: "+7 495 000-01-04" },
  { id: "seat-florist", expectedRole: "florist", name: "Сухой стебель", owner: "София Морозова", city: "Москва", ticket: 8000, craft: "флористическая мастерская", about: "Букет, стол и цветы к ужину.", offer: "букет и цветы на стол", benefit: "букет к ужину или торжеству без витринной наценки", phone: "+7 495 000-01-05" },
  { id: "seat-venue", expectedRole: "venue", name: "Дом на Патриарших", owner: "Иван Кузнецов", city: "Москва", ticket: 250000, craft: "площадка для торжеств", about: "Зал и двор для регистрации и ужина.", offer: "просмотр зала и двора", benefit: "будний просмотр площадки", phone: "+7 495 000-01-06" },
  { id: "seat-catering", expectedRole: "catering", name: "Белая соль", owner: "Кирилл Белов", city: "Москва", ticket: 70000, craft: "кейтеринг банкетов", about: "Стол на торжество.", offer: "стол и меню на торжество", benefit: "дегустация меню для клиентов площадок", phone: "+7 495 000-01-07" },
  { id: "seat-realtor", expectedRole: "realtor", name: "Ключ и порог", owner: "Ольга Новикова", city: "Москва", ticket: 200000, craft: "риелтор жилой недвижимости", about: "Подбор квартиры и ключи.", offer: "подбор квартиры", benefit: "два просмотра с сопровождающим", phone: "+7 495 000-01-08" },
  { id: "seat-design", expectedRole: "designer", name: "План и тень", owner: "Дарья Ковалёва", city: "Москва", ticket: 150000, craft: "дизайнер интерьера", about: "Свет и план нового дома.", offer: "разбор света и плана нового дома", benefit: "короткая встреча до договора на проект", phone: "+7 495 000-01-09" },
  { id: "seat-detail", expectedRole: "detailing", name: "Ночная эмаль", owner: "Егор Михайлов", city: "Москва", ticket: 25000, craft: "детейлинг автомобилей", about: "Уход за кузовом.", offer: "ночное окно детейлинга", benefit: "одна ночь ухода для клиентов смежных бизнесов", phone: "+7 495 000-01-10" },
  { id: "seat-account", expectedRole: "accountant", name: "Счёт и печать", owner: "Ирина Попова", city: "Москва", ticket: 15000, craft: "бухгалтер для бизнеса", about: "Счёт, отчётность, сверка.", offer: "сверка счёта и отчётности", benefit: "первый месяц сверки документов", phone: "+7 495 000-01-11" },
  { id: "seat-law", expectedRole: "lawyer", name: "Форма и слово", owner: "Андрей Васильев", city: "Москва", ticket: 40000, craft: "юрист по договорам", about: "Договоры хозяев и сделок с жильём.", offer: "проверка договора", benefit: "одна проверка договора для клиентов смежных бизнесов", phone: "+7 495 000-01-12" },
  { id: "seat-restaurant", expectedRole: "restaurant", name: "Третий тост", owner: "Никита Петров", city: "Санкт-Петербург", ticket: 6000, craft: "ресторан ужинов", about: "Тихий ужин.", offer: "стол на вечер", benefit: "тихий ужин в будни", phone: "+7 812 000-02-01" },
  { id: "seat-transfer", expectedRole: "transfer", name: "Ровная подача", owner: "Сергей Смирнов", city: "Санкт-Петербург", ticket: 4000, craft: "трансфер и подача автомобилей", about: "Подача к двери ресторана или дома.", offer: "подача автомобиля к двери", benefit: "одна городская подача", phone: "+7 812 000-02-02" },
  { id: "seat-fitness", expectedRole: "fitness", name: "Тихий круг", owner: "Алина Орлова", city: "Казань", ticket: 5000, craft: "фитнес зал", about: "Тренировки без шума.", offer: "неделя зала", benefit: "неделя зала для клиентов смежных кабинетов", phone: "+7 843 000-03-01" },
  { id: "seat-nutrition", expectedRole: "nutrition", name: "Стол и мера", owner: "Полина Белова", city: "Казань", ticket: 7000, craft: "нутрициолог питание", about: "Режим стола.", offer: "встреча по режиму питания", benefit: "одна встреча без абонемента", phone: "+7 843 000-03-02" },
  { id: "seat-kids", expectedRole: "kids_club", name: "Тихий двор", owner: "Мария Лебедева", city: "Москва", ticket: 8000, craft: "детский клуб", about: "Занятия для детей рядом с домом.", offer: "пробное занятие для ребёнка", benefit: "пробный день без абонемента", phone: "+7 495 000-01-17" },
  { id: "seat-massage", expectedRole: "massage", name: "Тёплая спина", owner: "Иван Соколов", city: "Москва", ticket: 6000, craft: "массаж", about: "Восстановление спины после нагрузки и парной.", offer: "сеанс для спины", benefit: "сеанс после нагрузки или бани", phone: "+7 495 000-01-18" },
  { id: "seat-clinic-north", expectedRole: "dentist", name: "Клиника Северный улыб", owner: "Регина Северная", city: "Москва", ticket: 15000, craft: "стоматология терапия", about: "Район север. Терапия и гигиена, без своего МРТ.", offer: "осмотр и гигиена в подарок", benefit: "первичный осмотр без очереди для партнёров", phone: "+7 495 000-01-19", district: "север" },
  { id: "seat-clinic-south", expectedRole: "dentist", name: "Клиника Южный луч", owner: "Тимур Южный", city: "Москва", ticket: 18000, craft: "стоматология хирургия", about: "Район юг. Свободные окна сегодня, хирургия.", offer: "бонус 1000 ₽ на срочный приём", benefit: "окно в день обращения для коллег", phone: "+7 495 000-01-20", district: "юг" },
  { id: "seat-clinic-mri", expectedRole: "dentist", name: "Клиника Томограф+", owner: "Вера Диагност", city: "Москва", ticket: 22000, craft: "стоматология диагностика МРТ", about: "Район центр. Дорогой томограф простаивает по утрам.", offer: "чек-ап и расшифровка в подарок", benefit: "утренний слот диагностики для коллег", phone: "+7 495 000-01-21", district: "центр" },
];

const FIRST = ["Мария", "Анна", "Елена", "Ольга", "Ирина", "София", "Дарья", "Полина", "Иван", "Павел", "Сергей", "Андрей", "Никита", "Кирилл", "Егор", "Алина"];
const LAST = ["Соколова", "Лебедева", "Морозова", "Волкова", "Ковалёва", "Новикова", "Белова", "Орлова", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов", "Фёдоров"];

const NOTES = {
  bridal: ["готовит свадьбу в июне", "выбирает платье к торжеству", "зовёт семью на регистрацию"],
  jeweler: ["ищет кольцо к свадьбе", "выбирает украшение в подарок", "собирает образ к торжеству"],
  beauty: ["собирает образ к торжеству", "приходит перед ужином", "хочет тихий час красоты"],
  photographer: ["снимает свадьбу летом", "ищет семейную съёмку с детьми", "готовит подарок — альбом"],
  florist: ["берёт букет к ужину", "оформляет стол к празднику", "несёт цветы как подарок"],
  venue: ["смотрит площадку для свадьбы", "собирает гостей на юбилей", "сравнивает залы"],
  catering: ["собирает банкет на торжество", "ищет стол для юбилея", "сверяет меню к регистрации"],
  realtor: ["получил ключи от квартиры", "ищет квартиру для семьи", "выходит на сделку с жильём"],
  designer: ["начинает ремонт нового дома", "думает о свете в квартире", "получил ключи и собирает план"],
  detailing: ["купил автомобиль и хочет уход за кузовом", "готовит машину к поездке", "после зимы приводит авто"],
  accountant: ["ведёт своё дело и сверяет счёт", "открыл компанию и смотрит отчётность", "несёт документы по бизнесу"],
  lawyer: ["проверяет договор перед подписью", "сделка с квартирой и нужен юрист", "ведёт бизнес и смотрит договор"],
  restaurant: ["идёт на ужин с семьёй", "ищет тихий стол к празднику", "хочет подарок — ужин"],
  transfer: ["нужна подача к ресторану", "собирается в дорогу по городу", "просит трансфер к торжеству"],
  fitness: ["ходит на тренировки", "собирает режим тела", "после работы идёт в зал"],
  nutrition: ["выстраивает питание рядом с тренировками", "ищет режим стола", "заботится о здоровье семьи"],
  kids_club: ["ребёнок идёт на занятия", "ищет клуб для детей", "семье нужно место рядом с домом"],
  massage: ["после бани болит спина", "просит восстановление после тренировки", "хочет тихий сеанс"],
  dentist: ["острая зубная боль сегодня", "нужно УЗИ / снимок", "курс из пяти процедур далеко от дома"],
};

function hash(value) {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeClients(business, count) {
  const random = rng(hash(business.id));
  const notes = NOTES[business.role] || ["постоянный клиент", "просит смежный шаг к своей покупке"];
  const clients = [];
  for (let i = 0; i < count; i += 1) {
    const name = `${FIRST[(i + business.name.length) % FIRST.length]} ${LAST[(i * 3 + business.city.length) % LAST.length]}`;
    const slug = `${business.id}-${i + 1}`;
    clients.push({
      id: `${business.id}-c${i + 1}`,
      businessId: business.id,
      name,
      contact: `${slug}@contour.local`,
      note: notes[i % notes.length],
      spend: Math.round(business.ticket * (0.35 + random() * 0.8)),
      city: business.city,
    });
  }
  return clients;
}

function catalogFromSpec(spec) {
  const ticket = Number(spec.ticket) || 0;
  return normalizeCatalog({
    hook: {
      title: spec.offer,
      price: Math.max(500, Math.round(ticket * 0.35)),
      note: "красная цена для клиента смежного дела",
    },
    chips: [
      {
        title: spec.craft,
        price: ticket,
        note: spec.benefit || "голубая фишка — основной чек",
      },
    ],
    seek: "смежный поток клиентов того же момента жизни",
  });
}

export function houseFromSpec(spec) {
  const profile = inferProfile(spec);
  return {
    id: spec.id,
    kind: "seat",
    atTable: true,
    name: spec.name,
    owner: spec.owner,
    email: `${spec.id}@seat.florens`,
    phone: spec.phone,
    craft: spec.craft,
    about: spec.about,
    offer: spec.offer,
    benefit: spec.benefit,
    catalog: catalogFromSpec(spec),
    seek: "смежный поток клиентов того же момента жизни",
    ...profile,
    ticket: spec.ticket,
    band: bandFromTicket(spec.ticket),
    city: spec.city,
    district: spec.district || "",
    suppressed: [],
    wavesDone: 0,
    waveAt: null,
    waveStatus: "seat",
    paidAt: null,
    seat: null,
  };
}

export function buildWorld() {
  const businesses = SPECS.map(houseFromSpec);
  const clients = businesses.flatMap((business) => makeClients(business, 10));
  return {
    version: 1,
    businesses,
    clients,
    payments: [],
    deals: [],
    waves: [],
    sessions: [],
  };
}
