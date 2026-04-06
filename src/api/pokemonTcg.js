// Pokemon TCG API client using TCGdex (free) for metadata/images
// and Cardmarket pricing (included in TCGdex responses)

const BASE = 'https://api.tcgdex.net/v2/en';

// ── Sets ─────────────────────────────────────────────────────────

// Pokemon Pocket series IDs to exclude (not physical TCG cards)
const POCKET_SERIES = new Set(['tcgp']);
let _pocketSetIds = null;

async function getPocketSetIds() {
  if (_pocketSetIds) return _pocketSetIds;
  const ids = new Set();
  for (const serieId of POCKET_SERIES) {
    try {
      const res = await fetch(`${BASE}/series/${serieId}`);
      const data = await res.json();
      (data.sets || []).forEach(s => ids.add(s.id));
    } catch { /* ignore */ }
  }
  _pocketSetIds = ids;
  return ids;
}

export async function fetchAllSets() {
  const [setsRes, pocketIds] = await Promise.all([
    fetch(`${BASE}/sets`).then(r => r.json()),
    getPocketSetIds(),
  ]);
  // Normalize to match the shape SetBrowser expects, excluding Pocket sets
  return setsRes
    .filter(s => s.cardCount?.total > 0 && !pocketIds.has(s.id))
    .map(s => ({
      id: s.id,
      code: s.id,
      name: s.name,
      icon_svg_uri: s.symbol || null,
      logo: s.logo ? `${s.logo}.png` : null,
      card_count: s.cardCount?.official || s.cardCount?.total || 0,
      released_at: null, // list endpoint doesn't include release date
      set_type: 'expansion',
    }))
    .reverse(); // newest first (TCGdex returns oldest first)
}

export async function fetchSetDetail(setId) {
  const res = await fetch(`${BASE}/sets/${setId}`);
  return await res.json();
}

// ── Cards in a set ───────────────────────────────────────────────
export async function fetchSetCards(setId) {
  const detail = await fetchSetDetail(setId);
  if (!detail.cards) return { cards: [], set: detail };

  // TCGdex set listing only has id/name/image/localId — we need to fetch
  // full card data in parallel for rarity/types/pricing
  const cards = detail.cards.map(c => ({
    id: c.id,
    name: c.name,
    set_code: setId.toUpperCase(),
    collector_number: c.localId,
    image: c.image ? `${c.image}/high.webp` : null,
    image_small: c.image ? `${c.image}/low.webp` : null,
    rarity: null,
    price_usd: null,
  }));

  return { cards, set: detail };
}

// ── Single card detail ───────────────────────────────────────────
export async function fetchCard(cardId) {
  const res = await fetch(`${BASE}/cards/${cardId}`);
  const c = await res.json();
  return normalizeCard(c);
}

export async function fetchCardBySetAndNumber(setCode, collectorNumber) {
  const id = `${setCode.toLowerCase()}-${collectorNumber}`;
  return fetchCard(id);
}

// ── Search ───────────────────────────────────────────────────────
export async function searchCards(query) {
  const [res, pocketIds] = await Promise.all([
    fetch(`${BASE}/cards?name=${encodeURIComponent(query)}`),
    getPocketSetIds(),
  ]);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter(c => {
      const setId = c.id.split('-')[0] || '';
      return !pocketIds.has(setId);
    })
    .slice(0, 20)
    .map(c => ({
      id: c.id,
      name: c.name,
      set_code: c.id.split('-')[0]?.toUpperCase() || '',
      collector_number: c.localId || c.id.split('-').slice(1).join('-'),
      image: c.image ? `${c.image}/high.webp` : null,
      price_cad: null,
    }));
}

// ── Batch image fetch (for owned cards) ──────────────────────────
export async function fetchCardImages(cards) {
  // TCGdex doesn't have a batch endpoint, so we construct image URLs directly
  const cache = {};
  for (const c of cards) {
    if (!c.set_code || !c.collector_number) continue;
    const key = `${c.set_code}|${c.collector_number}`;
    const setId = c.set_code.toLowerCase();
    const num = c.collector_number;
    cache[key] = `https://assets.tcgdex.net/en/${setId.replace(/^([a-z]+)(\d+)/, '$1/$1$2')}/${num}/high.webp`;
  }
  // Now verify a few to find the right path pattern, and also resolve via API
  // Actually, the image URL pattern depends on the serie/set structure
  // Safer: batch individual card lookups (rate limit friendly with small delay)
  const result = {};
  const chunks = [];
  for (let i = 0; i < cards.length; i += 10) {
    chunks.push(cards.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    const promises = chunk.map(async (c) => {
      if (!c.set_code || !c.collector_number) return;
      const key = `${c.set_code}|${c.collector_number}`;
      const id = `${c.set_code.toLowerCase()}-${c.collector_number}`;
      try {
        const res = await fetch(`${BASE}/cards/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.image) {
            result[key] = `${data.image}/high.webp`;
          }
        }
      } catch { /* ignore */ }
    });
    await Promise.all(promises);
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return result;
}

// ── Normalize a full TCGdex card response to our app format ──────
function normalizeCard(c) {
  const priceEur = c.pricing?.cardmarket;
  // Convert EUR to approximate USD (rough 1.08 rate, good enough for display)
  const eurToUsd = 1.08;
  const rawPrice = priceEur?.trend ?? priceEur?.avg ?? null;
  const holoPrice = priceEur?.['trend-holo'] ?? priceEur?.['avg-holo'] ?? null;

  return {
    id: c.id,
    name: c.name,
    set_code: c.set?.id?.toUpperCase() || '',
    set_name: c.set?.name || '',
    collector_number: c.localId || '',
    image: c.image ? `${c.image}/high.webp` : null,
    image_large: c.image ? `${c.image}/high.webp` : null,
    image_small: c.image ? `${c.image}/low.webp` : null,
    rarity: c.rarity || null,
    // Pokemon-specific fields
    hp: c.hp || null,
    types: c.types || [],
    stage: c.stage || null,
    attacks: c.attacks || [],
    abilities: c.abilities || [],
    retreat: c.retreat ?? null,
    illustrator: c.illustrator || null,
    description: c.description || c.effect || null,
    // Map to same price fields the app uses
    price_usd: rawPrice != null ? parseFloat((rawPrice * eurToUsd).toFixed(2)) : null,
    price_usd_foil: holoPrice != null ? parseFloat((holoPrice * eurToUsd).toFixed(2)) : null,
    price_eur: rawPrice,
    price_eur_foil: holoPrice,
    // MTG-compatible fields (null for Pokemon)
    type_line: c.types ? c.types.join(' / ') : null,
    mana_cost: null,
    oracle_text: formatPokemonText(c),
    power: null,
    toughness: null,
  };
}

function formatPokemonText(c) {
  const parts = [];
  if (c.abilities?.length) {
    c.abilities.forEach(a => {
      parts.push(`[Ability] ${a.name}: ${a.effect || ''}`);
    });
  }
  if (c.attacks?.length) {
    c.attacks.forEach(a => {
      const cost = a.cost?.join(', ') || '';
      const dmg = a.damage ? ` — ${a.damage} damage` : '';
      parts.push(`[${cost}] ${a.name}${dmg}${a.effect ? '\n' + a.effect : ''}`);
    });
  }
  if (c.description) parts.push(c.description);
  if (c.effect) parts.push(c.effect);
  return parts.length > 0 ? parts.join('\n\n') : null;
}
