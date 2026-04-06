import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Plus, ArrowLeft, BookOpen, Package, ChevronDown, TrendingUp, Clock, Crown } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import CardDetailModal from '../components/CardDetailModal';
import SetBrowser from '../components/SetBrowser';
import SetDetail from '../components/SetDetail';
import * as pokemonApi from '../api/pokemonTcg';

const GAME_META = {
  mtg: { name: 'Magic: The Gathering', short: 'MTG' },
  pokemon: { name: 'Pokémon', short: 'Pokémon' },
};

const TABS = [
  { key: 'my-cards', label: 'My Cards' },
  { key: 'search', label: 'Find a Card' },
  { key: 'sets', label: 'Browse Sets' },
];

export default function GamePage({ game, onBack }) {
  const meta = GAME_META[game];
  const [activeTab, setActiveTab] = useState('my-cards');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search / Add state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const autocompleteRef = useRef(null);
  const debounceRef = useRef(null);

  // Scryfall sets list (for dropdown)
  const [scryfallSets, setScryfallSets] = useState([]);

  // Adding state (for Find Card / Browse Sets)
  const [adding, setAdding] = useState(false);

  // Set browsing
  const [selectedSet, setSelectedSet] = useState(null);

  // Modal for My Cards
  const [selectedMyCard, setSelectedMyCard] = useState(null);

  // Modal for Search
  const [selectedSearchCard, setSelectedSearchCard] = useState(null);

  // Image cache for My Cards
  const [imageCache, setImageCache] = useState({});

  // Group My Cards by unique card (name+set+number)
  const uniqueMyCards = useMemo(() => {
    const map = {};
    cards.forEach(c => {
      const key = `${c.name}|${c.set_code || ''}|${c.collector_number || ''}`;
      if (!map[key]) {
        map[key] = { name: c.name, set_code: c.set_code || '', collector_number: c.collector_number || '', price: Number(c.price_cad) || 0, collectionQty: 0, inventoryQty: 0 };
      }
      if (c.type === 'inventory') map[key].inventoryQty++;
      else map[key].collectionQty++;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [cards]);

  // Fetch user's cards from Supabase
  const fetchCards = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('game', game)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setCards(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCards(); }, [game]);

  // Fetch card images for unique My Cards
  useEffect(() => {
    const toFetch = uniqueMyCards.filter(c => c.set_code && c.collector_number && !imageCache[`${c.set_code}|${c.collector_number}`]);
    if (toFetch.length === 0) return;
    let cancelled = false;
    const fetchImages = async () => {
      if (game === 'pokemon') {
        const result = await pokemonApi.fetchCardImages(toFetch);
        if (!cancelled) setImageCache(prev => ({ ...prev, ...result }));
      } else {
        const newCache = {};
        for (let i = 0; i < toFetch.length; i += 75) {
          const batch = toFetch.slice(i, i + 75);
          try {
            const res = await fetch('https://api.scryfall.com/cards/collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifiers: batch.map(c => ({ set: c.set_code.toLowerCase(), collector_number: c.collector_number })) }),
            });
            const data = await res.json();
            if (data.data) {
              data.data.forEach(sc => {
                const key = `${sc.set.toUpperCase()}|${sc.collector_number}`;
                newCache[key] = sc.image_uris?.normal || sc.card_faces?.[0]?.image_uris?.normal || null;
              });
            }
          } catch { /* ignore */ }
          if (i + 75 < toFetch.length) await new Promise(r => setTimeout(r, 100));
        }
        if (!cancelled) setImageCache(prev => ({ ...prev, ...newCache }));
      }
    };
    fetchImages();
    return () => { cancelled = true; };
  }, [uniqueMyCards, game]);

  // Fetch Scryfall sets for dropdown
  useEffect(() => {
    if (game === 'mtg') {
      fetch('https://api.scryfall.com/sets')
        .then(r => r.json())
        .then(data => {
          if (data.data) {
            setScryfallSets(
              data.data
                .filter(s => s.set_type !== 'token' && s.set_type !== 'memorabilia')
                .map(s => ({ code: s.code.toUpperCase(), name: s.name, icon: s.icon_svg_uri }))
            );
          }
        })
        .catch(() => {});
    }
  }, [game]);

  // Autocomplete: fetch suggestions as user types
  const fetchSuggestions = useCallback((query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    if (game === 'pokemon') {
      pokemonApi.searchCards(query)
        .then(results => {
          const names = [...new Set(results.map(r => r.name))].slice(0, 8);
          setSuggestions(names);
        })
        .catch(() => setSuggestions([]));
    } else {
      fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
          if (data.data) setSuggestions(data.data.slice(0, 8));
          else setSuggestions([]);
        })
        .catch(() => setSuggestions([]));
    }
  }, [game]);

  const handleSearchInputChange = (val) => {
    setSearchQuery(val);
    setActiveSuggestion(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 200);
    setShowSuggestions(true);
  };

  const selectSuggestion = (name) => {
    setSearchQuery(name);
    setSuggestions([]);
    setShowSuggestions(false);
    // Trigger search immediately
    doSearch(name);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Open full detail modal for a card (fetches detailed data, sets target state)
  const openDetailModal = (cardInfo, setTarget, fallbackImage) => {
    if (cardInfo.set_code && cardInfo.collector_number) {
      if (game === 'pokemon') {
        pokemonApi.fetchCardBySetAndNumber(cardInfo.set_code, cardInfo.collector_number)
          .then(card => setTarget({ ...card, _orig: cardInfo }))
          .catch(() => setTarget({ ...cardInfo, image: fallbackImage || cardInfo.image || null, _orig: cardInfo }));
      } else {
        fetch(`https://api.scryfall.com/cards/${cardInfo.set_code.toLowerCase()}/${cardInfo.collector_number}`)
          .then(r => r.json())
          .then(sc => {
            setTarget({
              name: sc.name,
              set_code: (sc.set || '').toUpperCase(),
              collector_number: sc.collector_number,
              image: sc.image_uris?.normal || sc.card_faces?.[0]?.image_uris?.normal || fallbackImage || null,
              image_large: sc.image_uris?.large || sc.card_faces?.[0]?.image_uris?.large || null,
              rarity: sc.rarity,
              type_line: sc.type_line || null,
              mana_cost: sc.mana_cost || null,
              oracle_text: sc.oracle_text || sc.card_faces?.[0]?.oracle_text || null,
              power: sc.power ?? null,
              toughness: sc.toughness ?? null,
              price_usd: sc.prices?.usd ? parseFloat(sc.prices.usd) : null,
              price_usd_foil: sc.prices?.usd_foil ? parseFloat(sc.prices.usd_foil) : null,
              _orig: cardInfo,
            });
          })
          .catch(() => setTarget({ ...cardInfo, image: fallbackImage || cardInfo.image || null, _orig: cardInfo }));
      }
    } else {
      setTarget({ ...cardInfo, image: fallbackImage || cardInfo.image || null, _orig: cardInfo });
    }
  };

  // Handle saving qty from modal (works for both My Cards and Search modals)
  const handleSaveQuantity = async (modalCard, newCol, newInv, closeModal) => {
    const matching = cards.filter(c =>
      c.name === modalCard.name &&
      (c.set_code || '') === (modalCard.set_code || '') &&
      (c.collector_number || '') === (modalCard.collector_number || '')
    );
    const colCards = matching.filter(c => c.type !== 'inventory');
    const invCards = matching.filter(c => c.type === 'inventory');
    const colDiff = newCol - colCards.length;
    const invDiff = newInv - invCards.length;
    const price = modalCard.price_usd || Number(matching[0]?.price_cad) || null;

    if (colDiff < 0) await supabase.from('cards').delete().in('id', colCards.slice(0, Math.abs(colDiff)).map(c => c.id));
    if (colDiff > 0) await supabase.from('cards').insert(Array.from({ length: colDiff }, () => ({
      name: modalCard.name, set_code: modalCard.set_code || '', collector_number: modalCard.collector_number || '',
      game, price_cad: price, type: 'collection', user_id: user.id,
    })));
    if (invDiff < 0) await supabase.from('cards').delete().in('id', invCards.slice(0, Math.abs(invDiff)).map(c => c.id));
    if (invDiff > 0) await supabase.from('cards').insert(Array.from({ length: invDiff }, () => ({
      name: modalCard.name, set_code: modalCard.set_code || '', collector_number: modalCard.collector_number || '',
      game, price_cad: price, type: 'inventory', user_id: user.id,
    })));
    await fetchCards();
    closeModal();
  };

  // Search cards (MTG via Scryfall, Pokemon via TCGdex)
  const doSearch = async (q) => {
    const query = q || searchQuery;
    if (!query.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      if (game === 'pokemon') {
        const results = await pokemonApi.searchCards(query);
        setSearchResults(results);
      } else {
        const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=released&dir=desc`);
        const data = await res.json();
        if (data.data) {
          setSearchResults(data.data.slice(0, 20).map(c => ({
            name: c.name,
            set_code: c.set.toUpperCase(),
            collector_number: c.collector_number,
            image: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
            price_cad: c.prices?.usd ? parseFloat(c.prices.usd) : null,
          })));
        } else {
          setSearchResults([]);
        }
      }
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  // Add a card to Supabase (collection)
  const handleAddCard = async (card) => {
    setAdding(true);
    const { data, error: err } = await supabase
      .from('cards')
      .insert([{
        name: card.name,
        set_code: card.set_code || '',
        collector_number: card.collector_number || '',
        game,
        price_cad: card.price_usd || card.price_cad || null,
        type: 'collection',
        user_id: user.id,
      }])
      .select();
    if (!err && data) {
      setCards(prev => [...data, ...prev]);
    }
    setAdding(false);
  };

  // Add a card to inventory (for selling)
  const handleAddToInventory = async (card) => {
    setAdding(true);
    const { data, error: err } = await supabase
      .from('cards')
      .insert([{
        name: card.name,
        set_code: card.set_code || '',
        collector_number: card.collector_number || '',
        game,
        price_cad: card.price_usd || card.price_cad || null,
        type: 'inventory',
        user_id: user.id,
      }])
      .select();
    if (!err && data) {
      setCards(prev => [...data, ...prev]);
    }
    setAdding(false);
  };

  // ── Dashboard computed data ──
  const totalCards = cards.length;
  const collectionCount = cards.filter(c => c.type !== 'inventory').length;
  const inventoryCount = cards.filter(c => c.type === 'inventory').length;
  const totalValue = cards.reduce((s, c) => s + (Number(c.price_cad) || 0), 0);

  // Recent additions (last 8 unique cards by created_at)
  const recentCards = useMemo(() => {
    const seen = new Set();
    return cards.filter(c => {
      const key = `${c.name}|${c.set_code || ''}|${c.collector_number || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [cards]);

  // Most valuable unique cards (top 8)
  const mostValuable = useMemo(() => {
    return [...uniqueMyCards]
      .filter(c => c.price > 0)
      .sort((a, b) => b.price - a.price)
      .slice(0, 8);
  }, [uniqueMyCards]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-20 sm:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <button onClick={onBack} className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{meta.name}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200 mb-4 sm:mb-8 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-blue-green text-blue-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'my-cards' && (
        <div>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {[
              { label: 'Total Cards', value: totalCards, color: 'text-gray-900' },
              { label: 'Collection', value: collectionCount, color: 'text-blue-green' },
              { label: 'Inventory', value: inventoryCount, color: 'text-princeton-orange' },
              { label: 'Total Value', value: `$${totalValue.toFixed(2)}`, color: 'text-gray-900' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-72" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">{error}</div>
          ) : uniqueMyCards.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No cards yet</p>
              <p className="text-sm mt-1">Use "Find a Card" or "Browse Sets" to start adding cards.</p>
            </div>
          ) : (
            <>
              {/* Most Valuable */}
              {mostValuable.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Crown size={18} className="text-amber-flame" />
                    <h2 className="text-lg font-semibold text-gray-900">Most Valuable</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {mostValuable.map((c, i) => {
                      const cacheKey = `${c.set_code}|${c.collector_number}`;
                      const image = imageCache[cacheKey];
                      return (
                        <div
                          key={`mv-${c.name}-${c.set_code}-${i}`}
                          onClick={() => openDetailModal(c, setSelectedMyCard, image)}
                          className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 cursor-pointer relative"
                        >
                          <div className="absolute top-2 left-2 z-10">
                            <span className="flex items-center gap-0.5 bg-amber-flame text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                              <TrendingUp size={10} /> ${c.price.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
                            {image ? (
                              <img src={image} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                                <span className="text-3xl opacity-20">🃏</span>
                              </div>
                            )}
                          </div>
                          <div className="p-2.5">
                            <h3 className="text-xs font-semibold text-gray-900 truncate">{c.name}</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">{c.set_code} • #{c.collector_number}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recently Added */}
              {recentCards.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={18} className="text-blue-green" />
                    <h2 className="text-lg font-semibold text-gray-900">Recently Added</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {recentCards.map((c, i) => {
                      const cacheKey = `${c.set_code}|${c.collector_number}`;
                      const image = imageCache[cacheKey];
                      return (
                        <div
                          key={`rc-${c.id}-${i}`}
                          onClick={() => openDetailModal(c, setSelectedMyCard, image)}
                          className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 cursor-pointer relative"
                        >
                          <div className="w-full aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
                            {image ? (
                              <img src={image} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                                <span className="text-3xl opacity-20">🃏</span>
                              </div>
                            )}
                          </div>
                          <div className="p-2.5">
                            <h3 className="text-xs font-semibold text-gray-900 truncate">{c.name}</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">{c.set_code} • #{c.collector_number}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All Cards */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">All Cards</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {uniqueMyCards.map((c, i) => {
                    const cacheKey = `${c.set_code}|${c.collector_number}`;
                    const image = imageCache[cacheKey];
                    return (
                      <div
                        key={`${c.name}-${c.set_code}-${c.collector_number}-${i}`}
                        onClick={() => openDetailModal(c, setSelectedMyCard, image)}
                        className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 cursor-pointer relative"
                      >
                        {/* Quantity badges */}
                        <div className="absolute top-2 left-2 z-10 flex gap-1">
                          {c.collectionQty > 0 && (
                            <span className="flex items-center gap-0.5 bg-blue-green text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                              <BookOpen size={10} /> {c.collectionQty}
                            </span>
                          )}
                          {c.inventoryQty > 0 && (
                            <span className="flex items-center gap-0.5 bg-princeton-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                              <Package size={10} /> {c.inventoryQty}
                            </span>
                          )}
                        </div>
                        <div className="w-full aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
                          {image ? (
                            <img src={image} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                              <span className="text-4xl opacity-20">🃏</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">{c.set_code || 'Unknown Set'} {c.collector_number ? `• ${c.collector_number}` : ''}</p>
                          {c.price > 0 && (
                            <p className="text-sm font-bold text-gray-900 mt-1">${c.price.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <div>
          {/* Search Bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-5 mb-4 sm:mb-8">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Find a Product</h2>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {/* Autocomplete search */}
              <div className="flex-1 relative" ref={autocompleteRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" size={18} />
                <input
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-green/40 focus:border-blue-green placeholder:text-gray-400"
                  placeholder="Start typing a card name..."
                  value={searchQuery}
                  onChange={e => handleSearchInputChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSuggestion(prev => Math.max(prev - 1, -1));
                    } else if (e.key === 'Enter') {
                      if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
                        selectSuggestion(suggestions[activeSuggestion]);
                      } else {
                        doSearch();
                      }
                    } else if (e.key === 'Escape') {
                      setShowSuggestions(false);
                    }
                  }}
                />
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                    {suggestions.map((name, i) => (
                      <button
                        key={name}
                        onMouseDown={() => selectSuggestion(name)}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          i === activeSuggestion
                            ? 'bg-blue-green/10 text-blue-green'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="bg-blue-green hover:bg-blue-green/90 text-white rounded-lg px-4 sm:px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors"
                onClick={() => doSearch()}
                disabled={searching}
              >
                Search
              </button>
              <button
                className="text-gray-500 hover:text-gray-700 px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors"
                onClick={() => { setSearchQuery(''); setSearchResults([]); setSuggestions([]); setShowSuggestions(false); }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searching ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-72" />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {searchResults.map((card, idx) => {
                const ownedCol = cards.filter(c => c.name === card.name && (c.set_code || '') === (card.set_code || '') && (c.collector_number || '') === (card.collector_number || '') && c.type !== 'inventory').length;
                const ownedInv = cards.filter(c => c.name === card.name && (c.set_code || '') === (card.set_code || '') && (c.collector_number || '') === (card.collector_number || '') && c.type === 'inventory').length;
                return (
                <div
                  key={idx}
                  onClick={() => openDetailModal(card, setSelectedSearchCard, card.image)}
                  className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 relative cursor-pointer"
                >
                  {/* Owned badges */}
                  {(ownedCol > 0 || ownedInv > 0) && (
                    <div className="absolute top-2 left-2 z-10 flex gap-1">
                      {ownedCol > 0 && (
                        <span className="flex items-center gap-0.5 bg-blue-green text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                          <BookOpen size={10} /> {ownedCol}
                        </span>
                      )}
                      {ownedInv > 0 && (
                        <span className="flex items-center gap-0.5 bg-princeton-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                          <Package size={10} /> {ownedInv}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Card image */}
                  <div className="w-full aspect-[2.5/3.5] bg-gray-50 flex items-center justify-center overflow-hidden">
                    {card.image ? (
                      <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl opacity-20">🃏</span>
                    )}
                  </div>
                  {/* Card info */}
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{card.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {card.set_code} • {card.collector_number}
                    </p>
                    {card.price_cad != null && (
                      <p className="text-sm font-bold text-gray-900 mt-1">${card.price_cad.toFixed(2)}</p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          ) : searchQuery && !searching ? (
            <div className="text-center py-12 text-gray-400">
              <p>No results found for "{searchQuery}"</p>
              <p className="text-sm mt-1">Try a different search term.</p>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === 'sets' && !selectedSet && (
        <SetBrowser
          game={game}
          ownedCards={cards}
          onSelectSet={(set) => setSelectedSet(set)}
        />
      )}

      {activeTab === 'sets' && selectedSet && (
        <SetDetail
          set={selectedSet}
          game={game}
          onBack={() => setSelectedSet(null)}
          onAddCard={handleAddCard}
          onAddToInventory={handleAddToInventory}
          ownedCards={cards}
          adding={adding}
        />
      )}

      {/* My Card Detail Modal */}
      {selectedMyCard && (() => {
        const colQty = cards.filter(c => c.name === selectedMyCard.name && (c.set_code || '') === (selectedMyCard.set_code || '') && (c.collector_number || '') === (selectedMyCard.collector_number || '') && c.type !== 'inventory').length;
        const invQty = cards.filter(c => c.name === selectedMyCard.name && (c.set_code || '') === (selectedMyCard.set_code || '') && (c.collector_number || '') === (selectedMyCard.collector_number || '') && c.type === 'inventory').length;
        return (
          <CardDetailModal
            card={selectedMyCard}
            onClose={() => setSelectedMyCard(null)}
            collectionQty={colQty}
            inventoryQty={invQty}
            onSaveQuantity={(newCol, newInv) => handleSaveQuantity(selectedMyCard, newCol, newInv, () => setSelectedMyCard(null))}
          />
        );
      })()}

      {/* Search Card Detail Modal */}
      {selectedSearchCard && (() => {
        const colQty = cards.filter(c => c.name === selectedSearchCard.name && (c.set_code || '') === (selectedSearchCard.set_code || '') && (c.collector_number || '') === (selectedSearchCard.collector_number || '') && c.type !== 'inventory').length;
        const invQty = cards.filter(c => c.name === selectedSearchCard.name && (c.set_code || '') === (selectedSearchCard.set_code || '') && (c.collector_number || '') === (selectedSearchCard.collector_number || '') && c.type === 'inventory').length;
        return (
          <CardDetailModal
            card={selectedSearchCard}
            onClose={() => setSelectedSearchCard(null)}
            collectionQty={colQty}
            inventoryQty={invQty}
            onSaveQuantity={(newCol, newInv) => handleSaveQuantity(selectedSearchCard, newCol, newInv, () => setSelectedSearchCard(null))}
          />
        );
      })()}
    </div>
  );
}
