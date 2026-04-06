import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Check } from 'lucide-react';
import CardDetailModal from './CardDetailModal';
import * as pokemonApi from '../api/pokemonTcg';

export default function SetDetail({ set, game, onBack, onAddCard, onAddToInventory, ownedCards, adding }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openCard = async (card) => {
    if (game === 'pokemon') {
      setLoadingDetail(true);
      try {
        const full = await pokemonApi.fetchCard(card.id);
        setSelectedCard(full);
      } catch {
        setSelectedCard(card);
      }
      setLoadingDetail(false);
    } else {
      setSelectedCard(card);
    }
  };

  const fetchPage = async (url) => {
    setLoading(true);
    try {
      const res = await fetch(url);
      const data = await res.json();
      const newCards = (data.data || []).map(c => ({
        scryfall_id: c.id,
        name: c.name,
        set_code: c.set.toUpperCase(),
        collector_number: c.collector_number,
        image: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
        image_large: c.image_uris?.large || c.card_faces?.[0]?.image_uris?.large || null,
        image_small: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
        rarity: c.rarity,
        type_line: c.type_line || null,
        mana_cost: c.mana_cost || null,
        oracle_text: c.oracle_text || c.card_faces?.[0]?.oracle_text || null,
        power: c.power ?? null,
        toughness: c.toughness ?? null,
        price_usd: c.prices?.usd ? parseFloat(c.prices.usd) : null,
        price_usd_foil: c.prices?.usd_foil ? parseFloat(c.prices.usd_foil) : null,
      }));
      setCards(prev => [...prev, ...newCards]);
      setHasMore(data.has_more || false);
      setPage(data.next_page || null);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const fetchPokemonCards = async () => {
    setLoading(true);
    try {
      const result = await pokemonApi.fetchSetCards(set.code || set.id);
      setCards(result.cards);
      setHasMore(false);
    } catch {
      setCards([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    setCards([]);
    if (game === 'pokemon') {
      fetchPokemonCards();
    } else {
      fetchPage(`https://api.scryfall.com/cards/search?order=set&q=set%3A${set.code}&unique=prints`);
    }
  }, [set.code, game]);

  const isOwned = (card) => {
    if (!ownedCards) return false;
    return ownedCards.some(
      c => c.set_code?.toLowerCase() === card.set_code.toLowerCase() &&
           c.collector_number === card.collector_number
    );
  };

  const ownedCount = ownedCards
    ? ownedCards.filter(c => c.set_code?.toLowerCase() === set.code.toLowerCase()).length
    : 0;
  const pct = set.card_count > 0 ? Math.round((ownedCount / set.card_count) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          {(set.logo || set.icon_svg_uri) && (
            <img src={set.logo || set.icon_svg_uri} alt="" className="w-8 h-8 object-contain" />
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{set.name}</h2>
            <p className="text-sm text-gray-400">
              {set.card_count} cards &bull; Released {set.released_at ? new Date(set.released_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-8 mt-4">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-gray-500">Collection progress</span>
          <span className="font-semibold text-gray-700">{ownedCount} / {set.card_count} ({pct}%)</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-green rounded-full transition-all duration-500"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {cards.map((card, idx) => {
          const owned = isOwned(card);
          return (
            <div
              key={`${card.scryfall_id || card.id || idx}-${idx}`}
              className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 cursor-pointer"
              onClick={() => openCard(card)}
            >
              {/* Card image — normal quality */}
              <div className="w-full aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl opacity-20">🃏</span>
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="p-2.5">
                <h3 className="text-xs font-semibold text-gray-900 truncate">{card.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {card.set_code} &bull; {card.collector_number}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs capitalize text-gray-400">{card.rarity}</span>
                  {card.price_usd != null && (
                    <span className="text-xs font-bold text-gray-700">${card.price_usd.toFixed(2)}</span>
                  )}
                </div>
              </div>
              {/* Owned indicator / Add button */}
              {owned ? (
                <div className="absolute top-2 right-2 w-7 h-7 bg-blue-green text-white rounded-full flex items-center justify-center shadow-md">
                  <Check size={14} />
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddCard(card); }}
                  disabled={adding}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 hover:bg-blue-green hover:text-white text-gray-600 rounded-full shadow-md flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-green rounded-full animate-spin" />
        </div>
      )}
      {!loading && hasMore && page && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchPage(page)}
            className="bg-white border border-gray-300 rounded-lg px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            Load more cards
          </button>
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onAddToCollection={(c) => { onAddCard(c); setSelectedCard(null); }}
          onAddToInventory={onAddToInventory ? (c) => { onAddToInventory(c); setSelectedCard(null); } : null}
        />
      )}
    </div>
  );
}
