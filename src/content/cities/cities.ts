/**
 * Real MetroFitness network — cities and their clubs.
 * Moscow is intentionally NOT part of the network and must never appear here.
 *
 * Clubs are nested under their city. Identifiers are stable slugs; names and
 * addresses are display-only and are always resolved from these ids.
 */

export interface Club {
  id: string;
  name: string;
  address: string;
  landmark?: string;
  isActive: boolean;
}

export interface City {
  id: string;
  name: string;
  clubs: Club[];
}

export const CITIES: City[] = [
  {
    id: "barnaul",
    name: "Барнаул",
    clubs: [
      { id: "barnaul-krasnoarmeyskiy-26", name: "Красноармейский", address: "пр. Красноармейский, 26", isActive: true },
    ],
  },
  {
    id: "volgograd",
    name: "Волгоград",
    clubs: [
      { id: "volgograd-nevskaya-10b", name: "Невская", address: "ул. Невская, 10Б", isActive: true },
    ],
  },
  {
    id: "voronezh",
    name: "Воронеж",
    clubs: [
      { id: "voronezh-pobedy-50", name: "Бульвар Победы", address: "б-р Победы, 50", isActive: true },
      { id: "voronezh-leninskiy-158-2", name: "Ленинский", address: "Ленинский проспект, 158/2", isActive: true },
    ],
  },
  {
    id: "dzerzhinsk",
    name: "Дзержинск",
    clubs: [
      { id: "dzerzhinsk-tsiolkovskogo-76a", name: "Циолковского", address: "проспект Циолковского, 76А", isActive: true },
    ],
  },
  {
    id: "yekaterinburg",
    name: "Екатеринбург",
    clubs: [
      { id: "yekaterinburg-amundsena-63", name: "Амундсена", address: "ул. Амундсена, 63", landmark: "ТРЦ «Гранат»", isActive: true },
      { id: "yekaterinburg-mashinostroiteley-22", name: "Машиностроителей", address: "ул. Машиностроителей, 22", isActive: true },
      { id: "yekaterinburg-uralskaya-61a", name: "Уральская", address: "ул. Уральская, 61А", isActive: true },
      { id: "yekaterinburg-kraulya-63", name: "Крауля", address: "ул. Крауля, 63", isActive: true },
      { id: "yekaterinburg-khalturina-55", name: "Халтурина", address: "ул. Халтурина, 55", landmark: "ТРЦ «Карнавал», 3 этаж", isActive: true },
    ],
  },
  {
    id: "krasnoyarsk",
    name: "Красноярск",
    clubs: [
      { id: "krasnoyarsk-krasnodarskaya-8", name: "Краснодарская", address: "ул. Краснодарская, 8", isActive: true },
      { id: "krasnoyarsk-krasnoy-armii-10", name: "Красной Армии", address: "ул. Красной Армии, 10", landmark: "ТК «Квант»", isActive: true },
    ],
  },
  {
    id: "kemerovo",
    name: "Кемерово",
    clubs: [
      { id: "kemerovo-oktyabrskiy-34", name: "Октябрьский", address: "проспект Октябрьский, 34", isActive: true },
      { id: "kemerovo-shakhterov-87", name: "Шахтёров", address: "проспект Шахтёров, 87", landmark: "ТЦ «Север»", isActive: true },
    ],
  },
  {
    id: "lipetsk",
    name: "Липецк",
    clubs: [
      { id: "lipetsk-stakhanova-36", name: "Стаханова", address: "ул. Стаханова, 36", isActive: true },
    ],
  },
  {
    id: "novokuznetsk",
    name: "Новокузнецк",
    clubs: [
      { id: "novokuznetsk-kirova-55", name: "Кирова", address: "ул. Кирова, 55", landmark: "ТРЦ «Сити Молл»", isActive: true },
    ],
  },
  {
    id: "novosibirsk",
    name: "Новосибирск",
    clubs: [
      { id: "novosibirsk-karla-marksa-47-2", name: "Карла Маркса", address: "проспект Карла Маркса, 47/2", isActive: true },
      { id: "novosibirsk-frunze-71-1", name: "Фрунзе", address: "ул. Фрунзе, 71/1", isActive: true },
      { id: "novosibirsk-krasnyy-182", name: "Красный проспект", address: "Красный проспект, 182", isActive: true },
    ],
  },
  {
    id: "nizhny-novgorod",
    name: "Нижний Новгород",
    clubs: [
      { id: "nizhny-novgorod-poltavskaya-30", name: "Полтавская", address: "ул. Полтавская, 30", isActive: true },
    ],
  },
  {
    id: "nizhny-tagil",
    name: "Нижний Тагил",
    clubs: [
      { id: "nizhny-tagil-yunosti-16a", name: "Юности", address: "ул. Юности, 16А", isActive: true },
    ],
  },
  {
    id: "omsk",
    name: "Омск",
    clubs: [
      { id: "omsk-70-let-oktyabrya-12-1", name: "70 лет Октября", address: "ул. 70 лет Октября, 12/1", landmark: "ТЦ «Планета Дом»", isActive: true },
      { id: "omsk-maslennikova-19", name: "Масленникова", address: "ул. Масленникова, 19", isActive: true },
      { id: "omsk-zaozernaya-15", name: "Заозёрная", address: "ул. Заозёрная, 15", isActive: true },
      { id: "omsk-mira-42-1", name: "Мира", address: "проспект Мира, 42к1", landmark: "ТК «Европа»", isActive: true },
    ],
  },
  {
    id: "ryazan",
    name: "Рязань",
    clubs: [
      { id: "ryazan-vasilevskaya-7", name: "Васильевская", address: "ул. Васильевская, 7", isActive: true },
      { id: "ryazan-chapaeva-56", name: "Чапаева", address: "ул. Чапаева, 56", isActive: true },
    ],
  },
  {
    id: "samara",
    name: "Самара",
    clubs: [
      { id: "samara-revolyutsionnaya-64b", name: "Революционная", address: "ул. Революционная, 64Б", isActive: true },
      { id: "samara-novo-sadovaya-381-1", name: "Ново-Садовая", address: "ул. Ново-Садовая, 381к1", landmark: "ТЦ Gold", isActive: true },
      { id: "samara-kirova-147", name: "Кирова", address: "проспект Кирова, 147", landmark: "ТЦ «Вива Лэнд»", isActive: true },
    ],
  },
  {
    id: "saratov",
    name: "Саратов",
    clubs: [
      { id: "saratov-moskovskaya-129-133", name: "Московская", address: "ул. Московская, 129/133", isActive: true },
      { id: "saratov-tarkhova-58", name: "Тархова", address: "ул. С. Ф. Тархова, 58", isActive: true },
    ],
  },
  {
    id: "saint-petersburg",
    name: "Санкт-Петербург",
    clubs: [
      { id: "spb-lunacharskogo-11-1", name: "Луначарского", address: "проспект Луначарского, 11к1", isActive: true },
      { id: "spb-kolomyazhskiy-19-2", name: "Коломяжский", address: "Коломяжский проспект, 19к2", landmark: "ТЦ «Капитолий»", isActive: true },
      { id: "spb-pyatiletok-1a", name: "Пятилеток", address: "проспект Пятилеток, 1, лит. А", landmark: "Ледовый дворец", isActive: true },
    ],
  },
  {
    id: "tula",
    name: "Тула",
    clubs: [
      { id: "tula-lozhevaya-125a", name: "Ложевая", address: "ул. Ложевая, 125А", landmark: "ТЦ «Пролетарский»", isActive: true },
    ],
  },
  {
    id: "tomsk",
    name: "Томск",
    clubs: [
      { id: "tomsk-krasnoarmeyskaya-101a", name: "Красноармейская", address: "ул. Красноармейская, 101А", isActive: true },
      { id: "tomsk-irkutskiy-trakt-68", name: "Иркутский тракт", address: "Иркутский тракт, 68", isActive: true },
    ],
  },
  {
    id: "tyumen",
    name: "Тюмень",
    clubs: [
      { id: "tyumen-artamonova-8", name: "Артамонова", address: "ул. Артамонова, 8", isActive: true },
      { id: "tyumen-yamskaya-118", name: "Ямская", address: "ул. Ямская, 118", isActive: true },
    ],
  },
  {
    id: "ufa",
    name: "Уфа",
    clubs: [
      { id: "ufa-mendeleeva-137", name: "Менделеева", address: "ул. Менделеева, 137", landmark: "ТРК «Иремель»", isActive: true },
      { id: "ufa-gagarina-1-3", name: "Гагарина", address: "ул. Гагарина, 1/3", landmark: "ТЦ «Олимп»", isActive: true },
      { id: "ufa-kosmonavtov-12", name: "Космонавтов", address: "ул. Космонавтов, 12", isActive: true },
      { id: "ufa-zorge-12-2", name: "Рихарда Зорге", address: "ул. Рихарда Зорге, 12/2", landmark: "ТЦ «Галле»", isActive: true },
    ],
  },
  {
    id: "chelyabinsk",
    name: "Челябинск",
    clubs: [
      { id: "chelyabinsk-molodogvardeytsev-55a", name: "Молодогвардейцев", address: "ул. Молодогвардейцев, 55А", isActive: true },
      { id: "chelyabinsk-yuzhnyy-bulvar-2a", name: "Южный бульвар", address: "Южный бульвар, 2А", isActive: true },
      { id: "chelyabinsk-salyutnaya-27", name: "Салютная", address: "ул. Салютная, 27", isActive: true },
      { id: "chelyabinsk-lenina-86", name: "Ленина", address: "проспект Ленина, 86", isActive: true },
      { id: "chelyabinsk-stalevarov-5-3", name: "Сталеваров", address: "ул. Сталеваров, 5к3", isActive: true },
      { id: "chelyabinsk-pobedy-392", name: "Победы", address: "проспект Победы, 392", landmark: "2 этаж, вход со стороны ул. Чичерина", isActive: true },
    ],
  },
];

