/**
 * Analytics seam. Nothing is sent anywhere yet — this is the single, typed
 * place future onboarding events will be dispatched from.
 */
export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_name_changed"
  | "onboarding_city_selected"
  | "onboarding_club_selected"
  | "onboarding_position_selected"
  | "onboarding_completed";

interface TrackedEvent {
  event: OnboardingEvent;
  payload?: Record<string, unknown>;
  at: number;
}

const buffer: TrackedEvent[] = [];

export function trackEvent(
  event: OnboardingEvent,
  payload?: Record<string, unknown>,
): void {
  buffer.push({ event, payload, at: Date.now() });
  if (buffer.length > 50) buffer.shift();
  // Intentionally not dispatched anywhere yet.
}

/** For debugging / future flush. */
export function getTrackedEvents(): TrackedEvent[] {
  return [...buffer];
}
