import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { MarketplaceLocationFilter, Product, ResolvedLocation, User } from '../types';
import { CATEGORIES } from '../constants';
import LocationPickerModal, { LocationMapMarker } from '../components/LocationPickerModal';
import { calculateDistanceKm, formatDistanceKm, geocodeLocation } from '../utils/location';

interface CatalogViewProps {
  onViewProduct: (id: string) => void;
  onAddToCart: (id: string) => void;
  onBuyNow: (id: string) => void;
  t: any;
  user: User | null;
  products: Product[];
  initialSearch?: string;
  initialCategory?: string | null;
  locationFilter: MarketplaceLocationFilter;
  setLocationFilter: React.Dispatch<React.SetStateAction<MarketplaceLocationFilter>>;
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

type SortOption = 'newest' | 'price-low' | 'price-high' | 'rating' | 'distance';

const CatalogView: React.FC<CatalogViewProps> = ({
  onViewProduct,
  onAddToCart,
  onBuyNow,
  t,
  user,
  products,
  initialSearch = '',
  initialCategory = null,
  locationFilter,
  setLocationFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCat, setSelectedCat] = useState<string | null>(initialCategory);
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [mobilePanelView, setMobilePanelView] = useState<'categories' | 'filters'>('categories');
  const [sellerLocationsById, setSellerLocationsById] = useState<Record<string, ResolvedLocation | null>>({});
  const [isResolvingLocations, setIsResolvingLocations] = useState(false);
  const [locationError, setLocationError] = useState('');

  const deferredSearchTerm = useDeferredValue(searchTerm);

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

  const sellerSummaries = useMemo(() => {
    const sellers = new Map<string, { sellerId: string; sellerName: string; sellerLocation: string }>();

    for (const product of products) {
      const sellerLocation = product.sellerLocation?.trim();

      if (!sellerLocation || sellers.has(product.sellerId)) {
        continue;
      }

      sellers.set(product.sellerId, {
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        sellerLocation,
      });
    }

    return Array.from(sellers.values());
  }, [products]);

  useEffect(() => {
    let isCancelled = false;

    const unresolvedSellers = sellerSummaries.filter(seller => {
      const cachedLocation = sellerLocationsById[seller.sellerId];
      return cachedLocation === undefined;
    });

    if (unresolvedSellers.length === 0) {
      return () => {
        isCancelled = true;
      };
    }

    const resolveSellerLocations = async () => {
      setIsResolvingLocations(true);
      setLocationError('');

      try {
        const resolvedEntries = await Promise.all(
          unresolvedSellers.map(async seller => {
            const resolved = await geocodeLocation(seller.sellerLocation);

            return [seller.sellerId, resolved] as const;
          })
        );

        if (isCancelled) {
          return;
        }

        setSellerLocationsById(prev => {
          const next = { ...prev };

          for (const [sellerId, resolved] of resolvedEntries) {
            next[sellerId] = resolved;
          }

          return next;
        });
      } catch (error: any) {
        if (!isCancelled) {
          setLocationError(error?.message || 'Müüjate asukohti ei saanud laadida.');
        }
      } finally {
        if (!isCancelled) {
          setIsResolvingLocations(false);
        }
      }
    };

    resolveSellerLocations();

    return () => {
      isCancelled = true;
    };
  }, [sellerLocationsById, sellerSummaries]);

  const sellerDistanceById = useMemo(() => {
    if (!locationFilter.location) {
      return {} as Record<string, number>;
    }

    const distances: Record<string, number> = {};

    for (const seller of sellerSummaries) {
      const sellerLocation = sellerLocationsById[seller.sellerId];

      if (!sellerLocation) {
        continue;
      }

      distances[seller.sellerId] = calculateDistanceKm(locationFilter.location, sellerLocation);
    }

    return distances;
  }, [locationFilter.location, sellerLocationsById, sellerSummaries]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeValue(deferredSearchTerm ?? '');
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
        const distance = sellerDistanceById[product.sellerId];
        const matchesRadius =
          !locationFilter.location ||
          (typeof distance === 'number' && distance <= locationFilter.radiusKm);

        return matchesSearch && matchesCat && matchesMinPrice && matchesMaxPrice && matchesRadius;
      })
      .sort((a, b) => {
        const aPrice = Number(a.price ?? 0);
        const bPrice = Number(b.price ?? 0);
        const aRating = Number(a.rating ?? 0);
        const bRating = Number(b.rating ?? 0);
        const aCreatedAt = new Date(a.createdAt ?? 0).getTime();
        const bCreatedAt = new Date(b.createdAt ?? 0).getTime();
        const aDistance = sellerDistanceById[a.sellerId] ?? Number.MAX_SAFE_INTEGER;
        const bDistance = sellerDistanceById[b.sellerId] ?? Number.MAX_SAFE_INTEGER;

        if (sortBy === 'price-low') return aPrice - bPrice;
        if (sortBy === 'price-high') return bPrice - aPrice;
        if (sortBy === 'rating') return bRating - aRating;
        if (sortBy === 'distance') return aDistance - bDistance;
        return bCreatedAt - aCreatedAt;
      });
  }, [
    deferredSearchTerm,
    locationFilter.location,
    locationFilter.radiusKm,
    maxPriceInput,
    minPriceInput,
    products,
    selectedCat,
    sellerDistanceById,
    sortBy,
  ]);

  const sellerMarkers = useMemo<LocationMapMarker[]>(() => {
    return sellerSummaries.flatMap(seller => {
      const resolved = sellerLocationsById[seller.sellerId];

      if (!resolved) {
        return [];
      }

      const distance = sellerDistanceById[seller.sellerId];
      const subtitleParts = [seller.sellerLocation];

      if (typeof distance === 'number') {
        subtitleParts.push(`${formatDistanceKm(distance)} kaugusel`);
      }

      return [{
        id: seller.sellerId,
        lat: resolved.lat,
        lng: resolved.lng,
        label: seller.sellerName,
        subtitle: subtitleParts.join(' • '),
      }];
    });
  }, [sellerDistanceById, sellerLocationsById, sellerSummaries]);

  const visibleSellerCount = useMemo(() => {
    return new Set(filteredProducts.map(product => product.sellerId)).size;
  }, [filteredProducts]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCat(null);
    setMinPriceInput('');
    setMaxPriceInput('');
    setSortBy('newest');
    setLocationFilter({
      location: null,
      radiusKm: locationFilter.radiusKm,
    });
  };

  const activeFilterCount = [
    Boolean(selectedCat),
    Boolean(minPriceInput.trim() || maxPriceInput.trim()),
    sortBy !== 'newest',
  ].filter(Boolean).length;

  const locationButtonLabel = locationFilter.location?.label || 'Asukohapõhine otsing';
  const locationButtonHelper = locationFilter.location
    ? `${locationFilter.radiusKm} km raadius`
    : 'Vali piirkond kaardilt';

  const renderCategorySection = () => (
    <div>
      <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Kategooriad</h3>
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
  );

  const renderFilterControls = () => (
    <>
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
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="w-full p-4 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="newest">Uusimad</option>
          <option value="price-low">Odavamad</option>
          <option value="price-high">Kallimad</option>
          <option value="rating">Parim hinnang</option>
          <option value="distance" disabled={!locationFilter.location}>Kõige lähemad</option>
        </select>
      </div>
    </>
  );

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        <aside className="hidden md:block w-full md:w-80 flex-shrink-0">
          <div className="sticky top-24 space-y-6">
            <button
              type="button"
              onClick={() => setIsLocationModalOpen(true)}
              className="w-full rounded-[28px] bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 text-left text-stone-900 p-5 border border-stone-200 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 mb-2">Asukohapõhine otsing</p>
                  <h3 className="text-[24px] leading-[1.05] font-black text-stone-900">
                    {locationFilter.location ? locationFilter.location.label : 'Vali asukoht, et otsida lähedalt'}
                  </h3>
                  <p className="text-sm text-stone-500 mt-4 max-w-[24ch]">
                    {locationFilter.location
                      ? `${locationFilter.radiusKm} km raadius. Vajuta, et muuta asukohta või otsinguala.`
                      : 'Ava kaart ja määra piirkond, kus soovid kohalikke müüjaid näha.'}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-stone-900 flex items-center justify-center text-lg text-emerald-300 shrink-0 shadow-sm">
                  <i className="fa-solid fa-map-location-dot"></i>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/90 border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700">
                  <i className="fa-solid fa-location-crosshairs text-emerald-600"></i>
                  Ava asukohafilter
                </span>
                {locationFilter.location && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">
                    <i className="fa-solid fa-location-dot text-emerald-600"></i>
                    {locationFilter.radiusKm} km
                  </span>
                )}
                {isResolvingLocations && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700">
                    <i className="fa-solid fa-spinner fa-spin text-emerald-600"></i>
                    Laadin müüjate kohti
                  </span>
                )}
              </div>
            </button>

            <div className="rounded-[28px] bg-white border border-stone-200 shadow-sm p-5 space-y-6">
              {renderCategorySection()}
              {renderFilterControls()}

              <button
                type="button"
                onClick={resetFilters}
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-stone-200 bg-stone-50 px-4 py-4 text-sm font-black text-stone-800 transition-all hover:border-emerald-300 hover:bg-emerald-50"
              >
                <i className="fa-solid fa-rotate-left text-emerald-600"></i>
                Lähtesta filtrid
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-grow min-w-0">
          <div className="md:hidden mb-4 space-y-3">
            <button
              type="button"
              onClick={() => setIsLocationModalOpen(true)}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <i className="fa-solid fa-map-location-dot"></i>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.22em] mb-1">Asukoht</span>
                  <span className="block font-bold text-stone-900 truncate">{locationButtonLabel}</span>
                  <span className="block text-xs text-stone-500 mt-1 truncate">{locationButtonHelper}</span>
                </div>
              </div>
            </button>

            <div className="grid grid-cols-[minmax(0,1fr)_56px_auto] gap-2 items-stretch">
              <button
                type="button"
                onClick={() => {
                  setMobilePanelView('categories');
                  setIsMobileFiltersOpen(true);
                }}
                className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/60 transition-all text-left"
              >
                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.22em] mb-1">Kategooria</span>
                <span className="block font-bold text-stone-900 truncate">{selectedCat || 'Kõik tooted'}</span>
              </button>

              <button
                type="button"
                aria-label="Ava filtrid"
                onClick={() => {
                  setMobilePanelView('filters');
                  setIsMobileFiltersOpen(true);
                }}
                className="h-14 w-14 rounded-2xl border border-stone-200 bg-white shadow-sm text-stone-700 hover:border-emerald-300 hover:bg-emerald-50/60 transition-all flex items-center justify-center relative"
              >
                <i className="fa-solid fa-sliders"></i>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={resetFilters}
                className="h-14 rounded-2xl border border-stone-200 bg-stone-50 px-3 text-xs font-black text-stone-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 transition-all whitespace-nowrap"
              >
                Lähtesta
              </button>
            </div>
          </div>

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
              {locationFilter.location && (
                <span className="text-stone-400"> • {visibleSellerCount} müüjalt sinu raadiuses</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCat && (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                  <i className="fa-solid fa-filter"></i>
                  {selectedCat}
                </div>
              )}
              {activeFilterCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-stone-100 text-stone-700 text-xs font-bold uppercase tracking-wider md:hidden">
                  <i className="fa-solid fa-sliders"></i>
                  {activeFilterCount} filtrit
                </div>
              )}
              {locationFilter.location && (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-stone-900 text-white text-xs font-bold">
                  <i className="fa-solid fa-location-crosshairs text-emerald-300"></i>
                  {locationFilter.radiusKm} km
                </div>
              )}
            </div>
          </div>

          {locationError && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {locationError}
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="text-center py-24 bg-stone-50 rounded-[40px] border-2 border-dashed border-stone-200">
              <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-300 text-3xl">
                <i className="fa-solid fa-seedling"></i>
              </div>
              <h3 className="text-xl font-bold text-stone-900">Midagi ei leitud</h3>
              <p className="text-stone-500 mt-2">
                {locationFilter.location
                  ? 'Proovi suurendada km raadiust või muuta kaardilt asukohta.'
                  : 'Proovi muuta filtreid või otsingusõna.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map(product => {
                const distance = sellerDistanceById[product.sellerId];

                return (
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
                      <div className="absolute top-4 right-4 flex flex-col gap-2">
                        <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase shadow-lg">
                          {(product.sellerLocation || '—').split(' ')[0]}
                        </div>
                        {typeof distance === 'number' && (
                          <div className="bg-stone-950/90 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase shadow-lg">
                            {formatDistanceKm(distance)}
                          </div>
                        )}
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
                          <div className="min-w-0">
                            <span className="block text-[11px] text-stone-600 font-bold uppercase tracking-wider truncate">{product.sellerName}</span>
                            <span className="block text-[11px] text-stone-400 truncate">{product.sellerLocation || 'Asukoht puudub'}</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-stone-400 font-medium whitespace-nowrap">
                          {product.reviewsCount > 0 ? `${product.reviewsCount} arvustust` : 'Uus toode'}
                        </span>
                      </div>

                      {typeof distance === 'number' && (
                        <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900">
                          <span className="font-bold">Umbes {formatDistanceKm(distance)} sinust.</span>
                          <span className="text-emerald-700"> Vahemaad arvutatakse valitud punktist.</span>
                        </div>
                      )}

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
                );
              })}
            </div>
          )}
        </main>
      </div>

      {isMobileFiltersOpen && (
        <div className="fixed inset-0 z-[130] md:hidden">
          <button
            type="button"
            aria-label="Sulge filtrid"
            onClick={() => setIsMobileFiltersOpen(false)}
            className="absolute inset-0 bg-stone-900/35 backdrop-blur-sm"
          ></button>

          <div className="absolute inset-x-0 bottom-0 z-10 max-h-[85vh] overflow-hidden rounded-t-[32px] border-t border-stone-200 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 mb-1">Filtrid</p>
                <h3 className="text-lg font-black text-stone-900">
                  {mobilePanelView === 'categories' ? 'Kategooriad' : 'Filtrid'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="w-11 h-11 rounded-full bg-stone-100 text-stone-500"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-stone-100 bg-stone-50/70 p-4">
              <button
                type="button"
                onClick={() => setMobilePanelView('categories')}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition-all ${
                  mobilePanelView === 'categories'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-stone-600 border border-stone-200'
                }`}
              >
                Kategooriad
              </button>
              <button
                type="button"
                onClick={() => setMobilePanelView('filters')}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition-all ${
                  mobilePanelView === 'filters'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-stone-600 border border-stone-200'
                }`}
              >
                Filtrid
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-6">
              {mobilePanelView === 'categories' ? renderCategorySection() : renderFilterControls()}
            </div>

            <div className="border-t border-stone-100 bg-white p-4">
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm font-bold text-stone-700"
              >
                <i className="fa-solid fa-check"></i>
                Peida filtrid
              </button>
            </div>
          </div>
        </div>
      )}

      <LocationPickerModal
        isOpen={isLocationModalOpen}
        value={locationFilter}
        defaultQuery={user?.location || 'Tallinn, Estonia'}
        markers={sellerMarkers}
        onClose={() => setIsLocationModalOpen(false)}
        onApply={setLocationFilter}
      />
    </>
  );
};

export default CatalogView;
