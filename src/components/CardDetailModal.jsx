import React, { useState } from 'react';
import { X, Plus, Package, BookOpen, Minus, Maximize2 } from 'lucide-react';

// Pokemon energy type PNGs
import colorlessImg from '../assets/colourless_poke.png';
import darknessImg from '../assets/dark_poke.png';
import dragonImg from '../assets/dragon_poke.png';
import fairyImg from '../assets/fairy_png.png';
import fightingImg from '../assets/fighting_poke.png';
import fireImg from '../assets/fire_poke.png';
import grassImg from '../assets/grass_poke.png';
import lightningImg from '../assets/electric_poke.png';
import metalImg from '../assets/steel_poke.png';
import psychicImg from '../assets/psychic_poke.png';
import waterImg from '../assets/water_poke.png';

const ENERGY_IMG = {
  Colorless: colorlessImg,
  Darkness: darknessImg,
  Dragon: dragonImg,
  Fairy: fairyImg,
  Fighting: fightingImg,
  Fire: fireImg,
  Grass: grassImg,
  Lightning: lightningImg,
  Metal: metalImg,
  Psychic: psychicImg,
  Water: waterImg,
};

function EnergyIcon({ type, size = 20 }) {
  const src = ENERGY_IMG[type];
  if (!src) return <span className="text-xs text-gray-500">{type}</span>;
  return (
    <img
      src={src}
      alt={type}
      title={type}
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export default function CardDetailModal({ card, onClose, onAddToCollection, onAddToInventory, collectionQty, inventoryQty, onSaveQuantity }) {
  const [expanded, setExpanded] = useState(false);
  if (!card) return null;

  const hasQtyEditor = collectionQty != null && inventoryQty != null && onSaveQuantity;
  const imageSrc = card.image_large || card.image;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Expanded image overlay */}
      {expanded && imageSrc && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md"
          onClick={() => setExpanded(false)}
        >
          <img
            src={imageSrc}
            alt={card.name}
            className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain"
          />
          <button
            onClick={() => setExpanded(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <X size={22} />
          </button>
        </div>
      )}

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto sm:mx-4"
        style={{ margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 p-4 sm:p-6">
          {/* Card image */}
          <div className="flex-shrink-0 w-full sm:w-56 md:w-64 flex justify-center relative group">
            {imageSrc ? (
              <>
                <img
                  src={imageSrc}
                  alt={card.name}
                  className="w-48 sm:w-56 md:w-64 h-auto rounded-xl shadow-lg object-contain"
                />
                <button
                  onClick={() => setExpanded(true)}
                  className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Expand image"
                >
                  <Maximize2 size={14} />
                </button>
              </>
            ) : (
              <div className="w-48 sm:w-56 md:w-64 aspect-[5/7] bg-gray-100 rounded-xl flex items-center justify-center">
                <span className="text-6xl opacity-20">🃏</span>
              </div>
            )}
          </div>

          {/* Card details */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 pr-8">{card.name}</h2>

            {/* Set & Number */}
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{card.set_code}</span>
              <span>&bull;</span>
              <span>#{card.collector_number}</span>
              {card.rarity && (
                <>
                  <span>&bull;</span>
                  <span className="capitalize">{card.rarity}</span>
                </>
              )}
            </div>

            {/* Type & Mana Cost / HP */}
            {card.types?.length > 0 && !card.mana_cost && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Type</p>
                <div className="flex items-center gap-1.5">
                  {card.types.map((t, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <EnergyIcon type={t} size={18} />
                      <span className="text-sm text-gray-700">{t}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {card.type_line && card.mana_cost && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Type</p>
                <p className="text-sm text-gray-700">{card.type_line}</p>
              </div>
            )}
            {card.hp != null && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">HP</p>
                <p className="text-sm font-bold text-gray-800">{card.hp}</p>
              </div>
            )}
            {card.mana_cost && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Mana Cost</p>
                <div className="flex items-center gap-1">
                  {(card.mana_cost.match(/\{[^}]+\}/g) || []).map((sym, i) => {
                    const code = sym.replace(/[{}]/g, '').replace('/', '');
                    return (
                      <img
                        key={i}
                        src={`https://svgs.scryfall.io/card-symbols/${code}.svg`}
                        alt={sym}
                        className="w-5 h-5"
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pokemon Abilities */}
            {card.abilities?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Abilities</p>
                {card.abilities.map((a, i) => (
                  <div key={i} className="bg-purple-50 border border-purple-100 rounded-lg p-2.5 mb-2">
                    <p className="text-sm font-semibold text-purple-800">{a.type || 'Ability'}: {a.name}</p>
                    {a.effect && <p className="text-xs text-purple-700 mt-1 leading-relaxed">{a.effect}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Pokemon Attacks */}
            {card.attacks?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Attacks</p>
                {card.attacks.map((a, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {a.cost?.map((c, j) => <EnergyIcon key={j} type={c} size={18} />)}
                        <span className="text-sm font-semibold text-gray-900 ml-1">{a.name}</span>
                      </div>
                      {a.damage && <span className="text-sm font-bold text-gray-700">{a.damage}</span>}
                    </div>
                    {a.effect && <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{a.effect}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Pokemon Retreat & Weakness */}
            {card.retreat != null && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Retreat Cost</p>
                <div className="flex items-center gap-1">
                  {Array.from({ length: card.retreat }, (_, i) => (
                    <EnergyIcon key={i} type="Colorless" size={18} />
                  ))}
                  {card.retreat === 0 && <span className="text-sm text-gray-500">Free</span>}
                </div>
              </div>
            )}

            {/* MTG Oracle text (only show for non-Pokemon or if no attacks/abilities parsed) */}
            {card.oracle_text && !card.attacks?.length && !card.abilities?.length && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Card Text</p>
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{card.oracle_text}</p>
              </div>
            )}

            {/* Power/Toughness (MTG) */}
            {card.power != null && card.toughness != null && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">P/T</p>
                <p className="text-sm font-bold text-gray-800">{card.power}/{card.toughness}</p>
              </div>
            )}

            {/* Stage & Illustrator (Pokemon) */}
            {(card.stage || card.illustrator) && (
              <div className="flex gap-4 mb-4">
                {card.stage && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Stage</p>
                    <p className="text-sm text-gray-700">{card.stage}</p>
                  </div>
                )}
                {card.illustrator && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Illustrator</p>
                    <p className="text-sm text-gray-700">{card.illustrator}</p>
                  </div>
                )}
              </div>
            )}

            {/* Pricing */}
            <div className="border-t border-gray-100 pt-4 mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Market Prices</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Raw (Near Mint)</p>
                  <p className="text-lg font-bold text-gray-900">
                    {card.price_usd != null ? `$${Number(card.price_usd).toFixed(2)}` : '—'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Foil</p>
                  <p className="text-lg font-bold text-gray-900">
                    {card.price_usd_foil != null ? `$${Number(card.price_usd_foil).toFixed(2)}` : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Quantity Editor (when viewing owned cards) */}
            {hasQtyEditor && (
              <QuantityEditor
                initialCol={collectionQty}
                initialInv={inventoryQty}
                onSave={onSaveQuantity}
              />
            )}

            {/* Add buttons (when browsing/searching) */}
            {!hasQtyEditor && (onAddToCollection || onAddToInventory) && (
              <div className="flex gap-3 mt-6">
                {onAddToCollection && (
                  <button
                    onClick={() => onAddToCollection(card)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-green hover:bg-blue-green/90 text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm transition-colors"
                  >
                    <Plus size={16} />
                    Add to Collection
                  </button>
                )}
                {onAddToInventory && (
                  <button
                    onClick={() => onAddToInventory(card)}
                    className="flex-1 flex items-center justify-center gap-2 bg-princeton-orange hover:bg-amber-flame text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm transition-colors"
                  >
                    <Package size={16} />
                    Add to Inventory
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Quantity Editor ─────────────────────────────────────────
function QuantityEditor({ initialCol, initialInv, onSave }) {
  const [colQty, setColQty] = useState(initialCol);
  const [invQty, setInvQty] = useState(initialInv);
  const [saving, setSaving] = useState(false);
  const changed = colQty !== initialCol || invQty !== initialInv;

  const handleSave = async () => {
    setSaving(true);
    await onSave(colQty, invQty);
    setSaving(false);
  };

  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Your Copies</p>

      <div className="flex items-center justify-between mb-3">
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

      <div className="flex items-center justify-between mb-4">
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

      {changed && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-blue-green text-white font-semibold text-sm hover:bg-blue-green/90 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}
