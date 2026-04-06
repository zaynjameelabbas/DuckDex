import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, RotateCcw, Loader, SwitchCamera, Zap, BookOpen, Package, Search, Check } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import * as pokemonApi from '../api/pokemonTcg';
import CardDetailModal from '../components/CardDetailModal';

// --- Helpers ---

// Crop a canvas region to a new data URL
function cropRegion(sourceCanvas, yStart, yEnd) {
  const c = document.createElement('canvas');
  c.width = sourceCanvas.width;
  c.height = yEnd - yStart;
  const ctx = c.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, yStart, c.width, c.height, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

// Parse the card name from OCR of the top region
function parseCardName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const nameLine = lines.find(l =>
    !/^(BASIC|STAGE|TRAINER|SUPPORTER|ITEM|ENERGY|HP|Lv\.|V\s|VSTAR|VMAX|GX|EX|\d+)/i.test(l) &&
    l.length >= 3 && l.length <= 50
  ) || lines[0] || '';
  return nameLine.replace(/[^a-zA-Z0-9\s',:-]/g, '').replace(/\s+/g, ' ').trim();
}

// Parse collector number + set code from OCR of the bottom region
// MTG bottom text examples: "042/287 U BRO", "123/280 • M • MKM", "15 R DMU"
function parseCollectorInfo(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const all = lines.join(' ');

  // Try collector_number/total pattern  e.g. "042/287"
  const numMatch = all.match(/(\d{1,4})\s*[/\\]\s*\d{1,4}/);
  const collectorNumber = numMatch ? numMatch[1].replace(/^0+/, '') : null;

  // Try 3-letter set code (uppercase), exclude common false positives
  const SKIP = new Set(['THE', 'AND', 'FOR', 'NOT', 'ALL', 'BUT', 'HAS', 'ITS', 'LET', 'MAY', 'NOR', 'OUR', 'OUT', 'OWN', 'SAY', 'SHE', 'TOO', 'USE', 'HER', 'HIM', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'GOT', 'ONE', 'TWO', 'TEN', 'ART', 'LLC', 'INC', 'TM ']);
  const codeMatch = all.match(/\b([A-Z]{3})\b/g);
  const setCode = codeMatch?.find(c => !SKIP.has(c)) || null;

  return { collectorNumber, setCode };
}

// Map a Scryfall card object to our normalized shape
function normalizeScryfallCard(sc) {
  return {
    id: sc.id,
    name: sc.name,
    set_code: sc.set.toUpperCase(),
    set_name: sc.set_name,
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
  };
}

export default function ScannerPage() {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [capturedImage, setCapturedImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(''); // status text
  const [ocrName, setOcrName] = useState('');
  const [ocrInfo, setOcrInfo] = useState(null); // { collectorNumber, setCode }
  const [exactMatch, setExactMatch] = useState(null); // single exact card
  const [results, setResults] = useState([]); // all printings
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedGame, setSelectedGame] = useState('mtg');
  const [manualSearch, setManualSearch] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState(null);

  // --- Camera ---
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setError('');
    } catch {
      setError('Camera access denied. Please allow camera permissions.');
      setCameraActive(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
  }, []);

  useEffect(() => { startCamera(); return () => stopCamera(); }, []);
  useEffect(() => { if (cameraActive) startCamera(); }, [facingMode]);

  const flipCamera = () => setFacingMode(p => p === 'environment' ? 'user' : 'environment');

  // --- Capture & OCR ---
  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const fullImage = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(fullImage);
    stopCamera();
    runDualOCR(canvas);
  };

  const runDualOCR = async (canvas) => {
    setProcessing(true);
    setProcessingStep('Reading card name...');
    setOcrName('');
    setOcrInfo(null);
    setExactMatch(null);
    setResults([]);
    setError('');

    try {
      // Zone 1: Top 30% — card name
      const topImg = cropRegion(canvas, 0, Math.floor(canvas.height * 0.30));
      const topResult = await Tesseract.recognize(topImg, 'eng', { logger: () => {} });
      const cardName = parseCardName(topResult.data.text);

      if (!cardName) {
        setError('Could not read card name. Try better lighting or centering.');
        setProcessing(false);
        return;
      }
      setOcrName(cardName);
      setManualSearch(cardName);

      if (selectedGame === 'mtg') {
        // Zone 2: Bottom 18% — collector number & set code
        setProcessingStep('Reading set info...');
        const bottomImg = cropRegion(canvas, Math.floor(canvas.height * 0.82), canvas.height);
        const bottomResult = await Tesseract.recognize(bottomImg, 'eng', { logger: () => {} });
        const info = parseCollectorInfo(bottomResult.data.text);
        setOcrInfo(info);

        // Try exact match first
        if (info.setCode && info.collectorNumber) {
          setProcessingStep('Looking up exact card...');
          try {
            const res = await fetch(`https://api.scryfall.com/cards/${info.setCode.toLowerCase()}/${info.collectorNumber}`);
            if (res.ok) {
              const sc = await res.json();
              setExactMatch(normalizeScryfallCard(sc));
              setProcessing(false);
              return;
            }
          } catch { /* fall through to search */ }
        }

        // Fallback: fetch ALL printings by name
        setProcessingStep('Searching all printings...');
        await searchAllPrintings(cardName);
      } else {
        // Pokemon: search by name
        setProcessingStep('Searching...');
        const cards = await pokemonApi.searchCards(cardName);
        setResults(cards.slice(0, 12));
      }
    } catch {
      setError('OCR failed. Try again with a clearer image.');
    }
    setProcessing(false);
  };

  // Fetch ALL printings of a card name from Scryfall (paginated)
  const searchAllPrintings = async (name) => {
    try {
      // Use exact name match first for precise results
      const exactUrl = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(name)}"&unique=prints&order=released&dir=desc`;
      let res = await fetch(exactUrl);
      let data = await res.json();

      // If exact name fails, fall back to fuzzy
      if (!data.data || data.data.length === 0) {
        const fuzzyUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}&unique=prints&order=released&dir=desc`;
        res = await fetch(fuzzyUrl);
        data = await res.json();
      }

      if (data.data && data.data.length > 0) {
        setResults(data.data.slice(0, 30).map(normalizeScryfallCard));
      } else {
        setResults([]);
        setError(`No results for "${name}". You can edit and re-search below.`);
      }
    } catch {
      setError('Search failed. Check your connection.');
    }
  };

  // Manual re-search
  const handleManualSearch = async () => {
    if (!manualSearch.trim()) return;
    setProcessing(true);
    setProcessingStep('Searching...');
    setExactMatch(null);
    setResults([]);
    setError('');

    if (selectedGame === 'pokemon') {
      const cards = await pokemonApi.searchCards(manualSearch.trim());
      setResults(cards.slice(0, 12));
    } else {
      await searchAllPrintings(manualSearch.trim());
    }
    setProcessing(false);
  };

  // Open full card detail
  const openCardDetail = async (card) => {
    if (selectedGame === 'pokemon' && card.set_code && card.collector_number) {
      try {
        const full = await pokemonApi.fetchCardBySetAndNumber(card.set_code, card.collector_number);
        setSelectedCard(full);
      } catch { setSelectedCard(card); }
    } else if (card.set_code && card.collector_number) {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/${card.set_code.toLowerCase()}/${card.collector_number}`);
        const sc = await res.json();
        setSelectedCard(normalizeScryfallCard(sc));
      } catch { setSelectedCard(card); }
    } else {
      setSelectedCard(card);
    }
  };

  // Add card to collection/inventory
  const addCard = async (card, type) => {
    const { error: err } = await supabase.from('cards').insert([{
      name: card.name,
      set_code: card.set_code || '',
      collector_number: card.collector_number || '',
      game: selectedGame,
      price_cad: card.price_usd || null,
      type,
      user_id: user.id,
    }]);
    if (!err) {
      setAdded(`${card.name} (${card.set_code} #${card.collector_number}) → ${type}!`);
      setTimeout(() => setAdded(null), 2500);
    }
  };

  // Reset
  const reset = () => {
    setCapturedImage(null);
    setOcrName('');
    setOcrInfo(null);
    setExactMatch(null);
    setResults([]);
    setError('');
    setManualSearch('');
    setProcessing(false);
    startCamera();
  };

  // --- Render helpers ---
  const renderCardTile = (card, idx) => (
    <div
      key={card.id || idx}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden"
    >
      <div className="aspect-[2.5/3.5] bg-gray-50 overflow-hidden cursor-pointer" onClick={() => openCardDetail(card)}>
        {card.image ? (
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">🃏</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-gray-900 truncate">{card.name}</p>
        <p className="text-[10px] text-gray-400 truncate">
          {card.set_name || card.set_code} #{card.collector_number}
          {card.price_usd != null && <span className="ml-1 text-green-600 font-semibold">${card.price_usd.toFixed(2)}</span>}
        </p>
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={() => addCard(card, 'collection')}
            className="flex-1 flex items-center justify-center gap-1 bg-blue-green text-white text-[10px] font-semibold py-1.5 rounded-md hover:bg-blue-green/90 transition-colors"
          >
            <BookOpen size={10} /> Collect
          </button>
          <button
            onClick={() => addCard(card, 'inventory')}
            className="flex-1 flex items-center justify-center gap-1 bg-princeton-orange text-white text-[10px] font-semibold py-1.5 rounded-md hover:bg-amber-flame transition-colors"
          >
            <Package size={10} /> Inv
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Card Scanner</h1>

      {/* Game selector */}
      <div className="flex gap-2 mb-4">
        {['mtg', 'pokemon'].map(g => (
          <button
            key={g}
            onClick={() => setSelectedGame(g)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedGame === g ? 'bg-blue-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {g === 'mtg' ? 'Magic: The Gathering' : 'Pokémon'}
          </button>
        ))}
      </div>

      {/* Camera / captured image */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] mb-4">
        {cameraActive && !capturedImage && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {/* Viewfinder guides */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Card outline */}
              <div className="absolute inset-6 border-2 border-white/30 rounded-xl" />
              {/* Top zone highlight */}
              <div className="absolute top-6 left-6 right-6 h-[28%] border-b-2 border-dashed border-amber-flame/60" />
              <p className="absolute top-8 left-8 text-amber-flame/80 text-[10px] font-semibold">CARD NAME</p>
              {/* Bottom zone highlight (MTG only) */}
              {selectedGame === 'mtg' && (
                <>
                  <div className="absolute bottom-6 left-6 right-6 h-[16%] border-t-2 border-dashed border-amber-flame/60" />
                  <p className="absolute bottom-8 right-8 text-amber-flame/80 text-[10px] font-semibold">SET / #</p>
                </>
              )}
              <p className="absolute bottom-2 left-0 right-0 text-center text-white/60 text-[10px]">
                Fill the card within the frame
              </p>
            </div>
          </>
        )}

        {capturedImage && (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        )}

        {!cameraActive && !capturedImage && (
          <div className="w-full h-full flex items-center justify-center">
            <button onClick={startCamera} className="flex items-center gap-2 bg-blue-green text-white px-6 py-3 rounded-xl text-sm font-medium">
              <Camera size={18} /> Start Camera
            </button>
          </div>
        )}

        {/* Processing overlay */}
        {processing && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <Loader size={32} className="text-white animate-spin" />
            <p className="text-white text-sm font-medium">{processingStep}</p>
          </div>
        )}
      </div>

      {/* Camera controls */}
      {cameraActive && !capturedImage && (
        <div className="flex items-center justify-center gap-6 mb-6">
          <button onClick={flipCamera} className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors" title="Flip camera">
            <SwitchCamera size={20} />
          </button>
          <button onClick={capture} className="w-16 h-16 bg-blue-green rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-green/90 transition-colors ring-4 ring-blue-green/20" title="Scan card">
            <Zap size={24} />
          </button>
          <div className="w-12 h-12" />
        </div>
      )}

      {/* Scan again & manual search */}
      {capturedImage && !processing && (
        <div className="space-y-3 mb-4">
          <div className="flex justify-center">
            <button onClick={reset} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <RotateCcw size={16} /> Scan Again
            </button>
          </div>

          {/* Editable search — in case OCR got it slightly wrong */}
          {(ocrName || results.length > 0 || exactMatch) && (
            <div className="flex gap-2">
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder="Edit card name and re-search..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-green/40"
              />
              <button onClick={handleManualSearch} className="bg-blue-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-green/90 transition-colors">
                <Search size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>
      )}

      {/* Added flash */}
      {added && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5 mb-4 font-medium flex items-center gap-2">
          <Check size={14} /> {added}
        </div>
      )}

      {/* OCR debug */}
      {ocrName && (
        <p className="text-xs text-gray-400 mb-1">
          Name: "{ocrName}"
          {ocrInfo?.setCode && <span className="ml-2">Set: {ocrInfo.setCode}</span>}
          {ocrInfo?.collectorNumber && <span className="ml-2">#{ocrInfo.collectorNumber}</span>}
        </p>
      )}

      {/* --- EXACT MATCH --- */}
      {exactMatch && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <h2 className="text-sm font-semibold text-green-700 uppercase">Exact Match Found</h2>
          </div>
          <div className="bg-white rounded-2xl border-2 border-green-200 shadow-md p-4 flex gap-4">
            <div className="w-32 flex-shrink-0 cursor-pointer" onClick={() => openCardDetail(exactMatch)}>
              {exactMatch.image ? (
                <img src={exactMatch.image} alt={exactMatch.name} className="w-full rounded-lg shadow" />
              ) : (
                <div className="aspect-[2.5/3.5] bg-gray-100 rounded-lg flex items-center justify-center text-3xl opacity-20">🃏</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-gray-900">{exactMatch.name}</p>
              <p className="text-sm text-gray-500">{exactMatch.set_name} ({exactMatch.set_code})</p>
              <p className="text-sm text-gray-400">#{exactMatch.collector_number} · {exactMatch.rarity}</p>
              {exactMatch.price_usd != null && (
                <p className="text-lg font-bold text-green-600 mt-1">${exactMatch.price_usd.toFixed(2)}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => addCard(exactMatch, 'collection')}
                  className="flex items-center gap-1.5 bg-blue-green text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-green/90 transition-colors"
                >
                  <BookOpen size={12} /> Add to Collection
                </button>
                <button
                  onClick={() => addCard(exactMatch, 'inventory')}
                  className="flex items-center gap-1.5 bg-princeton-orange text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-amber-flame transition-colors"
                >
                  <Package size={12} /> Add to Inventory
                </button>
              </div>
            </div>
          </div>

          {/* Option to see all printings anyway */}
          {results.length === 0 && (
            <button
              onClick={async () => { setProcessing(true); setProcessingStep('Loading all printings...'); await searchAllPrintings(exactMatch.name); setProcessing(false); }}
              className="mt-3 text-xs text-blue-green hover:underline"
            >
              Wrong print? View all printings →
            </button>
          )}
        </div>
      )}

      {/* --- ALL PRINTINGS GRID --- */}
      {results.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-1">
            {exactMatch ? 'All Printings' : `${results.length} Printing${results.length > 1 ? 's' : ''} Found`}
          </h2>
          <p className="text-xs text-gray-400 mb-3">Tap the image to view details, or add directly.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {results.map((card, idx) => renderCardTile(card, idx))}
          </div>
        </div>
      )}

      {/* No results */}
      {!processing && capturedImage && results.length === 0 && !exactMatch && !error && ocrName && (
        <p className="text-center text-gray-500 text-sm">No cards found. Edit the name above and search again.</p>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onAddToCollection={(c) => { addCard(c, 'collection'); setSelectedCard(null); }}
          onAddToInventory={(c) => { addCard(c, 'inventory'); setSelectedCard(null); }}
        />
      )}
    </div>
  );
}
