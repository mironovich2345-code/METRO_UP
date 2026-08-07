import "server-only";
import { prisma } from "./db";

/**
 * DB-backed access to the club network. The database is the source of truth;
 * the static `src/content/cities` list is only a seed definition. All UI reads
 * flow through this abstraction (directly or via the API), so the static list
 * can later be removed without UI changes.
 */

export interface NetworkClubDTO {
  id: string;
  name: string;
  address: string;
  landmark: string | null;
}
export interface NetworkCityDTO {
  id: string;
  name: string;
  clubs: NetworkClubDTO[];
}

/** Active cities with their active clubs, alphabetical. */
export async function getNetworkCities(): Promise<NetworkCityDTO[]> {
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      clubs: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, landmark: true },
      },
    },
  });
  return cities.map((c) => ({
    id: c.id,
    name: c.name,
    clubs: c.clubs,
  }));
}

export type ClubSelectionCheck =
  | { ok: true }
  | { ok: false; field: "cityId" | "clubId"; message: string };

/**
 * Validate a city/club selection against the live network:
 * city exists & active, club exists & active, and club belongs to the city.
 * Moscow (and any club absent from the DB) fails here — it isn't in the network.
 */
export async function checkClubSelection(
  cityId: string,
  clubId: string,
): Promise<ClubSelectionCheck> {
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city || !city.isActive) {
    return { ok: false, field: "cityId", message: "Город не найден или недоступен" };
  }
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club || !club.isActive) {
    return { ok: false, field: "clubId", message: "Клуб не найден или недоступен" };
  }
  if (club.cityId !== cityId) {
    return {
      ok: false,
      field: "clubId",
      message: "Клуб не относится к выбранному городу",
    };
  }
  return { ok: true };
}
