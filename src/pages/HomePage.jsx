import React from 'react';
import mtgLogo from '../assets/mtg_logo.png';
import pokemonLogo from '../assets/pokemong_logo.png';

const GAMES = [
  {
    key: 'mtg',
    name: 'Magic: The Gathering',
    logo: mtgLogo,
  },
  {
    key: 'pokemon',
    name: 'Pokémon',
    logo: pokemonLogo,
  },
];

export default function HomePage({ onSelectGame }) {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12 pb-20 sm:pb-12">
      {/* Hero */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Explore</h1>
        <p className="text-base sm:text-lg text-gray-500">Choose a game to browse sets and manage your collection.</p>
      </div>

      {/* Game Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 max-w-2xl mx-auto">
        {GAMES.map(game => (
          <button
            key={game.key}
            onClick={() => onSelectGame(game.key)}
            className="group relative bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-200 overflow-hidden p-8 flex flex-col items-center gap-4 hover:-translate-y-1"
          >
            <div className="w-full h-40 flex items-center justify-center rounded-xl bg-gray-50 group-hover:bg-gray-100 transition-colors overflow-hidden">
              <img
                src={game.logo}
                alt={game.name}
                className="max-h-32 max-w-full object-contain"
              />
            </div>
            <span className="text-lg font-semibold text-gray-900">{game.name}</span>
            <span className="text-sm text-gray-400">Browse sets &amp; cards</span>
          </button>
        ))}
      </div>
    </div>
  );
}
