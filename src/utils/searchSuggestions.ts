import type { GameConfig } from '../data/games';

export interface GameSuggestion {
  game: GameConfig;
  score: number;
  matchedNominal?: string;
}

export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

/**
 * Computes real-time ranked autocomplete suggestions across game titles,
 * short names, publishers, categories, currency units, and top-up item labels.
 */
export function getGameSuggestions(
  games: readonly GameConfig[],
  rawQuery: string,
  limit = 6
): GameSuggestion[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const scored: GameSuggestion[] = [];

  for (const game of games) {
    const name = game.name.toLowerCase();
    const shortName = game.shortName.toLowerCase();
    const id = game.id.toLowerCase();
    const publisher = game.publisher.toLowerCase();
    const category = game.categoryLabel.toLowerCase();
    const currency = game.currencyUnit.toLowerCase();

    let score = 0;
    let matchedNominal: string | undefined;

    if (name.startsWith(q) || shortName.startsWith(q) || id === q) {
      score = 100;
    } else if (
      name.split(/[\s:]+/).some((word) => word.startsWith(q)) ||
      shortName.split(/[\s:]+/).some((word) => word.startsWith(q)) ||
      id.startsWith(q)
    ) {
      score = 85;
    } else if (name.includes(q) || shortName.includes(q)) {
      score = 70;
    } else if (currency.startsWith(q) || publisher.startsWith(q) || category.startsWith(q)) {
      score = 55;
    } else if (currency.includes(q) || publisher.includes(q) || category.includes(q)) {
      score = 45;
    } else {
      const nom = game.nominals.find((n) => n.label.toLowerCase().includes(q));
      if (nom) {
        score = 35;
        matchedNominal = nom.label;
      }
    }

    if (score > 0) {
      scored.push({ game, score, matchedNominal });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.game.name.localeCompare(b.game.name);
  });

  return scored.slice(0, limit);
}

/**
 * Splits a label into highlighted and non-highlighted segments for safe React rendering.
 */
export function splitHighlightSegments(text: string, rawQuery: string): HighlightSegment[] {
  const q = rawQuery.trim();
  if (!q) return [{ text, highlight: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) {
    return [{ text, highlight: false }];
  }

  const segments: HighlightSegment[] = [];
  if (idx > 0) {
    segments.push({ text: text.slice(0, idx), highlight: false });
  }
  segments.push({ text: text.slice(idx, idx + q.length), highlight: true });
  if (idx + q.length < text.length) {
    segments.push({ text: text.slice(idx + q.length), highlight: false });
  }

  return segments;
}
