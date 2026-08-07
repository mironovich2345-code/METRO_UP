import type { City } from "@/content/types";

export const CITIES: City[] = [
  { id: "moscow", name: "Москва", clubsCount: 24 },
  { id: "spb", name: "Санкт-Петербург", clubsCount: 12 },
  { id: "kazan", name: "Казань", clubsCount: 5 },
  { id: "ekb", name: "Екатеринбург", clubsCount: 6 },
  { id: "novosibirsk", name: "Новосибирск", clubsCount: 4 },
  { id: "krasnodar", name: "Краснодар", clubsCount: 3 },
];

export function cityById(id: string | null): City | undefined {
  return id ? CITIES.find((c) => c.id === id) : undefined;
}
