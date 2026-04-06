      import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Settings, ArrowLeft, Package, BookOpen, Minus, Plus, X, Layers, ArrowUpDown, Filter, CheckSquare, Download, Tag } from 'lucide-react';
import CardDetailModal from '../components/CardDetailModal';
import * as pokemonApi from '../api/pokemonTcg';
import mtgLogo from '../assets/mtg_logo.png';
import pokemonLogo from '../assets/pokemong_logo.png';

// Sync prices from Scryfall for MTG cards with missing prices
async function syncPricesFromScryfall(cards) {
  const needPrice = cards.filter(c => !c.price_cad && c.set_code && c.collector_number && c.game === 'mtg');
  if (needPrice.length === 0) return;

  // Deduplicate by set_code + collector_number
  const seen = new Set();
  const unique = [];
  needPrice.forEach(c => {
    const key = `${c.set_code}|${c.collector_number}`;
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  });

  for (let i = 0; i < unique.length; i += 75) {
    const batch = unique.slice(i, i + 75);
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifiers: batch.map(c => ({
            set: c.set_code.toLowerCase(),
            collector_number: c.collector_number,
          })),
        }),
      });
      const data = await res.json();
      if (data.data) {
        for (const sc of data.data) {
          const price = sc.prices?.usd ? parseFloat(sc.prices.usd) : null;
          if (price) {
            // Update all matching cards in DB
            await supabase
              .from('cards')
              .update({ price_cad: price })
              .eq('set_code', sc.set.toUpperCase())
              .eq('collector_number', sc.collector_number)
              .is('price_cad', null);
          }
        }
      }
    } catch { /* ignore */ }
    if (i + 75 < unique.length) await new Promise(r => setTimeout(r, 100));
  }
}

const SELLING_PLATFORMS = {
  ebay: {
    name: 'eBay',
    feePercent: 13.25,
    fixedFee: 0.30,
    shippingEstimate: 1.50,
  },
  private: {
    name: 'Private Sale',
    feePercent: 0,
    fixedFee: 0,
    shippingEstimate: 0,
  },
};

function calcSellingBreakdown(marketPrice, platform) {
  const fees = (marketPrice * platform.feePercent) / 100 + platform.fixedFee;
  const shipping = platform.shippingEstimate;
  const payout = Math.max(0, marketPrice - fees - shipping);
  return { marketPrice, fees, shipping, payout };
}

const GAME_META = {
  mtg: { name: 'Magic: The Gathering', logo: mtgLogo },
  pokemon: { name: 'Pokémon', logo: pokemonLogo },
};

