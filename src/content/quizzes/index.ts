import type { Quiz } from "@/content/types";

/**
 * Placeholder quizzes. Questions are short and safe; correct answers are marked
 * so the model is complete, but no real assessment logic ships yet.
 */

export const QUIZ_DAY_1: Quiz = {
  id: "quiz-day-1",
  slug: "day-1-test",
  title: "Тест дня 1 — Знакомство с Metro",
  passingScore: 80,
  questions: [
    {
      id: "q1-1",
      question: "Что такое Metro UP?",
      options: [
        "Академия и адаптация команды MetroFitness",
        "Программа лояльности для гостей",
        "Мобильная касса",
      ],
      correctIndex: 0,
    },
    {
      id: "q1-2",
      question: "Сколько дней длится базовая адаптация?",
      options: ["1 день", "3 дня", "7 дней"],
      correctIndex: 1,
    },
    {
      id: "q1-3",
      question: "Что в центре миссии MetroFitness?",
      options: ["Забота о клиенте и результат", "Только продажи", "Только оборудование"],
      correctIndex: 0,
    },
  ],
};

export const QUIZ_DAY_2: Quiz = {
  id: "quiz-day-2",
  slug: "day-2-test",
  title: "Тест дня 2 — Знание продукта",
  passingScore: 80,
  questions: [
    {
      id: "q2-1",
      question: "Что входит в клубную карту?",
      options: [
        "Доступ к зонам клуба и групповым программам",
        "Только персональные тренировки",
        "Только кафе",
      ],
      correctIndex: 0,
    },
    {
      id: "q2-2",
      question: "К какой зоне относится силовая рама?",
      options: ["Кардио-зона", "Зона свободных весов", "Ресепшн"],
      correctIndex: 1,
    },
    {
      id: "q2-3",
      question: "Metro Cycle — это:",
      options: ["Групповая сайкл-тренировка", "Вид клубной карты", "Тренажёр для спины"],
      correctIndex: 0,
    },
  ],
};

export const QUIZ_DAY_3: Quiz = {
  id: "quiz-day-3",
  slug: "day-3-test",
  title: "Тест дня 3 — Стандарты работы",
  passingScore: 80,
  questions: [
    {
      id: "q3-1",
      question: "Каким должен быть внешний вид сотрудника?",
      options: ["Опрятным по корпоративному стандарту", "На своё усмотрение", "Спортивным только в зале"],
      correctIndex: 0,
    },
    {
      id: "q3-2",
      question: "Craft в MetroFitness — это:",
      options: ["Рабочая система сотрудника", "Название клуба", "Групповая программа"],
      correctIndex: 0,
    },
    {
      id: "q3-3",
      question: "Что важно при работе с кассой и отчётностью?",
      options: ["Точность и соблюдение регламента", "Скорость любой ценой", "Ничего из перечисленного"],
      correctIndex: 0,
    },
  ],
};

export const QUIZ_FINAL_ATTESTATION: Quiz = {
  id: "quiz-final-attestation",
  slug: "final-attestation",
  title: "Итоговая аттестация адаптации",
  passingScore: 90,
  isAttestation: true,
  questions: [
    {
      id: "qf-1",
      question: "Сколько дней в базовой адаптации Metro UP?",
      options: ["3", "5", "10"],
      correctIndex: 0,
    },
    {
      id: "qf-2",
      question: "Что открывает доступ к остальной Академии?",
      options: [
        "Аттестация и подтверждение управляющим",
        "Оплата подписки",
        "Ничего — всё открыто сразу",
      ],
      correctIndex: 0,
    },
    {
      id: "qf-3",
      question: "Главный принцип общения с клиентами:",
      options: ["Вежливость и забота", "Формальность", "Экономия времени"],
      correctIndex: 0,
    },
  ],
};

export const QUIZZES: Quiz[] = [
  QUIZ_DAY_1,
  QUIZ_DAY_2,
  QUIZ_DAY_3,
  QUIZ_FINAL_ATTESTATION,
];

export function quizById(id: string): Quiz | undefined {
  return QUIZZES.find((q) => q.id === id);
}
