import React, { useState, useMemo, useEffect } from 'react';
import { Product } from '../types';
import { CATEGORIES } from '../constants';

interface CatalogViewProps {
  onViewProduct: (id: string) => void;
  onAddToCart: (id: string) => void;
  onBuyNow: (id: string) => void;
  t: any;
  products: Product[];
  initialSearch?: string;
  initialCategory?: string | null;
}

const normalizeValue = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parsePrice = (value: string) => {
  const normalized = value.replace(',', '.').trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const CatalogView: React.FC<CatalogViewProps> = ({
  onViewProduct, onAddToCart, onBuyNow, t, products, initialSearch = '', initialCategory = null
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCat, setSelectedCat] = useState<string | null>(initialCategory);
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high' | 'rating'>('newest');

  useEffect(() => {
    setSearchTerm(initialSearch);
    setSelectedCat(initialCategory);
  }, [initialSearch, initialCategory]);

  const priceBounds = useMemo(() => {
    if (products.length === 0) {
      return { min: 0, max: 0 };
    }

    const prices = products.map(product => Number(product.price ?? 0));
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeValue(searchTerm ?? '');
    const parsedMin = parsePrice(minPriceInput);
    const parsedMax = parsePrice(maxPriceInput);
    const minPrice = parsedMin !== null && parsedMax !== null ? Math.min(parsedMin, parsedMax) : parsedMin;
    const maxPrice = parsedMin !== null && parsedMax !== null ? Math.max(parsedMin, parsedMax) : parsedMax;

    return products
      .filter(product => {
        const searchFields = [
          product.title,
          product.description,
          product.sellerName,
          product.sellerLocation,
          product.category,
        ]
          .filter(Boolean)
          .map(value => normalizeValue(String(value)));

        const matchesSearch = normalizedQuery.length === 0 || searchFields.some(value => value.includes(normalizedQuery));
        const matchesCat = !selectedCat || product.category === selectedCat;
        const price = Number(product.price ?? 0);
        const matchesMinPrice = minPrice === null || price >= minPrice;
        const matchesMaxPrice = maxPrice === null || price <= maxPrice;

        return matchesSearch && matchesCat && matchesMinPrice && matchesMaxPrice;
      })
      .sort((a, b) => {
        const aPrice = Number(a.price ?? 0);
        const bPrice = Number(b.price ?? 0);
        const aRating = Number(a.rating ?? 0);
        const bRating = Number(b.rating ?? 0);
        const aCreatedAt = new Date(a.createdAt ?? 0).getTime();
        const bCreatedAt = new Date(b.createdAt ?? 0).getTime();

        if (sortBy === 'price-low') return aPrice - bPrice;
        if (sortBy === 'price-high') return bPrice - aPrice;
        if (sortBy === 'rating') return bRating - aRating;
        return bCreatedAt - aCreatedAt;
      });
  }, [products, searchTerm, selectedCat, minPriceInput, maxPriceInput, sortBy]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCat(null);
    setMinPriceInput('');
    setMaxPriceInput('');
    setSortBy('newest');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-72 flex-shrink-0">
        <div className="sticky top-24 space-y-8">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kategooriad</h3>
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-bold text-emerald-600 hover:underline"
              >
                Lähtesta
              </button>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCat(null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all ${!selectedCat ? 'bg-emerald-600 text-white shadow-md' : 'text-stone-600 hover:bg-stone-100'}`}
              >
                Kõik tooted
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all ${selectedCat === cat ? 'bg-emerald-600 text-white shadow-md' : 'text-stone-600 hover:bg-stone-100'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Hinnavahemik</h3>
              <span className="text-[11px] text-stone-400 font-bold">
                {priceBounds.max > 0 ? `${priceBounds.min.toFixed(2)}€ - ${priceBounds.max.toFixed(2)}€` : 'Puudub'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest">Alates</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={minPriceInput}
                  onChange={(e) => setMinPriceInput(e.target.value)}
                  placeholder={priceBounds.min > 0 ? priceBounds.min.toFixed(2) : '0.00'}
                  className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="space-y-2">
                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest">Kuni</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={maxPriceInput}
                  onChange={(e) => setMaxPriceInput(e.target.value)}
                  placeholder={priceBounds.max > 0 ? priceBounds.max.toFixed(2) : '0.00'}
                  className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Sorteeri</h3>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'price-low' | 'price-high' | 'rating')}
              className="w-full p-4 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="newest">Uusimad</option>
              <option value="price-low">Odavamad</option>
              <option value="price-high">Kallimad</option>
              <option value="rating">Parim hinnang</option>
            </select>
          </div>
        </div>
      </aside>

      <main className="flex-grow">
        <div className="mb-6 relative">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"></i>
          <input
            type="text"
            placeholder="Otsi tooteid, kirjeldusi, müüjaid või asukohti..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-stone-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="text-sm text-stone-500">
            Leitud <span className="font-bold text-stone-900">{filteredProducts.length}</span> toodet
          </div>
          {selectedCat && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <i className="fa-solid fa-filter"></i>
              {selectedCat}
            </div>
          )}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-24 bg-stone-50 rounded-[40px] border-2 border-dashed border-stone-200">
            <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-300 text-3xl">
              <i className="fa-solid fa-seedling"></i>
            </div>
            <h3 className="text-xl font-bold text-stone-900">Midagi ei leitud</h3>
            <p className="text-stone-500 mt-2">Proovi muuta filtreid või otsingusõna.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(product => (
              <div
                key={product.id}
                className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-stone-100 hover:shadow-xl transition-all flex flex-col group"
              >
                <div
                  className="relative h-56 overflow-hidden cursor-pointer"
                  onClick={() => onViewProduct(product.id)}
                >
                  <img
                    src={product.image || '/placeholder.png'}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                    }}
                  />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-emerald-800">
                    {product.category}
                  </div>
                  <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase shadow-lg">
                      {(product.sellerLocation || '—').split(' ')[0]}
                    </div>
                  </div>
                </div>

                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <h3
                      className="font-bold text-stone-900 text-lg hover:text-emerald-700 cursor-pointer transition-colors leading-tight"
                      onClick={() => onViewProduct(product.id)}
                    >
                      {product.title}
                    </h3>
                    <div className={`flex items-center gap-1 text-xs font-bold ${product.reviewsCount > 0 ? 'text-yellow-500' : 'text-stone-300'}`}>
                      <i className="fa-solid fa-star"></i>
                      <span>{product.reviewsCount > 0 ? product.rating.toFixed(1) : '—'}</span>
                    </div>
                  </div>

                  <p className="text-stone-500 text-sm mb-4 line-clamp-2">{product.description}</p>

                  <div className="flex items-center justify-between gap-3 mb-4 bg-stone-50/50 p-3 rounded-xl">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={`https://i.pravatar.cc/150?u=${product.sellerId}`} className="w-6 h-6 rounded-full border border-white shadow-sm" />
                      <span className="text-[11px] text-stone-600 font-bold uppercase tracking-wider truncate">{product.sellerName}</span>
                    </div>
                    <span className="text-[11px] text-stone-400 font-medium whitespace-nowrap">
                      {product.reviewsCount > 0 ? `${product.reviewsCount} arvustust` : 'Uus toode'}
                    </span>
                  </div>

                  <div className="mt-auto pt-6 border-t border-stone-50 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-2xl font-black text-stone-900">{Number(product.price ?? 0).toFixed(2)}€</span>
                        <span className="text-stone-400 text-xs font-bold ml-1 uppercase">/ {product.unit}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCart(product.id);
                        }}
                        className="w-10 h-10 bg-stone-100 hover:bg-emerald-100 text-stone-500 hover:text-emerald-600 rounded-xl transition-all active:scale-90"
                        title="Lisa ostukorvi"
                      >
                        <i className="fa-solid fa-cart-plus"></i>
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onBuyNow(product.id);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold shadow-md shadow-emerald-600/10 transition-all active:scale-95"
                    >
                      Osta kohe
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default CatalogView;