// ─── Card Quantity Modal ────────────────────────────────────────────
function CardQuantityModal({ cardName, setCode, collectorNumber, cards, onClose, onUpdate, userId }) {
  const matching = cards.filter(
    c => c.name === cardName && (c.set_code || '') === setCode && (c.collector_number || '') === collectorNumber
  );
  const collectionQty = matching.filter(c => c.type !== 'inventory').length;
  const inventoryQty = matching.filter(c => c.type === 'inventory').length;
  const price = Number(matching[0]?.price_cad) || 0;

  const [colQty, setColQty] = useState(collectionQty);
  const [invQty, setInvQty] = useState(inventoryQty);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const colDiff = colQty - collectionQty;
    const invDiff = invQty - inventoryQty;
    const colIds = matching.filter(c => c.type !== 'inventory').map(c => c.id);
    const invIds = matching.filter(c => c.type === 'inventory').map(c => c.id);

    // Remove excess collection cards
    if (colDiff < 0) {
      const toDelete = colIds.slice(0, Math.abs(colDiff));
      await supabase.from('cards').delete().in('id', toDelete);
    }
    // Add new collection cards
    if (colDiff > 0) {
      const rows = Array.from({ length: colDiff }, () => ({
        name: cardName,
        set_code: setCode,
        collector_number: collectorNumber,
        game: matching[0]?.game || 'mtg',
        price_cad: price || null,
        type: 'collection',
        user_id: userId,
      }));
      await supabase.from('cards').insert(rows);
    }
    // Remove excess inventory cards
    if (invDiff < 0) {
      const toDelete = invIds.slice(0, Math.abs(invDiff));
      await supabase.from('cards').delete().in('id', toDelete);
    }
    // Add new inventory cards
    if (invDiff > 0) {
      const rows = Array.from({ length: invDiff }, () => ({
        name: cardName,
        set_code: setCode,
        collector_number: collectorNumber,
        game: matching[0]?.game || 'mtg',
        price_cad: price || null,
        type: 'inventory',
        user_id: userId,
      }));
      await supabase.from('cards').insert(rows);
    }

    setSaving(false);
    onUpdate();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
          <X size={18} />
        </button>
        <h3 className="text-lg font-bold text-gray-900 mb-1 pr-8 truncate">{cardName}</h3>
        <p className="text-xs text-gray-400 font-mono mb-6">{setCode} &bull; #{collectorNumber}</p>

        {/* Collection qty */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-blue-green" />
            <span className="text-sm font-medium text-gray-700">Collection</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setColQty(q => Math.max(0, q - 1))} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors">
              <Minus size={14} />
            </button>
            <span className="w-8 text-center text-lg font-bold text-gray-900">{colQty}</span>
            <button onClick={() => setColQty(q => q + 1)} className="w-8 h-8 rounded-lg bg-blue-green/10 hover:bg-blue-green/20 flex items-center justify-center text-blue-green transition-colors">
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Inventory qty */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-princeton-orange" />
            <span className="text-sm font-medium text-gray-700">Inventory</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setInvQty(q => Math.max(0, q - 1))} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors">
              <Minus size={14} />
            </button>
            <span className="w-8 text-center text-lg font-bold text-gray-900">{invQty}</span>
            <button onClick={() => setInvQty(q => q + 1)} className="w-8 h-8 rounded-lg bg-princeton-orange/10 hover:bg-princeton-orange/20 flex items-center justify-center text-princeton-orange transition-colors">
              <Plus size={14} />
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || (colQty === collectionQty && invQty === inventoryQty)}
          className="w-full py-2.5 rounded-lg bg-blue-green text-white font-semibold text-sm hover:bg-blue-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'sets'
  const [selectedSet, setSelectedSet] = useState(null);
  const [sellingPlatform, setSellingPlatform] = useState('ebay');
  const [showSettings, setShowSettings] = useState(false);
  const [editCard, setEditCard] = useState(null);

  // Set icon cache from Scryfall
  const [setIcons, setSetIcons] = useState({});

  // When a card is clicked, fetch full details
  const handleCardEdit = (c) => {
    if (c.set_code && c.collector_number) {
      // Determine game from selected or from c
      const cardGame = selectedGame || c.game;
      if (cardGame === 'pokemon') {
        pokemonApi.fetchCardBySetAndNumber(c.set_code, c.collector_number)
          .then(card => setEditCard({ ...card, _orig: c }))
          .catch(() => setEditCard({ ...c, _orig: c }));
      } else {
        fetch(`https://api.scryfall.com/cards/${c.set_code.toLowerCase()}/${c.collector_number}`)
          .then(r => r.json())
          .then(sc => {
            setEditCard({
              name: sc.name,
              set_code: (sc.set || '').toUpperCase(),
              collector_number: sc.collector_number,
              image: sc.image_uris?.normal || sc.card_faces?.[0]?.image_uris?.normal || null,
              image_large: sc.image_uris?.large || sc.card_faces?.[0]?.image_uris?.large || null,
              rarity: sc.rarity,
              type_line: sc.type_line || null,
              mana_cost: sc.mana_cost || null,
              oracle_text: sc.oracle_text || sc.card_faces?.[0]?.oracle_text || null,
              power: sc.power ?? null,
              toughness: sc.toughness ?? null,
              price_usd: sc.prices?.usd ? parseFloat(sc.prices.usd) : null,
              price_usd_foil: sc.prices?.usd_foil ? parseFloat(sc.prices.usd_foil) : null,
              _orig: c,
            });
          })
          .catch(() => setEditCard({ ...c, _orig: c }));
      }
    } else {
      setEditCard({ ...c, _orig: c });
    }
  };

  const fetchCards = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });
    setCards(data || []);
    setLoading(false);
    // Backfill missing prices from Scryfall
    if (data && data.some(c => !c.price_cad && c.set_code && c.collector_number)) {
      await syncPricesFromScryfall(data);
      // Re-fetch to get updated prices
      const { data: fresh } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (fresh) setCards(fresh);
    }
  };

  useEffect(() => { fetchCards(); }, []);

  // Fetch set icons from Scryfall (MTG) and TCGdex (Pokemon)
  useEffect(() => {
    // MTG sets
    fetch('https://api.scryfall.com/sets')
      .then(r => r.json())
      .then(data => {
        if (data.data) {
          const map = {};
          data.data.forEach(s => { map[s.code.toUpperCase()] = s.icon_svg_uri; });
          setSetIcons(prev => ({ ...prev, ...map }));
        }
      })
      .catch(() => {});
    // Pokemon sets
    pokemonApi.fetchAllSets()
      .then(sets => {
        const map = {};
        sets.forEach(s => {
          if (s.logo) map[s.code.toUpperCase()] = s.logo;
          else if (s.icon_svg_uri) map[s.code.toUpperCase()] = s.icon_svg_uri;
        });
        setSetIcons(prev => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, []);

  const platform = SELLING_PLATFORMS[sellingPlatform];

  // ── Filter by selected game ──
  const gameCards = selectedGame ? cards.filter(c => c.game === selectedGame) : cards;

  // ── Group by game for the first screen ──
  const gameGroups = useMemo(() => {
    const map = {};
    cards.forEach(c => {
      const g = c.game || 'unknown';
      if (!map[g]) map[g] = { game: g, cards: [] };
      map[g].cards.push(c);
    });
    return Object.values(map).sort((a, b) => b.cards.length - a.cards.length);
  }, [cards]);

  // ── Group by set ──
  const setGroups = useMemo(() => {
    const map = {};
    gameCards.forEach(c => {
      const key = c.set_code || 'Unknown';
      if (!map[key]) map[key] = { set_code: key, cards: [] };
      map[key].cards.push(c);
    });
    return Object.values(map).sort((a, b) => b.cards.length - a.cards.length);
  }, [gameCards]);

  // ── Unique cards (grouped by name+set+number) ──
  const uniqueCards = useMemo(() => {
    const list = selectedSet ? gameCards.filter(c => (c.set_code || 'Unknown') === selectedSet) : gameCards;
    const map = {};
    list.forEach(c => {
      const key = `${c.name}|${c.set_code || ''}|${c.collector_number || ''}`;
      if (!map[key]) {
        map[key] = { name: c.name, set_code: c.set_code || '', collector_number: c.collector_number || '', price: Number(c.price_cad) || 0, collectionQty: 0, inventoryQty: 0 };
      }
      if (c.type === 'inventory') map[key].inventoryQty++;
      else map[key].collectionQty++;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [gameCards, selectedSet]);

  // ── Stats for current view ──
  const totalCards = gameCards.length;
  const collectionCount = gameCards.filter(c => c.type !== 'inventory').length;
  const inventoryCount = gameCards.filter(c => c.type === 'inventory').length;
  const totalValue = gameCards.reduce((s, c) => s + (Number(c.price_cad) || 0), 0);
  const inventoryPayout = gameCards.filter(c => c.type === 'inventory').reduce((s, c) => {
    return s + calcSellingBreakdown(Number(c.price_cad) || 0, platform).payout;
  }, 0);

  // ── Breadcrumb nav ──
  const goBack = () => {
    if (selectedSet) { setSelectedSet(null); }
    else if (selectedGame) { setSelectedGame(null); setViewMode('cards'); setSelectedSet(null); }
  };

  const gameName = selectedGame ? (GAME_META[selectedGame]?.name || selectedGame) : null;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-20 sm:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {selectedGame && (
            <button onClick={goBack} className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 flex-shrink-0">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 truncate">
              {selectedSet && setIcons[selectedSet] && (
                <img src={setIcons[selectedSet]} alt={selectedSet} className="w-7 h-7" />
              )}
              {selectedSet ? selectedSet : gameName || 'Portfolio'}
            </h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              {!selectedGame && 'Choose a game to view your collection.'}
              {selectedGame && !selectedSet && `${collectionCount} in collection · ${inventoryCount} in inventory`}
              {selectedSet && `${uniqueCards.length} unique cards in this set`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Selling Settings</h3>
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Selling Platform</label>
            <div className="flex gap-3">
              {Object.entries(SELLING_PLATFORMS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setSellingPlatform(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    sellingPlatform === key
                      ? 'bg-blue-green text-white border-blue-green'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {sellingPlatform === 'ebay' && (
              <div className="mt-3 text-xs text-gray-400">
                eBay fees: {platform.feePercent}% + ${platform.fixedFee.toFixed(2)} per sale. Est. shipping: ${platform.shippingEstimate.toFixed(2)}.
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <>
          {/* ═══════ LEVEL 1: Game Selector ═══════ */}
          {!selectedGame && (
            <div>
              {gameGroups.length === 0 ? (
                <p className="text-gray-400 text-center py-16">No cards yet. Browse sets to start adding cards.</p>
              ) : (
                <>
                  {/* ── Overview Stats ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-5">
                      <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Total Cards</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">{cards.length}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-5">
                      <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Collection</p>
                      <p className="text-lg sm:text-2xl font-bold text-blue-green">{cards.filter(c => c.type !== 'inventory').length}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-5">
                      <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Inventory</p>
                      <p className="text-lg sm:text-2xl font-bold text-princeton-orange">{cards.filter(c => c.type === 'inventory').length}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-5">
                      <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Total Value</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">${cards.reduce((s, c) => s + (Number(c.price_cad) || 0), 0).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* ── Value Breakdown Charts ── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    <ValueChart
                      title="Collection Value"
                      color="#219ebc"
                      gameGroups={gameGroups}
                      filterFn={c => c.type !== 'inventory'}
                    />
                    <ValueChart
                      title="Inventory Value"
                      color="#fb8500"
                      gameGroups={gameGroups}
                      filterFn={c => c.type === 'inventory'}
                    />
                  </div>

                  {/* ── Game Cards ── */}
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Your Games</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {gameGroups.map(g => {
                    const meta = GAME_META[g.game];
                    const val = g.cards.reduce((s, c) => s + (Number(c.price_cad) || 0), 0);
                    const col = g.cards.filter(c => c.type !== 'inventory').length;
                    const inv = g.cards.filter(c => c.type === 'inventory').length;
                    return (
                      <button
                        key={g.game}
                        onClick={() => setSelectedGame(g.game)}
                        className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-200 overflow-hidden p-6 flex flex-col items-center gap-4 hover:-translate-y-1"
                      >
                        {meta?.logo && (
                          <div className="w-full h-28 flex items-center justify-center rounded-xl bg-gray-50 group-hover:bg-gray-100 transition-colors overflow-hidden">
                            <img src={meta.logo} alt={meta.name} className="max-h-20 max-w-full object-contain" />
                          </div>
                        )}
                        <span className="text-lg font-semibold text-gray-900">{meta?.name || g.game}</span>
                        <div className="flex gap-4 text-xs text-gray-400">
                          <span>{col} collection</span>
                          <span>{inv} inventory</span>
                        </div>
                        {val > 0 && (
                          <span className="text-sm font-bold text-gray-700">${val.toFixed(2)} total</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          )}

          {/* ═══════ LEVEL 2: By Sets / By Cards toggle ═══════ */}
          {selectedGame && !selectedSet && (
            <div>
              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Total</p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900">{totalCards}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Collection</p>
                  <p className="text-lg sm:text-2xl font-bold text-blue-green">{collectionCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Inventory</p>
                  <p className="text-lg sm:text-2xl font-bold text-princeton-orange">{inventoryCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Value</p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900">${totalValue.toFixed(2)}</p>
                </div>
              </div>

              {/* View toggle */}
              <div className="flex gap-1 border-b border-gray-200 mb-6">
                {[
                  { key: 'cards', label: 'By Card', icon: BookOpen },
                  { key: 'sets', label: 'By Set', icon: Layers },
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setViewMode(tab.key)}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                        viewMode === tab.key
                          ? 'border-blue-green text-blue-green'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* ── By Set view ── */}
              {viewMode === 'sets' && (
                setGroups.length === 0 ? (
                  <p className="text-gray-400 text-center py-12">No sets yet for this game.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {setGroups.map(s => {
                      const col = s.cards.filter(c => c.type !== 'inventory').length;
                      const inv = s.cards.filter(c => c.type === 'inventory').length;
                      const val = s.cards.reduce((sum, c) => sum + (Number(c.price_cad) || 0), 0);
                      return (
                        <button
                          key={s.set_code}
                          onClick={() => setSelectedSet(s.set_code)}
                          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {setIcons[s.set_code] && (
                                <img src={setIcons[s.set_code]} alt={s.set_code} className="w-5 h-5" />
                              )}
                              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{s.set_code}</h3>
                            </div>
                            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{s.cards.length} cards</span>
                          </div>
                          <div className="flex gap-3 text-xs mb-2">
                            <span className="text-blue-green font-medium">{col} collection</span>
                            <span className="text-princeton-orange font-medium">{inv} inventory</span>
                          </div>
                          {val > 0 && (
                            <p className="text-sm text-gray-600">Value: <span className="font-bold">${val.toFixed(2)}</span></p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {/* ── By Card view ── */}
              {viewMode === 'cards' && (
                <CardImageGrid
                  uniqueCards={uniqueCards}
                  platform={platform}
                  onEdit={handleCardEdit}
                  game={selectedGame}
                  allCards={gameCards}
                  userId={user?.id}
                  onRefresh={fetchCards}
                />
              )}
            </div>
          )}

          {/* ═══════ LEVEL 3: Inside a Set ═══════ */}
          {selectedGame && selectedSet && (
            <CardImageGrid
              uniqueCards={uniqueCards}
              platform={platform}
              onEdit={handleCardEdit}
              game={selectedGame}
              allCards={gameCards}
              userId={user?.id}
              onRefresh={fetchCards}
            />
          )}
        </>
      )}

      {/* ── Card Detail Modal ── */}
      {editCard && (() => {
        const orig = editCard._orig || editCard;
        const matching = cards.filter(c =>
          c.name === orig.name &&
          (c.set_code || '') === (orig.set_code || '') &&
          (c.collector_number || '') === (orig.collector_number || '')
        );
        const colQty = matching.filter(c => c.type !== 'inventory').length;
        const invQty = matching.filter(c => c.type === 'inventory').length;
        return (
          <CardDetailModal
            card={editCard}
            onClose={() => setEditCard(null)}
            collectionQty={colQty}
            inventoryQty={invQty}
            onSaveQuantity={async (newCol, newInv) => {
              const colCards = matching.filter(c => c.type !== 'inventory');
              const invCards = matching.filter(c => c.type === 'inventory');
              const colDiff = newCol - colCards.length;
              const invDiff = newInv - invCards.length;
              const cardGame = matching[0]?.game || 'mtg';
              const price = editCard.price_usd || Number(matching[0]?.price_cad) || null;

              if (colDiff < 0) await supabase.from('cards').delete().in('id', colCards.slice(0, Math.abs(colDiff)).map(c => c.id));
              if (colDiff > 0) await supabase.from('cards').insert(Array.from({ length: colDiff }, () => ({
                name: orig.name, set_code: orig.set_code || '', collector_number: orig.collector_number || '',
                game: cardGame, price_cad: price, type: 'collection', user_id: user.id,
              })));
              if (invDiff < 0) await supabase.from('cards').delete().in('id', invCards.slice(0, Math.abs(invDiff)).map(c => c.id));
              if (invDiff > 0) await supabase.from('cards').insert(Array.from({ length: invDiff }, () => ({
                name: orig.name, set_code: orig.set_code || '', collector_number: orig.collector_number || '',
                game: cardGame, price_cad: price, type: 'inventory', user_id: user.id,
              })));
              await fetchCards();
              setEditCard(null);
            }}
          />
        );
      })()}
    </div>
  );
}

// ─── Reusable Card Grid with Sort, Filter, Bulk, Export ─────────────
const BULK_THRESHOLD = 1.00;

function CardImageGrid({ uniqueCards, platform, onEdit, game, allCards, userId, onRefresh }) {
  const [imageCache, setImageCache] = useState({});
  const [sortBy, setSortBy] = useState('name'); // name | price-high | price-low | set
  const [filterType, setFilterType] = useState('all'); // all | collection | inventory | bulk | individual
  const [showControls, setShowControls] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // Fetch images for cards
  useEffect(() => {
    const toFetch = uniqueCards.filter(c => c.set_code && c.collector_number && !imageCache[`${c.set_code}|${c.collector_number}`]);
    if (toFetch.length === 0) return;

    let cancelled = false;
    const fetchImages = async () => {
      const newCache = {};

      if (game === 'pokemon') {
        const pokeCache = await pokemonApi.fetchCardImages(toFetch);
        Object.entries(pokeCache).forEach(([key, img]) => {
          newCache[key] = { image: img, price_usd: null };
        });
      } else {
        for (let i = 0; i < toFetch.length; i += 75) {
          const batch = toFetch.slice(i, i + 75);
          try {
            const res = await fetch('https://api.scryfall.com/cards/collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                identifiers: batch.map(c => ({
                  set: c.set_code.toLowerCase(),
                  collector_number: c.collector_number,
                })),
              }),
            });
            const data = await res.json();
            if (data.data) {
              data.data.forEach(sc => {
                const key = `${sc.set.toUpperCase()}|${sc.collector_number}`;
                newCache[key] = {
                  image: sc.image_uris?.normal || sc.card_faces?.[0]?.image_uris?.normal || null,
                  price_usd: sc.prices?.usd ? parseFloat(sc.prices.usd) : null,
                };
              });
            }
          } catch { /* ignore */ }
          if (i + 75 < toFetch.length) await new Promise(r => setTimeout(r, 100));
        }
      }

      if (!cancelled) setImageCache(prev => ({ ...prev, ...newCache }));
    };
    fetchImages();
    return () => { cancelled = true; };
  }, [uniqueCards, game]);

  // Apply filters
  const filtered = useMemo(() => {
    let list = uniqueCards;
    if (filterType === 'collection') list = list.filter(c => c.collectionQty > 0);
    else if (filterType === 'inventory') list = list.filter(c => c.inventoryQty > 0);
    else if (filterType === 'bulk') list = list.filter(c => c.inventoryQty > 0 && c.price < BULK_THRESHOLD);
    else if (filterType === 'individual') list = list.filter(c => c.inventoryQty > 0 && c.price >= BULK_THRESHOLD);
    return list;
  }, [uniqueCards, filterType]);

  // Apply sorting
  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'price-high': return list.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'price-low': return list.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'set': return list.sort((a, b) => (a.set_code || '').localeCompare(b.set_code || '') || a.name.localeCompare(b.name));
      default: return list.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [filtered, sortBy]);

  // Bulk select helpers
  const cardKey = (c) => `${c.name}|${c.set_code}|${c.collector_number}`;
  const toggleSelect = (c) => {
    const key = cardKey(c);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(sorted.map(cardKey)));
  const selectNone = () => setSelected(new Set());

  // Bulk remove
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const handleBulkRemove = async () => {
    if (selected.size === 0 || !allCards) return;
    setBulkRemoving(true);
    const idsToDelete = allCards
      .filter(c => c.type === 'inventory' && selected.has(`${c.name}|${c.set_code || ''}|${c.collector_number || ''}`))
      .map(c => c.id);
    if (idsToDelete.length > 0) {
      for (let i = 0; i < idsToDelete.length; i += 100) {
        await supabase.from('cards').delete().in('id', idsToDelete.slice(i, i + 100));
      }
    }
    setSelected(new Set());
    setBulkMode(false);
    setBulkRemoving(false);
    if (onRefresh) onRefresh();
  };

  // CSV export
  const exportCSV = () => {
    const rows = sorted.filter(c => c.inventoryQty > 0);
    if (rows.length === 0) return;
    const header = 'Name,Set,Collector Number,Quantity,Price (USD),Sell Recommendation\n';
    const csvRows = rows.map(c => {
      const tag = c.price >= BULK_THRESHOLD ? 'Individual' : 'Bulk';
      return `"${c.name}","${c.set_code}","${c.collector_number}",${c.inventoryQty},${(c.price || 0).toFixed(2)},${tag}`;
    }).join('\n');
    const blob = new Blob([header + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${game || 'all'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const invCards = sorted.filter(c => c.inventoryQty > 0);
  const bulkCards = invCards.filter(c => c.price < BULK_THRESHOLD);
  const individualCards = invCards.filter(c => c.price >= BULK_THRESHOLD);
  const bulkValue = bulkCards.reduce((s, c) => s + (c.price || 0) * c.inventoryQty, 0);
  const individualValue = individualCards.reduce((s, c) => s + (c.price || 0) * c.inventoryQty, 0);

  if (uniqueCards.length === 0) {
    return <p className="text-gray-400 text-center py-12">No cards found.</p>;
  }

  return (
    <div>
      {/* ── Sell Recommendation Summary ── */}
      {invCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => setFilterType(filterType === 'individual' ? 'all' : 'individual')}
            className={`rounded-xl border p-3 text-left transition-all ${
              filterType === 'individual' ? 'border-green-400 bg-green-50 shadow-sm' : 'border-gray-200 bg-white hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Tag size={14} className="text-green-600" />
              <span className="text-xs font-semibold text-green-700 uppercase">Sell Individual</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{individualCards.length} <span className="text-xs font-normal text-gray-500">cards</span></p>
            <p className="text-xs text-gray-500">${individualValue.toFixed(2)} value &bull; ≥$1 each</p>
          </button>
          <button
            onClick={() => setFilterType(filterType === 'bulk' ? 'all' : 'bulk')}
            className={`rounded-xl border p-3 text-left transition-all ${
              filterType === 'bulk' ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-gray-200 bg-white hover:border-amber-300'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Tag size={14} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 uppercase">Sell as Bulk</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{bulkCards.length} <span className="text-xs font-normal text-gray-500">cards</span></p>
            <p className="text-xs text-gray-500">${bulkValue.toFixed(2)} value &bull; under $1</p>
          </button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="appearance-none pl-8 pr-4 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 font-medium cursor-pointer hover:border-gray-300 transition-colors"
            >
              <option value="name">Name A–Z</option>
              <option value="price-high">Price: High → Low</option>
              <option value="price-low">Price: Low → High</option>
              <option value="set">Set Code</option>
            </select>
            <ArrowUpDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="appearance-none pl-8 pr-4 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 font-medium cursor-pointer hover:border-gray-300 transition-colors"
            >
              <option value="all">All Cards</option>
              <option value="collection">Collection Only</option>
              <option value="inventory">Inventory Only</option>
              <option value="individual">Individual (≥$1)</option>
              <option value="bulk">Bulk (&lt;$1)</option>
            </select>
            <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk select toggle */}
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              bulkMode ? 'bg-blue-green text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CheckSquare size={14} />
            Select
          </button>

          {/* CSV export */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            title="Export inventory as CSV"
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{selected.size} selected</span>
            <button onClick={selectAll} className="text-xs text-blue-green font-medium hover:underline">Select All</button>
            <button onClick={selectNone} className="text-xs text-gray-500 font-medium hover:underline">Clear</button>
          </div>
          <button
            onClick={handleBulkRemove}
            disabled={selected.size === 0 || bulkRemoving}
            className="px-4 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {bulkRemoving ? 'Removing...' : 'Remove from Inventory'}
          </button>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-gray-400 mb-3">{sorted.length} card{sorted.length !== 1 ? 's' : ''}</p>

      {/* Card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
        {sorted.map((c, i) => {
          const cacheKey = `${c.set_code}|${c.collector_number}`;
          const cached = imageCache[cacheKey];
          const displayPrice = cached?.price_usd ?? c.price;
          const isIndividual = c.inventoryQty > 0 && displayPrice >= BULK_THRESHOLD;
          const isBulk = c.inventoryQty > 0 && displayPrice < BULK_THRESHOLD;
          const key = cardKey(c);
          const isSelected = selected.has(key);

          return (
            <div
              key={`${c.name}-${c.set_code}-${c.collector_number}-${i}`}
              onClick={() => bulkMode ? toggleSelect(c) : onEdit(c)}
              className={`group bg-white rounded-xl border shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 cursor-pointer relative ${
                isSelected ? 'border-blue-green ring-2 ring-blue-green/30' : 'border-gray-200'
              }`}
            >
              {/* Bulk select checkbox */}
              {bulkMode && (
                <div className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-blue-green border-blue-green' : 'bg-white/80 border-gray-300'
                }`}>
                  {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                </div>
              )}

              {/* Card image */}
              <div className="w-full aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
                {cached?.image ? (
                  <img src={cached.image} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl opacity-20">🃏</span>
                  </div>
                )}
              </div>

              {/* Quantity badges */}
              <div className="absolute top-2 left-2 flex gap-1">
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

              {/* Info */}
              <div className="p-3">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{c.set_code} &bull; #{c.collector_number}</p>
                <div className="flex items-center justify-between mt-1">
                  {displayPrice > 0 && (
                    <p className="text-sm font-bold text-gray-900">${displayPrice.toFixed(2)}</p>
                  )}
                  {/* Sell recommendation tag */}
                  {c.inventoryQty > 0 && (
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      isIndividual ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {isIndividual ? 'Individual' : 'Bulk'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Value Chart (horizontal bar chart per game) ────────────────────
function ValueChart({ title, color, gameGroups, filterFn }) {
  const data = gameGroups.map(g => {
    const filtered = g.cards.filter(filterFn);
    const value = filtered.reduce((s, c) => s + (Number(c.price_cad) || 0), 0);
    return { game: GAME_META[g.game]?.name || g.game, value, count: filtered.length };
  }).filter(d => d.count > 0);

  const totalValue = data.reduce((s, d) => s + d.value, 0);
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-lg font-bold" style={{ color }}>${totalValue.toFixed(2)}</span>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No cards yet.</p>
      ) : (
        <div className="space-y-3">
          {data.map(d => {
            const pct = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
            return (
              <div key={d.game}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600 font-medium">{d.game}</span>
                  <span className="text-gray-500">{d.count} cards &bull; ${d.value.toFixed(2)}</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Donut summary if multiple games */}
      {data.length > 1 && totalValue > 0 && (
        <div className="flex items-center justify-center mt-5 pt-4 border-t border-gray-100">
          <svg width="80" height="80" viewBox="0 0 80 80">
            {(() => {
              let cumAngle = -90;
              return data.map((d, i) => {
                const angle = (d.value / totalValue) * 360;
                const startAngle = cumAngle;
                cumAngle += angle;
                const endAngle = cumAngle;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                const largeArc = angle > 180 ? 1 : 0;
                const x1 = 40 + 32 * Math.cos(startRad);
                const y1 = 40 + 32 * Math.sin(startRad);
                const x2 = 40 + 32 * Math.cos(endRad);
                const y2 = 40 + 32 * Math.sin(endRad);
                const opacity = 1 - (i * 0.25);
                return (
                  <path
                    key={d.game}
                    d={`M 40 40 L ${x1} ${y1} A 32 32 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={color}
                    opacity={Math.max(opacity, 0.3)}
                  />
                );
              });
            })()}
            <circle cx="40" cy="40" r="18" fill="white" />
          </svg>
          <div className="ml-4 space-y-1">
            {data.map((d, i) => (
              <div key={d.game} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color, opacity: Math.max(1 - i * 0.25, 0.3) }} />
                <span className="text-gray-600">{d.game}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
