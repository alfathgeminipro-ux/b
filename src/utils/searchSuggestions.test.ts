import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES_CATALOG } from '../data/games';
import { getGameSuggestions, splitHighlightSegments } from './searchSuggestions';

test('getGameSuggestions returns empty array for empty or whitespace query', () => {
  assert.deepEqual(getGameSuggestions(GAMES_CATALOG, ''), []);
  assert.deepEqual(getGameSuggestions(GAMES_CATALOG, '   '), []);
});

test('getGameSuggestions prioritizes prefix matches over word/substring matches', () => {
  const moResults = getGameSuggestions(GAMES_CATALOG, 'mo');
  assert.ok(moResults.length >= 2);
  assert.equal(moResults[0].game.id, 'mlbb');

  const valResults = getGameSuggestions(GAMES_CATALOG, 'val');
  assert.equal(valResults[0].game.id, 'valorant');
});

test('getGameSuggestions discovers games by currency, publisher, and denomination keywords', () => {
  const ucResults = getGameSuggestions(GAMES_CATALOG, 'uc');
  assert.equal(ucResults[0].game.id, 'pubg');

  const welkinResults = getGameSuggestions(GAMES_CATALOG, 'welkin');
  assert.equal(welkinResults.length, 1);
  assert.equal(welkinResults[0].game.id, 'genshin');
  assert.equal(welkinResults[0].matchedNominal, 'Blessing of the Welkin Moon');

  const riotResults = getGameSuggestions(GAMES_CATALOG, 'riot');
  assert.equal(riotResults[0].game.id, 'valorant');
});

test('splitHighlightSegments preserves casing and highlights first matching span', () => {
  const segs = splitHighlightSegments('Mobile Legends: Bang Bang', 'leg');
  assert.deepEqual(segs, [
    { text: 'Mobile ', highlight: false },
    { text: 'Leg', highlight: true },
    { text: 'ends: Bang Bang', highlight: false }
  ]);
});

test('all 11 uploaded game logos map to their exact games', () => {
  const byId = new Map(GAMES_CATALOG.map((g) => [g.id, g]));
  const expectedLogos: Record<string, string> = {
    mlbb: '/assets/aistudio/ML_MATI_SURI_870f173d.jpeg',
    ff: '/assets/aistudio/806425877068708237_fe16f04a.jpeg',
    pubg: '/assets/aistudio/Pubg_logo_4fac5add.jpeg',
    pb: '/assets/aistudio/GPH_Point_Blank_Marketing_Banners_-_Jerome_Alcantara_a788ea32.jpeg',
    hok: '/assets/aistudio/897131188273785791_c6357822.jpeg',
    valorant: '/assets/aistudio/Valorant_Icon_5461a315.jpeg',
    genshin: '/assets/aistudio/Genshin_Impact___Collection_08292137.jpeg',
    codm: '/assets/aistudio/944278247379675545_72525573.jpeg',
    roblox: '/assets/aistudio/Roblox_1a8501bb.jpeg',
    steam: '/assets/aistudio/_Live_Wallpapers_for_Me_-_You_May_Also_Like_8dbab9e8.jpeg',
    coc: '/assets/aistudio/Clash_of_clans_app_logo_f2a940a9.jpeg'
  };

  for (const [gameId, logoPath] of Object.entries(expectedLogos)) {
    const game = byId.get(gameId);
    assert.ok(game, `Expected game '${gameId}' to exist in GAMES_CATALOG`);
    assert.equal(game.coverImage, logoPath);
  }

  const cocResults = getGameSuggestions(GAMES_CATALOG, 'clash');
  assert.equal(cocResults[0].game.id, 'coc');
  const goldPassResults = getGameSuggestions(GAMES_CATALOG, 'gold pass');
  assert.equal(goldPassResults[0].game.id, 'coc');
  assert.equal(goldPassResults[0].matchedNominal, 'Gold Pass');
});
