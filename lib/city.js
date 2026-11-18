/** Город будущего: кварталы по интересам и предназначению в пригородах и красивых местах. */

import { CHAINS, ROLES, cityKey } from "./ontology.js";

/**
 * Каждый квартал = цепь жизни + характер места.
 * Сейчас это цифровая плотность домов; дальше — районы в пригородах и красивых местах.
 */
export const QUARTERS = [
  {
    id: "wedding",
    chainId: "wedding",
    title: "Квартал торжества",
    purpose: "свадьбы, юбилеи, регистрация, образ дня",
    place: "scenic",
    placeTitle: "красивые места у воды, усадьбы, парковые опушки",
    horizon: "Площадки, флористы, фото и стол — в одном пейзаже, без гонки по городу.",
  },
  {
    id: "table",
    chainId: "table",
    title: "Вечерний квартал",
    purpose: "ужин, подарок, тихий выход",
    place: "edge",
    placeTitle: "тихие улицы у кромки центра и набережные",
    horizon: "Ресторан, цветы, трансфер — короткий вечерный контур.",
  },
  {
    id: "home",
    chainId: "home",
    title: "Квартал нового дома",
    purpose: "ключи, ремонт, мебель, семья в квартире",
    place: "suburb",
    placeTitle: "пригороды и новые жилые массивы",
    horizon: "Риелтор, дизайн, ремонт и клинингуют рядом с домом, не через весь город.",
  },
  {
    id: "auto",
    chainId: "auto",
    title: "Квартал дороги",
    purpose: "машина, уход, страховка, подача",
    place: "ring",
    placeTitle: "кольцо и удобные подъезды у города",
    horizon: "Сервис и детейлинг без заезда в плотный центр.",
  },
  {
    id: "body",
    chainId: "body",
    title: "Квартал тела и вида",
    purpose: "здоровье, спорт, красота, восстановление",
    place: "green",
    placeTitle: "зелёные пригороды и места у воздуха",
    horizon: "Зал, баня, массаж, питание — один режим дня в одном районе.",
  },
  {
    id: "child",
    chainId: "child",
    title: "Семейный квартал",
    purpose: "дети, учёба, семейный день",
    place: "suburb",
    placeTitle: "тихие пригороды у школ и дворов",
    horizon: "Клуб, репетитор, фото и торт — в шаговой доступности для родителя.",
  },
  {
    id: "owner",
    chainId: "owner",
    title: "Хозяйский квартал",
    purpose: "дела хозяина: учёт, право, люди, навык",
    place: "civic",
    placeTitle: "деловой пояс у города, не башня ради башни",
    horizon: "Бухгалтер, юрист, маркетинг и школа навыка в одном хозяйском контуре.",
  },
  {
    id: "travel",
    chainId: "travel",
    title: "Квартал сборов",
    purpose: "поездки, отель, экскурсии",
    place: "gate",
    placeTitle: "ворота города: аэропорт, вокзал, красивый выезд",
    horizon: "Сборы и дорога начинаются в одном месте, без рваной логистики.",
  },
  {
    id: "pet",
    chainId: "pet",
    title: "Квартал с питомцем",
    purpose: "животное в доме",
    place: "green",
    placeTitle: "окраины у парков и прогулочных троп",
    horizon: "Вет, груминг и передержка рядом с маршрутом прогулки.",
  },
  {
    id: "gift",
    chainId: "gift",
    title: "Квартал подарка",
    purpose: "найти и вручить подарок",
    place: "edge",
    placeTitle: "уютные места у прогулочных осей",
    horizon: "Подарок собирается из соседних домов, не из случайной витрины.",
  },
  {
    id: "memory",
    chainId: "memory",
    title: "Тихий квартал памяти",
    purpose: "ритуал, память, поддержка семьи",
    place: "quiet",
    placeTitle: "тихие окраины вдали от шума",
    horizon: "Дома памяти и соседние шаги — без витринной суеты.",
  },
];

const BY_CHAIN = Object.fromEntries(QUARTERS.map((item) => [item.chainId, item]));
const BY_ID = Object.fromEntries(QUARTERS.map((item) => [item.id, item]));

export function quarterById(id) {
  return BY_ID[id] || null;
}

export function quartersForRole(role) {
  if (!role) return [];
  return QUARTERS.filter((quarter) => {
    const chain = CHAINS.find((item) => item.id === quarter.chainId);
    return chain?.roles.includes(role);
  });
}

export function primaryQuarter(business) {
  const role = business?.role;
  if (!role || role === "bespoke") return null;
  const hits = quartersForRole(role);
  if (!hits.length) return null;
  const chainHit = CHAINS.find((chain) => chain.roles.includes(role) && BY_CHAIN[chain.id]);
  if (chainHit) return BY_CHAIN[chainHit.id];
  return hits[0];
}

function houseBrief(house) {
  return {
    id: house.id,
    name: house.name,
    craft: house.craft,
    role: house.role,
    roleTitle: house.roleTitle || ROLES[house.role]?.title || house.craft,
    kind: house.kind,
  };
}

/** Состав кварталов по одному городу: кто уже «живёт» в цифровой плотности. */
export function quartersOfCity(city, businesses) {
  const key = cityKey(city);
  const locals = (businesses || []).filter((item) => item.atTable && cityKey(item.city) === key);
  return QUARTERS.map((quarter) => {
    const chain = CHAINS.find((item) => item.id === quarter.chainId);
    const roles = new Set(chain?.roles || []);
    const present = locals.filter((item) => roles.has(item.role));
    const roleCoverage = [...roles].filter((role) => present.some((item) => item.role === role)).length;
    return {
      ...quarter,
      chainTitle: chain?.title || quarter.title,
      city: city || key,
      houses: present.map(houseBrief),
      houseCount: present.length,
      roleSlots: roles.size,
      roleCoverage,
      density: roles.size ? Math.round((roleCoverage / roles.size) * 100) : 0,
      emptyRoles: [...roles]
        .filter((role) => !present.some((item) => item.role === role) && ROLES[role])
        .slice(0, 4)
        .map((role) => ({ role, title: ROLES[role].title })),
    };
  }).sort((a, b) => b.houseCount - a.houseCount || b.density - a.density);
}

/** Карта города будущего: города × кварталы по интересам. */
export function cityOfFuture(businesses) {
  const cityMap = new Map();
  for (const house of businesses || []) {
    if (!house.atTable) continue;
    const key = cityKey(house.city) || "город не назван";
    if (!cityMap.has(key)) cityMap.set(key, { key, city: house.city || key, houses: [] });
    cityMap.get(key).houses.push(house);
  }
  const cities = [...cityMap.values()]
    .map((row) => {
      const quarters = quartersOfCity(row.city, row.houses);
      const alive = quarters.filter((item) => item.houseCount > 0);
      return {
        key: row.key,
        city: row.city,
        houseCount: row.houses.length,
        quarterCount: alive.length,
        strongest: alive[0] || null,
        quarters,
      };
    })
    .sort((a, b) => b.houseCount - a.houseCount);

  return {
    vision: "Следующий этап платформы. Сейчас главный продукт — обмен клиентами между бизнесами со смежной аудиторией.",
    motto: "Раздел в зачаточном виде. Не влияет на ежедневный обмен базами и рассылки.",
    quarters: QUARTERS,
    cities,
  };
}
