/**
 * Pure checklist completion rule (no DB / server-only) so it is unit-testable.
 * A checklist task is COMPLETED when every REQUIRED item is done. If the
 * checklist has no required items, all items must be done.
 */
export function isChecklistComplete(items: { required: boolean; done: boolean }[]): boolean {
  if (items.length === 0) return false;
  const required = items.filter((i) => i.required);
  const base = required.length > 0 ? required : items;
  return base.every((i) => i.done);
}
