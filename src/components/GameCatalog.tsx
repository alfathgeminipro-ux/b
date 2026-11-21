import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock, Gamepad2, Search, Trash2, X } from 'lucide-react';
import { GAMES_CATALOG, type GameCategory, type GameConfig } from '../data/games';
import { formatIDR } from '../utils/pricing';
import { getGameSuggestions, splitHighlightSegments } from '../utils/searchSuggestions';

interface GameCatalogProps {
  onSelectGame: (gameId: string) => void;
  recentGameIds: string[];
  onRecordRecentGame: (gameId: string) => void;
  onRemoveRecentGame: (gameId: string) => void;
  onClearRecentGames: () => void;
}

const CATEGORIES: { id: GameCategory; label: string }[] = [
  { id: 'all', label: 'Semua Game' },
  { id: 'moba', label: 'MOBA' },
  { id: 'shooter', label: 'Shooter & BR' },
  { id: 'rpg', label: 'RPG & Strategi' },
  { id: 'voucher', label: 'Voucher & PC' }
];

export const GameCatalog: React.FC<GameCatalogProps> = ({
  onSelectGame,
  recentGameIds,
  onRecordRecentGame,
  onRemoveRecentGame,
  onClearRecentGames
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<GameCategory>('all');
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchBoxRef = useRef<HTMLFormElement>(null);

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GAMES_CATALOG.filter((game) => {
      const matchesCat = selectedCategory === 'all' || game.category === selectedCategory;
      const matchesQuery =
        !q ||
        game.name.toLowerCase().includes(q) ||
        game.shortName.toLowerCase().includes(q) ||
        game.publisher.toLowerCase().includes(q) ||
        game.categoryLabel.toLowerCase().includes(q) ||
        game.currencyUnit.toLowerCase().includes(q) ||
        game.nominals.some((n) => n.label.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [searchQuery, selectedCategory]);

  const suggestions = useMemo(
    () => getGameSuggestions(GAMES_CATALOG, searchQuery, 6),
    [searchQuery]
  );

  const showSuggestionsDropdown = suggestionsOpen && searchQuery.trim().length > 0;

  const recentGames = useMemo(() => {
    const byId = new Map(GAMES_CATALOG.map((g) => [g.id, g]));
    return recentGameIds
      .map((id) => byId.get(id))
      .filter((game): game is GameConfig => Boolean(game));
  }, [recentGameIds]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-record searched game after brief settle when search narrows to a single match or exact title
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2 || filteredGames.length === 0) return;

    const exactMatch = filteredGames.find(
      (g) =>
        g.name.toLowerCase() === q ||
        g.shortName.toLowerCase() === q ||
        g.id.toLowerCase() === q
    );
    const targetGame = exactMatch || (filteredGames.length === 1 ? filteredGames[0] : null);
    if (!targetGame) return;

    const timer = window.setTimeout(() => {
      onRecordRecentGame(targetGame.id);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [searchQuery, filteredGames, onRecordRecentGame]);

  const handleSelectSuggestion = (gameId: string) => {
    setSuggestionsOpen(false);
    setHighlightedIndex(-1);
    onRecordRecentGame(gameId);
    onSelectGame(gameId);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showSuggestionsDropdown && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      handleSelectSuggestion(suggestions[highlightedIndex].game.id);
      return;
    }
    if (searchQuery.trim() && filteredGames.length > 0) {
      onRecordRecentGame(filteredGames[0].id);
      setSuggestionsOpen(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestionsDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestionsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const getMinPrice = (game: GameConfig): number => {
    return Math.min(...game.nominals.map((n) => n.price));
  };

  return (
    <section id="katalog" aria-label="Katalog Game Populer" className="py-8 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header + Search + Category Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-7">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>
              Katalog Lengkap · {GAMES_CATALOG.length} Game & Voucher Resmi
            </div>
            <h2
              className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Pilih Game Favorit Anda
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input with Real-Time Autocomplete Suggestions */}
            <form
              ref={searchBoxRef}
              onSubmit={handleSearchSubmit}
              className="relative min-w-0 sm:w-72"
            >
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSuggestionsDropdown}
                aria-controls="catalog-search-suggestions"
                aria-activedescendant={
                  highlightedIndex >= 0 && suggestions[highlightedIndex]
                    ? `search-suggestion-${suggestions[highlightedIndex].game.id}`
                    : undefined
                }
                value={searchQuery}
                onFocus={() => setSuggestionsOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSuggestionsOpen(true);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Cari MLBB, Free Fire, Valorant..."
                aria-label="Cari game di katalog"
                className="liquid-input w-full h-11 pl-10 pr-9 rounded-xl text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSuggestionsOpen(false);
                    setHighlightedIndex(-1);
                  }}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md cursor-pointer z-10"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Dynamic Autocomplete Dropdown */}
              {showSuggestionsDropdown && (
                <div
                  id="catalog-search-suggestions"
                  role="listbox"
                  aria-label="Saran Pencarian Game"
                  data-testid="search-suggestions-dropdown"
                  className="liquid-glass-strong absolute left-0 right-0 sm:w-80 sm:right-0 sm:left-auto mt-2 rounded-2xl p-2 z-40 shadow-2xl"
                >
                  {suggestions.length === 0 ? (
                    <div
                      className="px-3 py-4 text-center text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Tidak ada saran untuk &ldquo;{searchQuery.trim()}&rdquo;
                    </div>
                  ) : (
                    <>
                      <div
                        className="px-2.5 py-1 text-[11px] font-semibold flex items-center justify-between"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <span>Saran Cepat</span>
                        <span className="font-mono-num">{suggestions.length} hasil</span>
                      </div>
                      <div className="space-y-1 mt-1 max-h-72 overflow-y-auto">
                        {suggestions.map((item, index) => {
                          const isHighlighted = index === highlightedIndex;
                          const segments = splitHighlightSegments(item.game.name, searchQuery);
                          return (
                            <button
                              key={item.game.id}
                              id={`search-suggestion-${item.game.id}`}
                              type="button"
                              role="option"
                              aria-selected={isHighlighted}
                              data-testid="search-suggestion-option"
                              onMouseEnter={() => setHighlightedIndex(index)}
                              onMouseDown={(e) => {
                                // Prevent input blur before click finishes
                                e.preventDefault();
                                handleSelectSuggestion(item.game.id);
                              }}
                              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer"
                              style={{
                                background: isHighlighted ? 'var(--accent-soft)' : 'transparent'
                              }}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  className="w-9 h-9 rounded-[22%] overflow-hidden shrink-0 border border-white/10"
                                  style={{ backgroundColor: item.game.logoBg || '#0f172a' }}
                                >
                                  <img
                                    src={item.game.coverImage}
                                    alt={item.game.shortName}
                                    referrerPolicy="no-referrer"
                                    className={
                                      item.game.logoFit === 'contain'
                                        ? 'w-full h-full object-contain'
                                        : 'w-full h-full object-cover scale-[1.04]'
                                    }
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="font-display text-xs font-bold truncate"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {segments.map((seg, i) =>
                                      seg.highlight ? (
                                        <span key={i} style={{ color: 'var(--accent)' }}>
                                          {seg.text}
                                        </span>
                                      ) : (
                                        <React.Fragment key={i}>{seg.text}</React.Fragment>
                                      )
                                    )}
                                  </div>
                                  <div
                                    className="text-[11px] truncate"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {item.matchedNominal
                                      ? `Paket: ${item.matchedNominal}`
                                      : `${item.game.publisher} · ${item.game.categoryLabel}`}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0 flex items-center gap-1.5">
                                <span
                                  className="font-mono-num text-[11px] font-semibold"
                                  style={{ color: 'var(--accent)' }}
                                >
                                  {formatIDR(getMinPrice(item.game))}
                                </span>
                                <ArrowUpRight
                                  className="w-3.5 h-3.5"
                                  style={{ color: 'var(--text-muted)' }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div
                        className="mt-1.5 pt-1.5 border-t px-2.5 flex items-center justify-between text-[10px]"
                        style={{ borderColor: 'var(--divider)', color: 'var(--text-muted)' }}
                      >
                        <span>↑↓ Pilih · Enter Buka</span>
                        <span>Esc Tutup</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </form>

            {/* Interactive Category Segmented Filter */}
            <div
              role="tablist"
              aria-label="Filter kategori game"
              className="liquid-glass rounded-xl p-1 flex items-center gap-1 overflow-x-auto"
            >
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(cat.id)}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    style={{
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)'
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Searches Section (Last 5 Searched or Navigated Games) */}
        {recentGames.length > 0 && (
          <div
            aria-label="Recent Searches"
            data-testid="recent-searches-section"
            className="liquid-glass rounded-2xl p-4 sm:p-5 mb-7 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                <span>Recent Searches</span>
                <span className="font-normal text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                  · Terakhir dicari & dibuka
                </span>
              </div>

              <button
                type="button"
                onClick={onClearRecentGames}
                className="inline-flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-80 cursor-pointer whitespace-nowrap"
                style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Semua</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  data-testid="recent-search-item"
                  className="liquid-glass rounded-xl p-2.5 flex items-center justify-between gap-2 group hover:border-[var(--accent-border)] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelectGame(game.id)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div
                      className="w-10 h-10 rounded-[22%] overflow-hidden shrink-0 border border-white/10"
                      style={{ backgroundColor: game.logoBg || '#0f172a' }}
                    >
                      <img
                        src={game.coverImage}
                        alt={game.shortName}
                        referrerPolicy="no-referrer"
                        className={
                          game.logoFit === 'contain'
                            ? 'w-full h-full object-contain'
                            : 'w-full h-full object-cover scale-[1.04]'
                        }
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-display text-xs font-bold truncate flex items-center gap-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span className="truncate">{game.shortName}</span>
                        <ArrowUpRight
                          className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100"
                          style={{ color: 'var(--accent)' }}
                        />
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {game.categoryLabel} · {formatIDR(getMinPrice(game))}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveRecentGame(game.id)}
                    aria-label={`Hapus ${game.shortName} dari Recent Searches`}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 opacity-65 hover:opacity-100 cursor-pointer transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game Cards Grid */}
        {filteredGames.length === 0 ? (
          <div className="liquid-glass rounded-2xl p-10 text-center space-y-3">
            <Gamepad2 className="w-8 h-8 mx-auto" style={{ color: 'var(--text-muted)' }} />
            <div className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Game tidak ditemukan
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Coba kata kunci lain atau tampilkan semua kategori game.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="liquid-btn-primary rounded-xl px-5 py-2.5 text-xs cursor-pointer"
            >
              Tampilkan Semua Game
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5">
            {filteredGames.map((game) => {
              const minPrice = getMinPrice(game);
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onSelectGame(game.id)}
                  className="liquid-glass liquid-glass-interactive rounded-2xl overflow-hidden text-left flex flex-col group"
                >
                  {/* 1:1 Uniform Squircle Game Logo Showcase */}
                  <div className="p-3 pb-0 w-full">
                    <div
                      className="relative aspect-square w-full rounded-[22%] overflow-hidden ring-1 ring-white/15 shadow-md"
                      style={{ backgroundColor: game.logoBg || '#0f172a' }}
                    >
                      {!imgErrors[game.id] ? (
                        <img
                          src={game.coverImage}
                          alt={game.name}
                          referrerPolicy="no-referrer"
                          onError={() => setImgErrors((prev) => ({ ...prev, [game.id]: true }))}
                          className={
                            game.logoFit === 'contain'
                              ? 'w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-300'
                              : 'w-full h-full object-cover scale-[1.04] group-hover:scale-110 transition-transform duration-300'
                          }
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ background: 'var(--bg-canvas-elevated)' }}
                        >
                          <Gamepad2 className="w-10 h-10" style={{ color: 'var(--accent)' }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clean Metadata Body */}
                  <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-2.5">
                    <div>
                      <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                        {game.publisher} · {game.deliveryEstimate}
                      </div>
                      <h3
                        className="font-display text-sm sm:text-base font-bold leading-snug mt-0.5 line-clamp-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {game.name}
                      </h3>
                    </div>

                    <div
                      className="pt-2 border-t flex items-baseline justify-between gap-1"
                      style={{ borderColor: 'var(--divider)' }}
                    >
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Mulai
                      </span>
                      <span
                        className="font-mono-num text-xs sm:text-sm font-bold"
                        style={{ color: 'var(--accent)' }}
                      >
                        {formatIDR(minPrice)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
