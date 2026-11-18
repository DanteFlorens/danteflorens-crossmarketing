/** Ремесла, цепи и ситуации. Нить строится отсюда, а не из «похожей отрасли». */

export const FEE_RATE = 0.08;

export const SEATS = [
  {
    id: "thread",
    title: "Старт",
    price: 19000,
    partners: 2,
    lettersPerClient: 1,
    note: "Регистрационный взнос. До 2 партнёров со смежной аудиторией.",
  },
  {
    id: "house",
    title: "Рост",
    price: 49000,
    partners: 4,
    lettersPerClient: 1,
    note: "Регистрационный взнос. До 4 партнёров. Слабые связки в рассылку не попадают.",
  },
  {
    id: "treasury",
    title: "Сеть",
    price: 120000,
    partners: 8,
    lettersPerClient: 2,
    note: "Регистрационный взнос. До 8 партнёров и до 2 писем одному клиенту при крепкой связке.",
  },
];

export const SITUATION_TITLES = {
  celebration: "торжество",
  new_home: "новый дом",
  appearance: "внешний вид",
  health: "тело и режим",
  mobility: "дорога и машина",
  child: "дети и семья",
  pet: "животное в доме",
  business_ops: "дела хозяина",
  travel: "путешествие",
  gift: "подарок",
  food_out: "стол и ужин",
  status: "статусная покупка",
  education: "навык и учёба",
  ritual: "память и ритуал",
};

export const SITUATION_KEYS = {
  celebration: ["свадьб", "свадеб", "юбиле", "праздн", "торжеств", "корпорат", "именин", "день рожден"],
  new_home: ["квартир", "ремонт", "интерьер", "новосел", "переезд", "недвижим", "ипотек", "мебел", "ключ"],
  appearance: ["красот", "образ", "стиль", "волос", "макияж", "космет", "барбер", "улыб", "стомат", "одежд"],
  health: ["здоров", "фитнес", "тренир", "питани", "массаж", "врач", "клиник", "баня", "сауна", "парн"],
  mobility: ["автомобил", "машин", "шин", "детейл", "трансфер", "водител"],
  child: ["дет", "ребенок", "ребен", "ребенк", "репетитор", "игруш", "скрипич"],
  pet: ["питом", "собак", "кошк", "ветерин", "груминг", "зоо"],
  business_ops: ["бизнес", "бухгал", "юрист", "маркетинг", "сотрудник", "налог", "договор", "компан"],
  travel: ["путешеств", "тур", "отел", "гостиниц", "экскурс", "отпуск", "багаж"],
  gift: ["подар", "сувенир", "букет", "цвет", "украшен"],
  food_out: ["ресторан", "ужин", "обед", "кафе", "банкет", "кейтеринг", "торт", "кондитер"],
  status: ["премиум", "элит", "люкс", "статус"],
  education: ["курс", "обучен", "наставник", "скрип", "керамик", "школа", "гончар"],
  ritual: ["ритуал", "похорон", "памят", "урн"],
};

export const PERSONA_KEYS = {
  brides: ["невест", "свадьб", "свадеб"],
  families: ["семь"],
  parents: ["дет", "ребенок", "ребен", "ребенк", "родитель"],
  affluent: ["премиум", "люкс", "частн"],
  homeowners: ["квартир", "новосел", "переезд", "ремонт"],
  car_owners: ["автомобил", "машин"],
  diners: ["ресторан", "ужин", "обед"],
  gift_givers: ["подар"],
  travelers: ["путешеств", "тур", "отпуск"],
  athletes: ["фитнес", "тренир", "спорт"],
  pet_owners: ["собак", "кошк", "питом"],
  business_owners: ["бизнес", "компан", "хозяин"],
  appearance: ["красот", "стиль", "образ"],
};

