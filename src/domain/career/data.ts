import type { CareerLevelId, CareerRequirement, CareerState } from "./types";

interface CareerLevelDef {
  id: CareerLevelId;
  title: string;
  description: string;
  requiredPercent: number;
  icon: string;
  color: string;
  /** Requirements needed to advance FROM this level to the next. */
  requirements: Omit<CareerRequirement, "done">[];
}

/** Static career-path definitions (mock requirements; architecture-first). */
export const CAREER_LEVEL_DEFS: CareerLevelDef[] = [
  {
    id: "NEWCOMER",
    title: "Новичок",
    description: "Базовая адаптация и первое знакомство с MetroFitness.",
    requiredPercent: 100,
    icon: "Sparkles",
    color: "#f59e0b",
    requirements: [
      { id: "req-adaptation", label: "Пройти базовую адаптацию" },
      { id: "req-attestation", label: "Пройти итоговую аттестацию" },
      { id: "req-approval", label: "Получить подтверждение управляющего" },
    ],
  },
  {
    id: "MANAGER",
    title: "Менеджер",
    description: "Уверенная работа с клиентами и личный план.",
    requiredPercent: 100,
    icon: "BadgeCheck",
    color: "#3b82f6",
    requirements: [
      { id: "req-sales-academy", label: "Пройти Академию продаж" },
      { id: "req-personal-plan", label: "Выполнить личный план" },
      { id: "req-mystery", label: "Пройти тайного покупателя" },
    ],
  },
  {
    id: "TOP_MANAGER",
    title: "ТОП Менеджер",
    description: "Стабильные результаты и наставничество.",
    requiredPercent: 100,
    icon: "TrendingUp",
    color: "#8b5cf6",
    requirements: [
      { id: "req-streak-plan", label: "Выполнить план несколько месяцев подряд" },
      { id: "req-extra-courses", label: "Пройти дополнительные курсы" },
      { id: "req-achievements", label: "Получить необходимые достижения" },
    ],
  },
  {
    id: "LEADER",
    title: "Лидер",
    description: "Лидерство в клубе и развитие команды.",
    requiredPercent: 100,
    icon: "ShieldCheck",
    color: "#10b981",
    requirements: [
      { id: "req-team-results", label: "Обеспечить результат команды" },
      { id: "req-leadership", label: "Пройти программу лидерства" },
    ],
  },
  {
    id: "MANAGER_PRO",
    title: "Manager Pro",
    description: "Высший уровень мастерства Metro UP.",
    requiredPercent: 100,
    icon: "Award",
    color: "#eab308",
    requirements: [],
  },
];

/** Mock career state for the current employee (fresh newcomer). */
export const CURRENT_CAREER_STATE: CareerState = {
  currentLevelId: "NEWCOMER",
  completedRequirementIds: [],
};
