import React, { useState, useEffect } from 'react';
import { BookOpen, Package } from 'lucide-react';

export default function CardGrid({ cards, loading, error, onCardClick }) {
  const [imageCache, setImageCache] = useState({});

  // Fetch Scryfall images for cards with set_code + collector_number
  useEffect(() => {
    const toFetch = cards.filter(c => c.set_code && c.collector_number && !imageCache[`${c.set_code}|${c.collector_number}`]);
    // Deduplicate
    const seen = new Set();
    const unique = [];
    toFetch.forEach(c => {
      const key = `${c.set_code}|${c.collector_number}`;
      if (!seen.has(key)) { seen.add(key); unique.push(c); }
    });
    if (unique.length === 0) return;

    let cancelled = false;
    const fetchImages = async () => {
      const newCache = {};
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
            data.data.forEach(sc => {
              const key = `${sc.set.toUpperCase()}|${sc.collector_number}`;
              newCache[key] = sc.image_uris?.normal || sc.card_faces?.[0]?.image_uris?.normal || null;
            });
          }
        } catch { /* ignore */ }
        if (i + 75 < unique.length) await new Promise(r => setTimeout(r, 100));
      }
      if (!cancelled) setImageCache(prev => ({ ...prev, ...newCache }));
    };
    fetchImages();
    return () => { cancelled = true; };
  }, [cards]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-72" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-red-500 py-8">{error}</div>;
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">No cards yet</p>
        <p className="text-sm mt-1">Add cards to your collection to see them here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {cards.map(card => {
        const cacheKey = `${card.set_code}|${card.collector_number}`;
        const image = imageCache[cacheKey];
        return (
          <div
            key={card.id}
            onClick={() => onCardClick && onCardClick(card, imageCache[`${card.set_code}|${card.collector_number}`])}
            className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 relative cursor-pointer"
          >
            {/* Type badge */}
            {card.type && (
              <div className="absolute top-2 left-2 z-10">
                {card.type === 'inventory' ? (
                  <span className="flex items-center gap-0.5 bg-princeton-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                    <Package size={10} /> Inventory
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 bg-blue-green text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                    <BookOpen size={10} /> Collection
                  </span>
                )}
              </div>
            )}
            {/* Card image */}
            <div className="w-full aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
              {image ? (
                <img src={image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                  <span className="text-4xl opacity-20">🃏</span>
                </div>
              )}
            </div>
            {/* Card info */}
            <div className="p-3">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{card.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {card.set_code || 'Unknown Set'} {card.collector_number ? `• ${card.collector_number}` : ''}
              </p>
              {card.price_cad != null && Number(card.price_cad) > 0 && (
                <p className="text-sm font-bold text-gray-900 mt-1">${Number(card.price_cad).toFixed(2)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
