const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** Human month + year, e.g. "Август 2026". */
export function ruMonthYear(month: number, year: number): string {
  return `${MONTHS_RU[month - 1] ?? month} ${year}`;
}
