
import React, { useState } from 'react';
import { Product } from '../types';

interface HomeViewProps {
  onSearch: (query: string) => void;
  onSelectCategory: (cat: string) => void;
  onViewProduct: (id: string) => void;
  t: any;
  products: Product[];
}

const HomeView: React.FC<HomeViewProps> = ({ onSearch, onSelectCategory, onViewProduct, t, products }) => {
  const [query, setQuery] = useState('');

  const categories = [
    { name: 'Köögiviljad', icon: 'fa-carrot', color: 'bg-orange-100 text-orange-600' },
    { name: 'Marjad', icon: 'fa-bowl-food', color: 'bg-red-100 text-red-600' },
    { name: 'Puuviljad', icon: 'fa-apple-whole', color: 'bg-emerald-100 text-emerald-600' },
    { name: 'Mesi & hoidised', icon: 'fa-jar', color: 'bg-yellow-100 text-yellow-600' },
    { name: 'Seemned', icon: 'fa-seedling', color: 'bg-green-100 text-green-600' },
    { name: 'Muu', icon: 'fa-ellipsis', color: 'bg-stone-100 text-stone-600' },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <div className="flex flex-col">
      <section className="relative h-[500px] flex items-center justify-center px-4 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=2000" 
            className="w-full h-full object-cover brightness-[0.4]"
          />
        </div>
        
        <div className="relative z-10 max-w-4xl text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 drop-shadow-md">
            {t.hero.title}
          </h1>
          <p className="text-xl text-stone-100 mb-10 drop-shadow">
            {t.hero.subtitle}
          </p>
          
          <form 
            onSubmit={handleSearchSubmit}
            className="bg-white/10 backdrop-blur-lg border border-white/20 p-2 rounded-2xl shadow-2xl flex flex-col md:flex-row gap-2 max-w-2xl mx-auto transition-all focus-within:bg-white/20"
          >
            <div className="flex-grow relative">
              <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-stone-200"></i>
              <input 
                type="text" 
                placeholder={t.hero.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-xl border-none bg-transparent focus:ring-0 text-white placeholder:text-stone-300 font-medium outline-none"
              />
            </div>
            <button 
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg active:scale-95"
            >
              Otsi turgu
            </button>
          </form>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-stone-900 mb-8 text-center uppercase tracking-widest text-xs">Sirvi kategooriaid</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((cat) => (
              <div 
                key={cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className="flex flex-col items-center p-6 rounded-2xl border border-stone-100 hover:border-emerald-300 hover:shadow-lg transition-all cursor-pointer group bg-stone-50/30"
              >
                <div className={`w-14 h-14 ${cat.color} rounded-full flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform`}>
                  <i className={`fa-solid ${cat.icon}`}></i>
                </div>
                <span className="font-bold text-stone-800 text-xs uppercase tracking-wider">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Products */}
      <section className="py-16 px-4 bg-stone-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-3xl font-bold text-stone-900">Värskelt lisatud</h2>
              <p className="text-stone-500 mt-2">Parimad pakkumised sinu piirkonnas</p>
            </div>
            <button 
              onClick={() => onSearch('')}
              className="text-emerald-600 font-bold hover:underline flex items-center gap-2 text-sm"
            >
              Vaata kõiki <i className="fa-solid fa-arrow-right text-xs"></i>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.slice(0, 4).map(product => (
              <div 
                key={product.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 hover:shadow-xl transition-all cursor-pointer flex flex-col h-full group"
                onClick={() => onViewProduct(product.id)}
              >
                <div className="relative h-48 overflow-hidden">
                  <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm">
                    {product.category}
                  </div>
                </div>
                <div className="p-5 flex-grow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-stone-900 text-lg leading-snug">{product.title}</h3>
                    <div className="flex items-center text-yellow-500 text-xs font-bold">
                      <i className="fa-solid fa-star mr-1"></i> {product.rating}
                    </div>
                  </div>
                  <p className="text-stone-500 text-xs mb-4 line-clamp-2">{product.description}</p>
                  
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-stone-200 overflow-hidden">
                      <img src={`https://i.pravatar.cc/150?u=${product.sellerId}`} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xs text-stone-600 font-medium">{product.sellerName}</span>
                  </div>

                  <div className="flex justify-between items-center mt-auto">
                    <div>
                      <span className="text-xl font-bold text-emerald-800">{product.price.toFixed(2)}€</span>
                      <span className="text-stone-400 text-xs ml-1">/{product.unit}</span>
                    </div>
                    <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <i className="fa-solid fa-cart-plus"></i>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomeView;
