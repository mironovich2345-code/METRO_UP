import type { MetricDocCategoryDTO } from "@/lib/api/metric-types";

/** Russian labels + ordering for Metric document categories (client + server). */
export const DOC_CATEGORY_LABEL: Record<MetricDocCategoryDTO, string> = {
  TRAINING_MANUAL: "Учебное пособие",
  CLUB_RULES: "Правила клуба",
  WORK_REGULATION: "Рабочий регламент",
  CONTRACT_TEMPLATE: "Шаблон договора",
  SALES_MATERIAL: "Материал по продажам",
  FINANCE_CASH: "Финансы/касса",
  REFUNDS: "Возвраты",
  HR: "Кадры",
  OTHER: "Прочее",
};

export const DOC_CATEGORIES = Object.keys(DOC_CATEGORY_LABEL) as MetricDocCategoryDTO[];
