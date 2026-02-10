
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

const CatalogView: React.FC<CatalogViewProps> = ({ 
  onViewProduct, onAddToCart, onBuyNow, t, products, initialSearch = '', initialCategory = null 
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCat, setSelectedCat] = useState<string | null>(initialCategory);
  const [priceRange, setPriceRange] = useState<number>(50);
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high' | 'rating'>('newest');

  // Sync with props if they change
  useEffect(() => {
    setSearchTerm(initialSearch);
    setSelectedCat(initialCategory);
  }, [initialSearch, initialCategory]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              p.sellerName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCat = !selectedCat || p.category === selectedCat;
        const matchesPrice = p.price <= priceRange;
        return matchesSearch && matchesCat && matchesPrice;
      })
      .sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        if (sortBy === 'rating') return b.rating - a.rating;
        return 0;
      });
  }, [products, searchTerm, selectedCat, priceRange, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <div className="sticky top-24 space-y-8">
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

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Hinnapiir</h3>
              <span className="text-xs font-bold text-emerald-600">{priceRange}€</span>
            </div>
            <input 
              type="range" 
              min="0" max="100" 
              value={priceRange}
              onChange={(e) => setPriceRange(parseInt(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Sorteeri</h3>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full p-4 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="newest">Uusimad</option>
              <option value="price-low">Odavamad</option>
              <option value="price-high">Kallimad</option>
              <option value="rating">Populaarsus</option>
            </select>
          </div>
        </div>
      </aside>

      {/* Product Grid */}
      <main className="flex-grow">
        <div className="mb-8 relative">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"></i>
          <input 
            type="text" 
            placeholder="Otsi tooteid või aednikke..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-stone-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-medium"
          />
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
                  <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-emerald-800">
                    {product.category}
                  </div>
                  <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase shadow-lg">
                      {product.sellerLocation?.split(' ')[0]}
                    </div>
                  </div>
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex justify-between items-start mb-3">
                    <h3 
                      className="font-bold text-stone-900 text-lg hover:text-emerald-700 cursor-pointer transition-colors leading-tight"
                      onClick={() => onViewProduct(product.id)}
                    >
                      {product.title}
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-4 bg-stone-50/50 p-2 rounded-xl">
                    <img src={`https://i.pravatar.cc/150?u=${product.sellerId}`} className="w-6 h-6 rounded-full border border-white shadow-sm" />
                    <span className="text-[11px] text-stone-600 font-bold uppercase tracking-wider">{product.sellerName}</span>
                  </div>

                  <div className="mt-auto pt-6 border-t border-stone-50 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-2xl font-black text-stone-900">{product.price.toFixed(2)}€</span>
                        <span className="text-stone-400 text-xs font-bold ml-1 uppercase">/ {product.unit}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onAddToCart(product.id); }}
                        className="w-10 h-10 bg-stone-100 hover:bg-emerald-100 text-stone-500 hover:text-emerald-600 rounded-xl transition-all active:scale-90"
                        title="Lisa ostukorvi"
                      >
                        <i className="fa-solid fa-cart-plus"></i>
                      </button>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onBuyNow(product.id); }}
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
