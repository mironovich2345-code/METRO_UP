import {
  Award,
  BadgeCheck,
  Bike,
  BookOpen,
  Cable,
  ClipboardCheck,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  GraduationCap,
  HeartHandshake,
  Sparkles,
  ShieldCheck,
  StretchHorizontal,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * Resolve a content icon name (string) to a Lucide component. Keeps the content
 * layer free of React/icon imports while the UI stays fully typed.
 */
const ICONS: Record<string, LucideIcon> = {
  Award,
  BadgeCheck,
  Bike,
  BookOpen,
  Cable,
  ClipboardCheck,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  GraduationCap,
  HeartHandshake,
  Sparkles,
  ShieldCheck,
  StretchHorizontal,
  TrendingUp,
};

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? BookOpen;
}