/* --------------------------------- Helpers -------------------------------- */

/** All cities that have at least one active club, sorted A→Я by name. */
export function getCities(): City[] {
  return CITIES.filter((c) => c.clubs.some((club) => club.isActive)).sort(
    (a, b) => a.name.localeCompare(b.name, "ru"),
  );
}

export function getCityById(cityId: string | null | undefined): City | undefined {
  if (!cityId) return undefined;
  return CITIES.find((c) => c.id === cityId);
}

/** Active clubs of a city, in declared order. */
export function getClubsByCityId(cityId: string | null | undefined): Club[] {
  const city = getCityById(cityId);
  if (!city) return [];
  return city.clubs.filter((club) => club.isActive);
}

export function getClubById(clubId: string | null | undefined): Club | undefined {
  if (!clubId) return undefined;
  for (const city of CITIES) {
    const club = city.clubs.find((c) => c.id === clubId && c.isActive);
    if (club) return club;
  }
  return undefined;
}

/** The city a club belongs to (active clubs only). */
export function getCityByClubId(clubId: string | null | undefined): City | undefined {
  if (!clubId) return undefined;
  return CITIES.find((city) =>
    city.clubs.some((c) => c.id === clubId && c.isActive),
  );
}

/** True only when the active club really belongs to the given city. */
export function isClubInCity(
  cityId: string | null | undefined,
  clubId: string | null | undefined,
): boolean {
  if (!cityId || !clubId) return false;
  const city = getCityById(cityId);
  return Boolean(city?.clubs.some((c) => c.id === clubId && c.isActive));
}
