import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECENT_GAMES,
  recordRecentGameId,
  removeRecentGameId
} from './recentGames';

const VALID_IDS = new Set(['mlbb', 'ff', 'pubg', 'pb', 'hok', 'valorant', 'genshin', 'codm', 'roblox', 'steam']);

test('recordRecentGameId prepends new games, deduplicates, and caps at 5', () => {
  let list: string[] = [];
  list = recordRecentGameId(list, 'mlbb', VALID_IDS);
  list = recordRecentGameId(list, 'ff', VALID_IDS);
  list = recordRecentGameId(list, 'pubg', VALID_IDS);
  list = recordRecentGameId(list, 'pb', VALID_IDS);
  list = recordRecentGameId(list, 'valorant', VALID_IDS);
  assert.deepEqual(list, ['valorant', 'pb', 'pubg', 'ff', 'mlbb']);
  assert.equal(list.length, MAX_RECENT_GAMES);

  // Adding a 6th distinct game evicts the oldest ('mlbb')
  list = recordRecentGameId(list, 'genshin', VALID_IDS);
  assert.deepEqual(list, ['genshin', 'valorant', 'pb', 'pubg', 'ff']);
  assert.equal(list.length, 5);

  // Re-visiting an existing game moves it to front without changing length
  list = recordRecentGameId(list, 'pubg', VALID_IDS);
  assert.deepEqual(list, ['pubg', 'genshin', 'valorant', 'pb', 'ff']);
});

test('recordRecentGameId ignores unknown IDs and removeRecentGameId deletes targeted entry', () => {
  const initial = ['mlbb', 'ff', 'pubg'];
  assert.deepEqual(recordRecentGameId(initial, 'nonexistent', VALID_IDS), initial);
  assert.deepEqual(removeRecentGameId(initial, 'ff'), ['mlbb', 'pubg']);
});
