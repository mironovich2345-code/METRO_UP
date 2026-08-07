import type { Club } from "@/content/types";

export const CLUBS: Club[] = [
  { id: "msk-city", cityId: "moscow", name: "Metro City", address: "Пресненская наб., 12" },
  { id: "msk-arbat", cityId: "moscow", name: "Metro Arbat", address: "ул. Новый Арбат, 21" },
  { id: "msk-sokol", cityId: "moscow", name: "Metro Sokol", address: "Ленинградский пр., 74" },
  { id: "msk-vdnh", cityId: "moscow", name: "Metro VDNH", address: "пр. Мира, 119" },
  { id: "spb-nevsky", cityId: "spb", name: "Metro Nevsky", address: "Невский пр., 88" },
  { id: "spb-moskovsky", cityId: "spb", name: "Metro Moskovsky", address: "Московский пр., 210" },
  { id: "kzn-kremlin", cityId: "kazan", name: "Metro Kremlin", address: "ул. Баумана, 44" },
  { id: "ekb-plaza", cityId: "ekb", name: "Metro Plaza", address: "ул. Малышева, 5" },
  { id: "nsk-center", cityId: "novosibirsk", name: "Metro Center", address: "Красный пр., 101" },
  { id: "krd-park", cityId: "krasnodar", name: "Metro Park", address: "ул. Красная, 176" },
];

export function clubsForCity(cityId: string | null): Club[] {
  if (!cityId) return [];
  return CLUBS.filter((club) => club.cityId === cityId);
}

export function clubById(id: string | null): Club | undefined {
  return id ? CLUBS.find((c) => c.id === id) : undefined;
}
