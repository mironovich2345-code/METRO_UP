import type { LucideIcon } from "lucide-react";

/** Career ladder tiers, in ascending order. */
export type RankId =
  | "novice"
  | "manager"
  | "top-manager"
  | "leader"
  | "director";

export interface Rank {
  id: RankId;
  title: string;
  /** Minimum total XP required to hold this rank. */
  minXp: number;
  /** Short flavour line shown on the level card. */
  tagline: string;
}

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

export interface City {
  id: string;
  name: string;
  clubsCount: number;
}

export interface Club {
  id: string;
  cityId: string;
  name: string;
  address: string;
}

export interface Position {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface UserProfile {
  displayName: string;
  cityId: string | null;
  clubId: string | null;
  positionId: string | null;
  xp: number;
  streak: number;
}

export type CourseCategory = "sales" | "service" | "product" | "brand";

export interface Course {
  id: string;
  title: string;
  category: CourseCategory;
  icon: LucideIcon;
  totalLessons: number;
  completedLessons: number;
  /** Tailwind-ready accent used for the course tile glyph. */
  accent: string;
}

export interface DailyTask {
  id: string;
  title: string;
  xp: number;
  done: boolean;
  durationMin: number;
}

export interface RankingEntry {
  id: string;
  name: string;
  xp: number;
  position: number;
  isCurrentUser?: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  tag: string;
  date: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  earnedAt: string;
}

export interface MysteryShopperResult {
  score: number;
  date: string;
  club: string;
  highlights: string[];
}
