import React, { useState, useEffect, useMemo } from 'react';
import { Crown, Clock, TrendingUp, BookOpen, Package } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import CardDetailModal from '../components/CardDetailModal';
import * as pokemonApi from '../api/pokemonTcg';
import mtgLogo from '../assets/mtg_logo.png';
import pokemonLogo from '../assets/pokemong_logo.png';

const GAME_META = {
  mtg: { name: 'Magic: The Gathering', logo: mtgLogo },
  pokemon: { name: 'Pokémon', logo: pokemonLogo },
};

export default function DashboardPage({ onSelectGame }) {
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imageCache, setImageCache] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);

  // Fetch all cards
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: false });
      setCards(data || []);
      setLoading(false);
    })();
  }, []);

  // Stats
  const totalCards = cards.length;
  const collectionCount = cards.filter(c => c.type !== 'inventory').length;
  const inventoryCount = cards.filter(c => c.type === 'inventory').length;
  const totalValue = cards.reduce((s, c) => s + (Number(c.price_cad) || 0), 0);

  // Unique cards
  const uniqueCards = useMemo(() => {
    const map = {};
    cards.forEach(c => {
      const key = `${c.name}|${c.set_code || ''}|${c.collector_number || ''}`;
      if (!map[key]) {
        map[key] = { name: c.name, set_code: c.set_code || '', collector_number: c.collector_number || '', price: Number(c.price_cad) || 0, collectionQty: 0, inventoryQty: 0, game: c.game };
      }
      if (c.type === 'inventory') map[key].inventoryQty++;
      else map[key].collectionQty++;
    });
    return Object.values(map);
  }, [cards]);

  // Most valuable (top 8)
  const mostValuable = useMemo(() => {
    return [...uniqueCards].filter(c => c.price > 0).sort((a, b) => b.price - a.price).slice(0, 8);
  }, [uniqueCards]);

  // Recently added (last 10 unique)
  const recentCards = useMemo(() => {
    const seen = new Set();
    return cards.filter(c => {
      const key = `${c.name}|${c.set_code || ''}|${c.collector_number || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
  }, [cards]);

  // Game groups
  const gameGroups = useMemo(() => {
    const map = {};
    cards.forEach(c => {
      if (!map[c.game]) map[c.game] = { game: c.game, cards: [] };
      map[c.game].cards.push(c);
    });
    return Object.values(map).sort((a, b) => b.cards.length - a.cards.length);
  }, [cards]);

  // Fetch images for cards
  useEffect(() => {
    const all = [...mostValuable, ...recentCards];
    const toFetch = all.filter(c => c.set_code && c.collector_number && !imageCache[`${c.set_code}|${c.collector_number}`]);
    const seen = new Set();
    const unique = [];
    toFetch.forEach(c => {
      const key = `${c.set_code}|${c.collector_number}`;
      if (!seen.has(key)) { seen.add(key); unique.push(c); }
    });
    if (unique.length === 0) return;
    let cancelled = false;

    const fetchImages = async () => {
      // Split by game
      const mtgCards = unique.filter(c => c.game === 'mtg');
      const pokeCards = unique.filter(c => c.game === 'pokemon');
      const newCache = {};

      // MTG: batch via Scryfall
      for (let i = 0; i < mtgCards.length; i += 75) {
        const batch = mtgCards.slice(i, i + 75);
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
        if (i + 75 < mtgCards.length) await new Promise(r => setTimeout(r, 100));
      }

      // Pokemon: via TCGdex
      if (pokeCards.length > 0) {
        const pokeCache = await pokemonApi.fetchCardImages(pokeCards);
        Object.assign(newCache, pokeCache);
      }

      if (!cancelled) setImageCache(prev => ({ ...prev, ...newCache }));
    };
    fetchImages();
    return () => { cancelled = true; };
  }, [mostValuable, recentCards]);

  // Open card detail modal
  const openCard = (cardInfo) => {
    const fallback = imageCache[`${cardInfo.set_code}|${cardInfo.collector_number}`];
    if (cardInfo.set_code && cardInfo.collector_number) {
      if (cardInfo.game === 'pokemon') {
        pokemonApi.fetchCardBySetAndNumber(cardInfo.set_code, cardInfo.collector_number)
          .then(card => setSelectedCard({ ...card, _orig: cardInfo }))
          .catch(() => setSelectedCard({ ...cardInfo, image: fallback, _orig: cardInfo }));
      } else {
        fetch(`https://api.scryfall.com/cards/${cardInfo.set_code.toLowerCase()}/${cardInfo.collector_number}`)
          .then(r => r.json())
          .then(sc => {
            setSelectedCard({
              name: sc.name,
              set_code: (sc.set || '').toUpperCase(),
              collector_number: sc.collector_number,
              image: sc.image_uris?.normal || sc.card_faces?.[0]?.image_uris?.normal || fallback || null,
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
          .catch(() => setSelectedCard({ ...cardInfo, image: fallback, _orig: cardInfo }));
      }
    } else {
      setSelectedCard({ ...cardInfo, image: fallback, _orig: cardInfo });
    }
  };

  // Save quantity
  const handleSaveQuantity = async (newCol, newInv) => {
    const orig = selectedCard._orig || selectedCard;
    const matching = cards.filter(c =>
      c.name === orig.name && (c.set_code || '') === (orig.set_code || '') && (c.collector_number || '') === (orig.collector_number || '')
    );
    const colCards = matching.filter(c => c.type !== 'inventory');
    const invCards = matching.filter(c => c.type === 'inventory');
    const colDiff = newCol - colCards.length;
    const invDiff = newInv - invCards.length;
    const price = selectedCard.price_usd || Number(matching[0]?.price_cad) || null;
    const game = matching[0]?.game || 'mtg';

    if (colDiff < 0) await supabase.from('cards').delete().in('id', colCards.slice(0, Math.abs(colDiff)).map(c => c.id));
    if (colDiff > 0) await supabase.from('cards').insert(Array.from({ length: colDiff }, () => ({
      name: orig.name, set_code: orig.set_code || '', collector_number: orig.collector_number || '',
      game, price_cad: price, type: 'collection', user_id: user.id,
    })));
    if (invDiff < 0) await supabase.from('cards').delete().in('id', invCards.slice(0, Math.abs(invDiff)).map(c => c.id));
    if (invDiff > 0) await supabase.from('cards').insert(Array.from({ length: invDiff }, () => ({
      name: orig.name, set_code: orig.set_code || '', collector_number: orig.collector_number || '',
      game, price_cad: price, type: 'inventory', user_id: user.id,
    })));
    // Re-fetch
    const { data } = await supabase.from('cards').select('*').order('created_at', { ascending: false });
    setCards(data || []);
    setSelectedCard(null);
  };

  const CardTile = ({ c, showPrice }) => {
    const cacheKey = `${c.set_code}|${c.collector_number}`;
    const image = imageCache[cacheKey];
    return (
      <div
        onClick={() => openCard(c)}
        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 cursor-pointer relative"
      >
        {showPrice && c.price > 0 && (
          <div className="absolute top-2 left-2 z-10">
            <span className="flex items-center gap-0.5 bg-amber-flame text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
              <TrendingUp size={10} /> ${(c.price || Number(c.price_cad) || 0).toFixed(2)}
            </span>
          </div>
        )}
        {!showPrice && ((c.collectionQty > 0 || c.inventoryQty > 0) ? (
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
        ) : null)}
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
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-20 sm:pb-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Welcome back</h1>
      <p className="text-gray-500 text-sm mb-6 sm:mb-8">Here's an overview of your entire collection.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-56" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No cards yet</p>
          <p className="text-sm mt-1">Head to Explore to start adding cards to your collection.</p>
        </div>
      ) : (
        <>
          {/* Your Games */}
          {gameGroups.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Games</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {gameGroups.map(g => {
                  const meta = GAME_META[g.game];
                  const val = g.cards.reduce((s, c) => s + (Number(c.price_cad) || 0), 0);
                  const col = g.cards.filter(c => c.type !== 'inventory').length;
                  const inv = g.cards.filter(c => c.type === 'inventory').length;
                  return (
                    <button
                      key={g.game}
                      onClick={() => onSelectGame(g.game)}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4"
                    >
                      {meta?.logo && (
                        <img src={meta.logo} alt={meta.name} className="h-10 w-10 object-contain" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-gray-900">{meta?.name || g.game}</h3>
                        <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                          <span className="text-blue-green">{col} collection</span>
                          <span className="text-princeton-orange">{inv} inventory</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-700">${val.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Most Valuable */}
          {mostValuable.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Crown size={18} className="text-amber-flame" />
                <h2 className="text-lg font-semibold text-gray-900">Most Valuable</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {mostValuable.map((c, i) => <CardTile key={`mv-${i}`} c={c} showPrice />)}
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
                {recentCards.map((c, i) => <CardTile key={`rc-${i}`} c={c} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Card Detail Modal */}
      {selectedCard && (() => {
        const orig = selectedCard._orig || selectedCard;
        const matching = cards.filter(c =>
          c.name === orig.name && (c.set_code || '') === (orig.set_code || '') && (c.collector_number || '') === (orig.collector_number || '')
        );
        const colQty = matching.filter(c => c.type !== 'inventory').length;
        const invQty = matching.filter(c => c.type === 'inventory').length;
        return (
          <CardDetailModal
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            collectionQty={colQty}
            inventoryQty={invQty}
            onSaveQuantity={handleSaveQuantity}
          />
        );
      })()}
    </div>
  );
}
