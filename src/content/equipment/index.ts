import type { Equipment } from "@/content/types";

/** Placeholder equipment catalogue referenced by EQUIPMENT_CARD blocks. */
export const EQUIPMENT: Equipment[] = [
  {
    id: "eq-treadmill",
    slug: "treadmill",
    name: "Беговая дорожка",
    zone: "Кардио-зона",
    summary: "Базовое кардио: разминка, интервалы, восстановление.",
    icon: "Footprints",
  },
  {
    id: "eq-rack",
    slug: "power-rack",
    name: "Силовая рама",
    zone: "Зона свободных весов",
    summary: "Приседания, жимы и тяги со страховкой.",
    icon: "Dumbbell",
  },
  {
    id: "eq-cable",
    slug: "cable-machine",
    name: "Кроссовер",
    zone: "Зона тренажёров",
    summary: "Изоляция мышц и работа на блоках.",
    icon: "Cable",
  },
  {
    id: "eq-bike",
    slug: "spin-bike",
    name: "Сайкл-велотренажёр",
    zone: "Зона групповых программ",
    summary: "Групповые сайкл-тренировки и интервалы.",
    icon: "Bike",
  },
];

export function equipmentById(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
