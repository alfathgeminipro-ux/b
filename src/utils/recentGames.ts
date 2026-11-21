export const RECENT_GAMES_STORAGE_KEY = 'alstore_recent_games_v1';
export const MAX_RECENT_GAMES = 5;

/**
 * Records a game ID at the front of the recent list, deduplicates, filters
 * against valid catalog IDs, and caps the length to MAX_RECENT_GAMES (5).
 */
export function recordRecentGameId(
  existingIds: string[],
  gameId: string,
  validGameIds: ReadonlySet<string>,
  limit = MAX_RECENT_GAMES
): string[] {
  const cleanId = gameId.trim();
  if (!cleanId || !validGameIds.has(cleanId)) {
    return existingIds.filter((id) => validGameIds.has(id)).slice(0, limit);
  }
  const deduped = [cleanId, ...existingIds.filter((id) => id !== cleanId && validGameIds.has(id))];
  return deduped.slice(0, limit);
}

/**
 * Removes a single game ID from the recent list.
 */
export function removeRecentGameId(existingIds: string[], gameId: string): string[] {
  return existingIds.filter((id) => id !== gameId);
}

export function loadRecentGameIds(validGameIds: ReadonlySet<string>): string[] {
  try {
    const raw = localStorage.getItem(RECENT_GAMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string' && validGameIds.has(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item);
        if (result.length >= MAX_RECENT_GAMES) break;
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function saveRecentGameIds(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_GAMES_STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_GAMES)));
  } catch {
    // ignore storage quota errors
  }
}
