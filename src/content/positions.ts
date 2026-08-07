/** Employee roles available in the first release. */
export type PositionId = "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR";

export interface Position {
  id: PositionId;
  title: string;
  description: string;
  /** Icon name resolved in the UI layer. */
  icon: string;
}

export const POSITIONS: Position[] = [
  {
    id: "CLIENT_MANAGER",
    title: "Менеджер по работе с клиентами",
    description: "Продажи, работа с клиентами и сервис.",
    icon: "HeartHandshake",
  },
  {
    id: "NIGHT_MANAGER",
    title: "Ночной менеджер",
    description: "Работа с клиентами и клубом в ночную смену.",
    icon: "Moon",
  },
  {
    id: "ADMINISTRATOR",
    title: "Администратор",
    description: "Ресепшен, сервис и операционная работа клуба.",
    icon: "ClipboardCheck",
  },
];

const POSITION_IDS = new Set<string>(POSITIONS.map((p) => p.id));

export function getPositions(): Position[] {
  return POSITIONS;
}

export function getPositionById(id: string | null | undefined): Position | undefined {
  return id ? POSITIONS.find((p) => p.id === id) : undefined;
}

export function isValidPositionId(id: unknown): id is PositionId {
  return typeof id === "string" && POSITION_IDS.has(id);
}
