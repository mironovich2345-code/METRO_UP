import { PrismaClient } from "@prisma/client";

/**
 * MANUAL, idempotent content smoke-seed (NOT wired to `prisma db seed`, which
 * seeds only cities/clubs). Creates a DRAFT "Как устроено обучение в Metro UP"
 * program → day → course → lesson with info-cards + a draft quiz, but NO video
 * (video is always uploaded by a human via the CMS). Run:  tsx prisma/seed-content.ts
 */
const prisma = new PrismaClient();
const SLUG = "kak-ustroeno-obuchenie-v-metro-up";

async function main() {
  const admin =
    (await prisma.user.findFirst({ where: { role: "ADMIN" } })) ??
    (await prisma.user.findFirst());
  if (!admin) {
    console.error("No users found. Sign in via Telegram first, then grant ADMIN.");
    process.exit(1);
  }

  const existingLesson = await prisma.lesson.findUnique({ where: { slug: SLUG } });
  if (existingLesson) {
    console.log("Smoke lesson already exists (idempotent). Slug:", SLUG);
    return;
  }

  const program = await prisma.trainingProgram.create({
    data: {
      title: "Адаптация Metro UP",
      description: "Базовая адаптация новых сотрудников",
      status: "DRAFT",
      order: 1,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const day = await prisma.trainingDay.create({
    data: { programId: program.id, title: "Знакомство с Metro", dayNumber: 1, order: 1 },
  });
  const course = await prisma.course.create({
    data: { programId: program.id, trainingDayId: day.id, title: "Введение", order: 1 },
  });
  const lesson = await prisma.lesson.create({
    data: {
      courseId: course.id,
      title: "Как устроено обучение в Metro UP",
      slug: SLUG,
      shortDescription: "С чего начать и как проходить уроки",
      durationMinutes: 5,
      xpReward: 50, // editable in the CMS — not hardcoded in logic
      isRequired: true,
      order: 1,
      status: "DRAFT",
    },
  });

  const cards = [
    { title: "Добро пожаловать", text: "Metro UP — это твой путь развития в MetroFitness.", variant: "TIP" },
    { title: "Как проходить уроки", text: "Смотри видео, читай карточки, проходи тест.", variant: "DEFAULT" },
    { title: "XP и прогресс", text: "За завершённые уроки начисляется XP. Это личный прогресс.", variant: "IMPORTANT" },
    { title: "Последовательность", text: "Следующий урок открывается после завершения предыдущего.", variant: "DEFAULT" },
  ];
  await prisma.lessonBlock.create({ data: { lessonId: lesson.id, type: "VIDEO", order: 1, data: {} } });
  for (const [i, c] of cards.entries()) {
    await prisma.lessonBlock.create({
      data: { lessonId: lesson.id, type: "INFO_CARD", order: i + 2, data: c },
    });
  }
  await prisma.lessonBlock.create({
    data: {
      lessonId: lesson.id, type: "SUMMARY", order: cards.length + 2,
      data: { title: "Итоги", points: ["Ты знаешь, как устроено обучение", "Готов начать первый курс"] },
    },
  });

  const quiz = await prisma.quiz.create({
    data: { lessonId: lesson.id, title: "Проверка знаний", passingPercent: 70, xpReward: 0, status: "DRAFT" },
  });
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id, text: "На что влияет XP?", type: "SINGLE_CHOICE", order: 1,
      explanation: "XP отражает личный прогресс обучения.",
      options: {
        create: [
          { text: "На личный прогресс обучения", isCorrect: true, order: 1 },
          { text: "На зарплату", isCorrect: false, order: 2 },
          { text: "На рейтинг клуба", isCorrect: false, order: 3 },
        ],
      },
    },
  });

  console.log("Smoke content created (DRAFT). Lesson slug:", SLUG);
  console.log("Add a video in the CMS, then Publish.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("seed-content failed:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