export const ROLES = {
  bridal: { title: "свадебный дом", situations: ["celebration", "status"], personas: ["brides", "affluent"] },
  jeweler: { title: "ювелир", situations: ["celebration", "gift", "status"], personas: ["brides", "affluent", "gift_givers"] },
  beauty: { title: "салон красоты", situations: ["appearance", "celebration"], personas: ["brides", "appearance", "affluent"] },
  photographer: { title: "фотограф", situations: ["celebration", "appearance", "child", "travel"], personas: ["brides", "families", "parents"] },
  florist: { title: "флорист", situations: ["celebration", "gift", "food_out"], personas: ["brides", "gift_givers", "diners", "families"] },
  decorator: { title: "декоратор", situations: ["celebration", "new_home"], personas: ["brides", "homeowners"] },
  venue: { title: "площадка", situations: ["celebration"], personas: ["brides", "business_owners"] },
  catering: { title: "кейтеринг", situations: ["celebration", "food_out"], personas: ["brides", "business_owners", "diners"] },
  cake: { title: "кондитер", situations: ["celebration", "gift", "child"], personas: ["brides", "families", "gift_givers"] },
  host: { title: "ведущий", situations: ["celebration"], personas: ["brides", "families"] },
  transfer: { title: "трансфер", situations: ["celebration", "travel", "mobility", "food_out"], personas: ["brides", "travelers", "diners", "car_owners"] },
  restaurant: { title: "ресторан", situations: ["food_out", "celebration", "gift"], personas: ["diners", "affluent"] },
  realtor: { title: "риелтор", situations: ["new_home"], personas: ["homeowners", "families"] },
  mortgage: { title: "ипотека", situations: ["new_home"], personas: ["homeowners", "families"] },
  designer: { title: "дизайнер интерьера", situations: ["new_home", "status"], personas: ["homeowners", "affluent"] },
  renovation: { title: "ремонт", situations: ["new_home"], personas: ["homeowners"] },
  furniture: { title: "мебель", situations: ["new_home", "gift"], personas: ["homeowners", "families"] },
  textiles: { title: "текстиль дома", situations: ["new_home"], personas: ["homeowners"] },
  cleaning: { title: "клининг", situations: ["new_home", "celebration"], personas: ["homeowners", "business_owners"] },
  moving: { title: "переезд", situations: ["new_home", "mobility"], personas: ["homeowners", "families"] },
  property_insurance: { title: "страхование жилья", situations: ["new_home"], personas: ["homeowners"] },
  dealer: { title: "автосалон", situations: ["mobility", "status"], personas: ["car_owners", "affluent"] },
  auto_insurance: { title: "автострахование", situations: ["mobility"], personas: ["car_owners"] },
  detailing: { title: "детейлинг", situations: ["mobility", "appearance", "status"], personas: ["car_owners", "affluent"] },
  service: { title: "автосервис", situations: ["mobility"], personas: ["car_owners"] },
  tires: { title: "шины", situations: ["mobility"], personas: ["car_owners"] },
  dentist: { title: "стоматология", situations: ["health", "appearance"], personas: ["appearance", "families"] },
  cosmetology: { title: "косметология", situations: ["appearance", "health"], personas: ["appearance", "affluent"] },
  barber: { title: "барбер", situations: ["appearance"], personas: ["appearance"] },
  stylist: { title: "стилист", situations: ["appearance", "status", "celebration"], personas: ["appearance", "brides", "affluent"] },
  fitness: { title: "фитнес", situations: ["health", "appearance"], personas: ["athletes", "appearance"] },
  nutrition: { title: "нутрициолог", situations: ["health"], personas: ["athletes", "families"] },
  massage: { title: "массаж", situations: ["health", "appearance"], personas: ["athletes", "appearance"] },
  bath: { title: "баня", situations: ["health", "appearance"], personas: ["athletes", "appearance", "diners"] },
  sportswear: { title: "спортивная одежда", situations: ["health", "appearance"], personas: ["athletes"] },
  healthy_food: { title: "полезная еда", situations: ["health", "food_out"], personas: ["athletes"] },
  optics: { title: "оптика", situations: ["appearance", "health"], personas: ["appearance", "families"] },
  pediatric: { title: "педиатр", situations: ["child", "health"], personas: ["parents"] },
  kids_club: { title: "детский клуб", situations: ["child"], personas: ["parents", "families"] },
  tutor: { title: "репетитор", situations: ["child", "education"], personas: ["parents"] },
  toy_store: { title: "игрушки", situations: ["child", "gift"], personas: ["parents", "gift_givers"] },
  kids_clothes: { title: "детская одежда", situations: ["child", "gift"], personas: ["parents"] },
  accountant: { title: "бухгалтер", situations: ["business_ops"], personas: ["business_owners"] },
  lawyer: { title: "юрист", situations: ["business_ops", "new_home"], personas: ["business_owners", "homeowners"] },
  marketing: { title: "маркетинг", situations: ["business_ops"], personas: ["business_owners"] },
  printing: { title: "типография", situations: ["business_ops", "celebration", "ritual"], personas: ["business_owners"] },
  it_service: { title: "цифровой контур", situations: ["business_ops"], personas: ["business_owners"] },
  hr: { title: "подбор людей", situations: ["business_ops"], personas: ["business_owners"] },
  courses: { title: "школа навыка", situations: ["education"], personas: [] },
  coach: { title: "наставник", situations: ["education", "business_ops"], personas: ["business_owners"] },
  agency: { title: "путешествия", situations: ["travel"], personas: ["travelers", "families"] },
  hotel: { title: "гостиница", situations: ["travel", "celebration"], personas: ["travelers"] },
  excursion: { title: "экскурсии", situations: ["travel"], personas: ["travelers", "families"] },
  luggage: { title: "дорожные вещи", situations: ["travel", "gift"], personas: ["travelers", "gift_givers"] },
  travel_insurance: { title: "страхование поездки", situations: ["travel"], personas: ["travelers"] },
  vet: { title: "ветеринар", situations: ["pet", "health"], personas: ["pet_owners"] },
  grooming: { title: "груминг", situations: ["pet", "appearance"], personas: ["pet_owners"] },
  pet_shop: { title: "зоотовары", situations: ["pet", "gift"], personas: ["pet_owners"] },
  pet_hotel: { title: "гостиница для животных", situations: ["pet", "travel"], personas: ["pet_owners", "travelers"] },
  clothing: { title: "одежда", situations: ["appearance", "status", "gift"], personas: ["appearance", "affluent"] },
  perfume: { title: "парфюм", situations: ["gift", "appearance", "status"], personas: ["gift_givers", "affluent"] },
  gift_shop: { title: "подарки", situations: ["gift", "celebration"], personas: ["gift_givers"] },
  memorial: { title: "дом памяти", situations: ["ritual"], personas: ["families"] },
  bespoke: { title: "своё дело", situations: [], personas: [] },
};

