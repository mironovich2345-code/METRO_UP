import type { DailyTaskPriority, EmployeePosition } from "@prisma/client";

/**
 * Production-default STANDARD CLUB PLAN for CLIENT_MANAGER. These become
 * ClubTaskTemplates provisioned per club (idempotent, by stable `code`). They are
 * fully editable by the manager afterwards — provisioning never overwrites a
 * club's customization (see ensureClubDefaults). Checklist item ids are STABLE
 * (the identity is the id, never the text). No promo/campaign content here —
 * those are one-off manager tasks.
 */
export interface DefaultChecklistItem {
  id: string;
  text: string;
  required: boolean;
  order: number;
}
export interface ClubDefaultTemplate {
  code: string;
  title: string;
  description: string | null;
  targetPosition: EmployeePosition;
  required: boolean;
  priority: DailyTaskPriority;
  timeHint: string | null;
  defaultOrder: number;
  checklist: DefaultChecklistItem[];
}

const items = (code: string, texts: [string, boolean][]): DefaultChecklistItem[] =>
  texts.map(([text, required], i) => ({ id: `${code}-${i + 1}`, text, required, order: i + 1 }));

export const CLIENT_MANAGER_DEFAULTS: ClubDefaultTemplate[] = [
  {
    code: "CM_STD_ACCEPT_SHIFT",
    title: "Принять смену",
    description: null,
    targetPosition: "CLIENT_MANAGER",
    required: true,
    priority: "NORMAL",
    timeHint: null,
    defaultOrder: 1,
    checklist: items("accept", [
      ["Принять информацию от предыдущей смены", true],
      ["Проверить звонки и оплаты", true],
      ["Войти и проверить Craft", true],
      ["Проверить рабочую почту", true],
      ["Проверить рабочий телефон и пропущенные обращения", true],
    ]),
  },
  {
    code: "CM_STD_INBOUND",
    title: "Обработать входящие обращения",
    description: "Проверить и обработать новые обращения клиентов во всех рабочих каналах клуба. Это задача всей смены.",
    targetPosition: "CLIENT_MANAGER",
    required: true,
    priority: "NORMAL",
    timeHint: null,
    defaultOrder: 2,
    checklist: items("inbound", [
      ["Проверить ВК", true],
      ["Проверить Telegram", true],
      ["Проверить другие рабочие мессенджеры", true],
      ["Проверить заявки/обращения, поступившие за смену", true],
    ]),
  },
  {
    code: "CM_STD_HOT",
    title: "Отработать горячих клиентов",
    description: "Наиболее приоритетный sales-блок первой половины смены.",
    targetPosition: "CLIENT_MANAGER",
    required: true,
    priority: "HIGH",
    timeHint: "до 14:00",
    defaultOrder: 3,
    checklist: items("hot", [
      ["Брони", true],
      ["Вчерашние брони", true],
      ["Сегодняшние лиды", true],
      ["Рассрочка", true],
      ["АЗ", true],
    ]),
  },
  {
    code: "CM_STD_PLANS",
    title: "Отработать планы и наработки",
    description: null,
    targetPosition: "CLIENT_MANAGER",
    required: true,
    priority: "NORMAL",
    timeHint: null,
    defaultOrder: 4,
    checklist: items("plans", [
      ["Проверить планы на сегодня", true],
      ["Отработать просроченные планы", true],
      ["Отработать наработки предыдущих дней", true],
      ["Проверить, кого ожидаем сегодня", true],
    ]),
  },
  {
    code: "CM_STD_RENEWALS",
    title: "Отработать базу продлений",
    description: "Работа с клиентами, у которых приближается окончание клубной карты.",
    targetPosition: "CLIENT_MANAGER",
    required: true,
    priority: "NORMAL",
    timeHint: null,
    defaultOrder: 5,
    checklist: items("renew", [
      ["Проверить актуальную базу продлений", true],
      ["Выполнить запланированные звонки", true],
      ["Зафиксировать результат работы", true],
    ]),
  },
  {
    code: "CM_STD_OLDBASE",
    title: "Вернуть клиентов из старой базы",
    description: null,
    targetPosition: "CLIENT_MANAGER",
    required: false, // secondary — the manager may disable it
    priority: "NORMAL",
    timeHint: null,
    defaultOrder: 6,
    checklist: items("oldbase", [
      ["Поднять старые переписки", true],
      ["Уточнить, занимается ли клиент сейчас", true],
      ["Уточнить, актуально ли приобретение клубной карты", true],
      ["Зафиксировать результат контакта", true],
    ]),
  },
  {
    code: "CM_STD_CLOSE_SHIFT",
    title: "Закрыть смену",
    description: null,
    targetPosition: "CLIENT_MANAGER",
    required: true,
    priority: "NORMAL",
    timeHint: null,
    defaultOrder: 7,
    checklist: items("close", [
      ["Передать важную информацию следующей смене", true],
      ["Передать результаты необходимых прозвонов/работы", true],
      ["Выйти из рабочих систем, где это требуется регламентом", true],
      ["Проверить рабочее место", true],
      ["Убедиться, что важные обращения не остались без передачи", true],
    ]),
  },
];
