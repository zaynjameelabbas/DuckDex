import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import * as pokemonApi from '../api/pokemonTcg';

export default function SetBrowser({ game, onSelectSet, ownedCards }) {
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchSets = async () => {
      setLoading(true);
      try {
        if (game === 'pokemon') {
          const pokeSets = await pokemonApi.fetchAllSets();
          setSets(pokeSets);
        } else {
          const res = await fetch('https://api.scryfall.com/sets');
          const data = await res.json();
          const validTypes = ['core', 'expansion', 'masters', 'draft_innovation', 'commander'];
          const filtered = (data.data || [])
            .filter(s => validTypes.includes(s.set_type) && s.card_count > 0)
            .sort((a, b) => new Date(b.released_at) - new Date(a.released_at));
          setSets(filtered);
        }
      } catch {
        setSets([]);
      }
      setLoading(false);
    };
    fetchSets();
  }, [game]);

  // Count owned cards per set
  const getSetProgress = (setCode) => {
    if (!ownedCards) return 0;
    return ownedCards.filter(c => c.set_code?.toLowerCase() === setCode.toLowerCase()).length;
  };

  const filteredSets = sets.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-48" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-green/40 focus:border-blue-green placeholder:text-gray-400"
            placeholder="Search by sets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sets Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
        {filteredSets.map(set => {
          const owned = getSetProgress(set.code);
          const total = set.card_count;
          const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

          return (
            <button
              key={set.id}
              onClick={() => onSelectSet(set)}
              className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-1 text-left"
            >
              {/* Set icon / image */}
              <div className="relative w-full h-28 bg-gray-50 flex items-center justify-center p-4">
                <span className="absolute top-2 right-2 text-xs text-gray-400">
                  {set.released_at ? new Date(set.released_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </span>
                {set.logo ? (
                  <img src={set.logo} alt={set.name} className="h-14 w-auto object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                ) : set.icon_svg_uri ? (
                  <img src={set.icon_svg_uri} alt={set.name} className="h-12 w-12 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <span className="text-3xl opacity-20">🃏</span>
                )}
              </div>
              {/* Progress bar */}
              {owned > 0 && (
                <div className="w-full h-1.5 bg-gray-100">
                  <div
                    className="h-full bg-blue-green rounded-r-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              )}
              {/* Info */}
              <div className="p-3">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{set.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Progress: {owned} / {total}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