export const CHAINS = [
  { id: "wedding", title: "Свадебный стол", roles: ["venue", "bridal", "stylist", "beauty", "jeweler", "photographer", "florist", "decorator", "cake", "catering", "host", "transfer"] },
  { id: "table", title: "Вечерний стол", roles: ["restaurant", "florist", "gift_shop", "perfume", "photographer", "transfer", "cake"] },
  { id: "home", title: "Новый дом", roles: ["realtor", "designer", "renovation", "furniture", "textiles", "cleaning", "moving", "mortgage", "property_insurance", "lawyer"] },
  { id: "auto", title: "Машина", roles: ["dealer", "auto_insurance", "detailing", "tires", "service", "transfer"] },
  { id: "body", title: "Тело и вид", roles: ["dentist", "cosmetology", "barber", "stylist", "optics", "fitness", "nutrition", "healthy_food", "massage", "bath", "sportswear"] },
  { id: "child", title: "Семья и дети", roles: ["pediatric", "kids_club", "tutor", "toy_store", "kids_clothes", "photographer", "cake"] },
  { id: "owner", title: "Хозяйский контур", roles: ["accountant", "lawyer", "marketing", "printing", "it_service", "hr", "courses", "coach"] },
  { id: "travel", title: "Дорога", roles: ["agency", "hotel", "excursion", "luggage", "travel_insurance", "photographer", "transfer"] },
  { id: "pet", title: "Животное в доме", roles: ["vet", "grooming", "pet_shop", "pet_hotel"] },
  { id: "gift", title: "Подарок", roles: ["gift_shop", "florist", "jeweler", "perfume", "cake", "toy_store", "luggage"] },
  { id: "memory", title: "Память", roles: ["memorial", "florist", "photographer", "printing", "lawyer"] },
];

