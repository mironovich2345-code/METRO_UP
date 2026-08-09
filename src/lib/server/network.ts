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

/** Machine-readable reason a city/club selection was rejected (client-safe). */
export type ClubSelectionCode =
  | "CITY_NOT_FOUND"
  | "CITY_INACTIVE"
  | "CLUB_NOT_FOUND"
  | "CLUB_INACTIVE"
  | "CLUB_CITY_MISMATCH";

/** Non-sensitive booleans describing which network check failed (for logging). */
export interface ClubSelectionDiagnostics {
  cityExists: boolean;
  cityActive: boolean;
  clubExists: boolean;
  clubActive: boolean;
  clubBelongsToCity: boolean;
}

export type ClubSelectionCheck =
  | { ok: true; diagnostics: ClubSelectionDiagnostics }
  | {
      ok: false;
      code: ClubSelectionCode;
      field: "cityId" | "clubId";
      message: string;
      diagnostics: ClubSelectionDiagnostics;
    };

/**
 * Validate a city/club selection against the live network:
 * city exists & active, club exists & active, and club belongs to the city.
 * Moscow (and any club absent from the DB) fails here — it isn't in the network.
 *
 * Behaviour (which selections pass/fail) is unchanged; the result now also
 * carries a machine-readable `code` and non-sensitive `diagnostics` flags so the
 * cause of a 400 is visible without leaking internals.
 */
export async function checkClubSelection(
  cityId: string,
  clubId: string,
): Promise<ClubSelectionCheck> {
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  const club = await prisma.club.findUnique({ where: { id: clubId } });

  const diagnostics: ClubSelectionDiagnostics = {
    cityExists: city !== null,
    cityActive: city?.isActive ?? false,
    clubExists: club !== null,
    clubActive: club?.isActive ?? false,
    clubBelongsToCity: club !== null && club.cityId === cityId,
  };

  if (!city) {
    return { ok: false, code: "CITY_NOT_FOUND", field: "cityId", message: "Город не найден", diagnostics };
  }
  if (!city.isActive) {
    return { ok: false, code: "CITY_INACTIVE", field: "cityId", message: "Город недоступен", diagnostics };
  }
  if (!club) {
    return { ok: false, code: "CLUB_NOT_FOUND", field: "clubId", message: "Клуб не найден", diagnostics };
  }
  if (!club.isActive) {
    return { ok: false, code: "CLUB_INACTIVE", field: "clubId", message: "Клуб недоступен", diagnostics };
  }
  if (club.cityId !== cityId) {
    return {
      ok: false,
      code: "CLUB_CITY_MISMATCH",
      field: "clubId",
      message: "Клуб не относится к выбранному городу",
      diagnostics,
    };
  }
  return { ok: true, diagnostics };
}