/** Более длинное совпадение побеждает. Общие слова вроде «дом» сюда не ставим. */
export const LEXICON = [
  { role: "bridal", keys: ["свадебный дом", "плать", "фата", "свадеб", "свадьб"] },
  { role: "jeweler", keys: ["ювелир", "кольц", "украшен"] },
  { role: "beauty", keys: ["салон красоты", "красот", "макияж", "парикмахер"] },
  { role: "photographer", keys: ["фотограф", "фотосъ", "фотостуд"] },
  { role: "florist", keys: ["флорист", "букет", "цветоч", "цветы"] },
  { role: "decorator", keys: ["декоратор", "оформлен празд"] },
  { role: "venue", keys: ["площадк", "банкетный зал", "лофт для"] },
  { role: "catering", keys: ["кейтеринг", "выездной стол", "банкет"] },
  { role: "cake", keys: ["кондитер", "торт"] },
  { role: "host", keys: ["ведущ", "тамада"] },
  { role: "transfer", keys: ["трансфер", "подача авто", "водител"] },
  { role: "restaurant", keys: ["ресторан", "ужин", "кафе", "бистро"] },
  { role: "realtor", keys: ["риелтор", "риэлтор", "недвижим"] },
  { role: "mortgage", keys: ["ипотек"] },
  { role: "designer", keys: ["дизайнер интерьера", "интерьер"] },
  { role: "renovation", keys: ["ремонт"] },
  { role: "furniture", keys: ["мебел"] },
  { role: "textiles", keys: ["текстил", "штор"] },
  { role: "cleaning", keys: ["клининг", "уборк"] },
  { role: "moving", keys: ["переезд", "грузчик"] },
  { role: "property_insurance", keys: ["страхование жил", "страховка квартир"] },
  { role: "dealer", keys: ["автосалон", "дилер авто"] },
  { role: "auto_insurance", keys: ["автострах", "каско", "осаго"] },
  { role: "detailing", keys: ["детейлинг", "полировк кузов"] },
  { role: "service", keys: ["автосервис", "сто авто"] },
  { role: "tires", keys: ["шиномонтаж", "шины"] },
  { role: "dentist", keys: ["стоматолог", "стомат", "зубн"] },
  { role: "cosmetology", keys: ["косметолог"] },
  { role: "barber", keys: ["барбер", "барбершоп"] },
  { role: "stylist", keys: ["стилист"] },
  { role: "fitness", keys: ["фитнес", "тренажер", "спортзал"] },
  { role: "nutrition", keys: ["нутрициолог", "питани"] },
  { role: "massage", keys: ["массаж"] },
  { role: "bath", keys: ["баня", "сауна", "парн"] },
  { role: "sportswear", keys: ["спортивн одежд", "экипиров"] },
  { role: "healthy_food", keys: ["полезная еда", "доставка рацион"] },
  { role: "optics", keys: ["оптик", "очк"] },
  { role: "pediatric", keys: ["педиатр"] },
  { role: "kids_club", keys: ["детский клуб", "детский центр"] },
  { role: "tutor", keys: ["репетитор"] },
  { role: "toy_store", keys: ["игруш"] },
  { role: "kids_clothes", keys: ["детская одежда"] },
  { role: "accountant", keys: ["бухгалтер", "бухгалт"] },
  { role: "lawyer", keys: ["юрист", "адвокат"] },
  { role: "marketing", keys: ["маркетинг", "продвижен"] },
  { role: "printing", keys: ["типограф", "полиграф", "визитк"] },
  { role: "it_service", keys: ["сайт под ключ", "crm", "айти", "програм"] },
  { role: "hr", keys: ["подбор персонал", "рекрутер", "кадров"] },
  { role: "courses", keys: ["школа скрип", "скрип", "керамик", "гончар", "курс", "школа"] },
  { role: "coach", keys: ["наставник", "коуч"] },
  { role: "agency", keys: ["турагент", "путешеств", "турфир"] },
  { role: "hotel", keys: ["гостиниц", "отел"] },
  { role: "excursion", keys: ["экскурс"] },
  { role: "luggage", keys: ["чемодан", "багаж"] },
  { role: "travel_insurance", keys: ["страховка для поезд", "страхование поезд"] },
  { role: "vet", keys: ["ветеринар", "ветклиник"] },
  { role: "grooming", keys: ["груминг"] },
  { role: "pet_shop", keys: ["зоомагазин", "зоотовар", "корм для"] },
  { role: "pet_hotel", keys: ["передержк", "гостиница для животных", "зоогостиниц"] },
  { role: "clothing", keys: ["одежд", "ателье костюм", "бутик"] },
  { role: "perfume", keys: ["парфюм", "духи"] },
  { role: "gift_shop", keys: ["подар", "сувенир"] },
  { role: "memorial", keys: ["ритуал", "похорон", "урн"] },
];

export function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityKey(value) {
  return normalize(value).replace(/^г\.?\s+/, "").replace(/^город\s+/, "");
}

const ENDINGS = [
  "ическая", "ическое", "ический", "ические",
  "ерия", "ерии", "ерию",
  "ского", "скому", "ский", "ская", "ское", "ские",
  "ного", "ному", "ный", "ная", "ное", "ные",
  "остью", "ости", "ость",
  "ами", "ями", "ов", "ев", "ей", "ий", "ый", "ая", "ое", "ые", "ие",
  "ию", "ью", "ия", "ья", "ии", "ам", "ям", "ах", "ях",
  "кой", "кая", "ки", "ка", "ку", "ке",
  "у", "ю", "а", "я", "е", "и", "ы", "о", "й", "ь",
];

/** Корень с начала слова плюс окончание. «дет» не срабатывает внутри «детейлинг», «авто» — внутри «автомобиль». */
export function hasStem(text, key) {
  const hay = normalize(text);
  const needle = normalize(key);
  if (!needle || !hay) return false;
  let from = 0;
  while (from <= hay.length - needle.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const prev = at === 0 ? "" : hay[at - 1];
    const prevOk = !prev || !/[a-zа-я0-9]/i.test(prev);
    if (prevOk) {
      const after = hay.slice(at + needle.length);
      const rest = (after.match(/^[a-zа-я0-9]+/i) || [""])[0];
      if (rest === "" || ENDINGS.includes(rest)) return true;
    }
    from = at + 1;
  }
  return false;
}

export function bandFromTicket(ticket) {
  const n = Number(ticket) || 0;
  if (n < 5000) return "modest";
  if (n < 30000) return "middle";
  if (n < 150000) return "high";
  return "estate";
}

export function seatById(id) {
  return SEATS.find((seat) => seat.id === id) || null;
}
