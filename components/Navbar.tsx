
import React, { Suspense, lazy, useState } from 'react';
import { User, UserRole, Language, CartItem, Product } from '../types';

const AuthModal = lazy(() => import('./AuthModal'));

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: any) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  cart: CartItem[];
  onIncreaseQty: (id: string) => void;
  onDecreaseQty: (id: string) => void;
  onRemoveFromCart: (id: string) => void;
  onCheckout: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: any;
  products: Product[];
  authModal: 'none' | 'login' | 'register';
  setAuthModal: (val: 'none' | 'login' | 'register') => void;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

const Navbar: React.FC<NavbarProps> = ({ 
  currentView, setCurrentView, user, setUser, cart, onIncreaseQty, onDecreaseQty, onRemoveFromCart, onCheckout, language, setLanguage, t, products, authModal, setAuthModal, onNotify 
}) => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const cartTotal = cart.reduce((acc, item) => {
    const product = products.find(p => p.id === item.productId);
    return acc + (product?.price || 0) * item.quantity;
  }, 0);
  const cartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const handleLogout = async (e?: React.MouseEvent) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const { supabase } = await import('../supabaseClient');
  await supabase.auth.signOut();
  localStorage.removeItem('user');
  setUser(null);
  setCurrentView('home');
  setIsMenuOpen(false);
  onNotify?.('Oled välja logitud.', 'success');
};

  const navigateTo = (view: any) => {
    setCurrentView(view);
    setIsMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigateTo('home')}>
              <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white">
                <i className="fa-solid fa-leaf"></i>
              </div>
              <span className="text-xl font-bold text-emerald-900 tracking-tight hidden sm:block">Aiast Koju</span>
            </div>

            <div className="hidden sm:flex gap-1 bg-stone-100 p-1 rounded-lg">
              {(['ET', 'EN', 'RU'] as Language[]).map(lang => (
                <button 
                  key={lang} 
                  onClick={() => setLanguage(lang)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${language === lang ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
          
          <div className="hidden md:flex flex-grow justify-center space-x-8">
            <button onClick={() => setCurrentView('home')} className={`${currentView === 'home' ? 'text-emerald-700 font-bold' : 'text-stone-500'} text-sm font-medium transition-colors`}>{t.nav.home}</button>
            <button onClick={() => setCurrentView('catalog')} className={`${currentView === 'catalog' ? 'text-emerald-700 font-bold' : 'text-stone-500'} text-sm font-medium transition-colors`}>{t.nav.catalog}</button>
            {user && <button onClick={() => setCurrentView('orders')} className={`${currentView === 'orders' ? 'text-emerald-700 font-bold' : 'text-stone-500'} text-sm font-medium transition-colors`}>{t.nav.orders}</button>}
            {user?.role === UserRole.GARDENER && <button onClick={() => setCurrentView('dashboard')} className={`${currentView === 'dashboard' ? 'text-emerald-700 font-bold' : 'text-stone-500'} text-sm font-medium transition-colors`}>{t.nav.dashboard}</button>}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative">
              <button
                onClick={() => setIsCartOpen(!isCartOpen)}
                className={`relative rounded-xl p-2 transition-colors ${isCartOpen ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500 hover:bg-stone-50'}`}
                aria-label="Ava ostukorv"
              >
                <i className="fa-solid fa-cart-shopping text-lg"></i>
                {cartItemsCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">{cartItemsCount}</span>}
              </button>

              {isCartOpen && (
                <>
                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsCartOpen(false)}></div>
                  <div className="fixed left-3 right-3 top-24 z-50 max-h-[calc(100svh-7rem)] bg-white shadow-2xl rounded-3xl border border-stone-100 overflow-hidden animate-fade-in flex flex-col md:absolute md:left-auto md:right-0 md:top-full md:mt-3 md:w-80 md:max-h-none md:rounded-2xl">
                    <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                      <h3 className="font-bold text-stone-900 text-xs uppercase tracking-widest">Ostukorv</h3>
                      <button aria-label="Sulge ostukorv" onClick={() => setIsCartOpen(false)} className="text-stone-400 hover:text-stone-600"><i className="fa-solid fa-xmark"></i></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4 md:max-h-80 md:flex-none">
                      {cart.length === 0 ? <p className="text-center text-stone-500 py-8 italic text-sm">Ostukorv on tühi</p> : cart.map(item => {
                        const product = products.find(p => p.id === item.productId);
                        const minQty = Math.max(1, Number(product?.minOrderQty ?? 1));
                        const maxQty = Number(product?.stockQty ?? 0) > 0 ? Number(product?.stockQty ?? 0) : Number.MAX_SAFE_INTEGER;
                        const canDecrease = item.quantity > minQty;
                        const canIncrease = item.quantity < maxQty;

                        return (
                          <div key={item.productId} className="flex gap-3 rounded-2xl border border-stone-100 p-3">
                            <img src={product?.image} alt="" loading="lazy" decoding="async" className="w-14 h-14 rounded-xl object-cover bg-stone-100" />
                            <div className="flex-grow min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate">{product?.title}</p>
                                  <p className="text-[10px] text-stone-500 mt-1">{Number(product?.price ?? 0).toFixed(2)}€ / {product?.unit}</p>
                                </div>
                                <button aria-label={`Eemalda ${product?.title || 'toode'} ostukorvist`} onClick={() => onRemoveFromCart(item.productId)} className="text-xs text-red-500 font-bold whitespace-nowrap">Eemalda</button>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div className="inline-flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
                                  <button aria-label={`Vähenda toote ${product?.title || ''} kogust`} onClick={() => onDecreaseQty(item.productId)} disabled={!canDecrease} className="w-6 h-6 rounded-lg bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"><i className="fa-solid fa-minus text-[10px]"></i></button>
                                  <span className="min-w-[20px] text-center text-sm font-black text-stone-900">{item.quantity}</span>
                                  <button aria-label={`Suurenda toote ${product?.title || ''} kogust`} onClick={() => onIncreaseQty(item.productId)} disabled={!canIncrease} className="w-6 h-6 rounded-lg bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"><i className="fa-solid fa-plus text-[10px]"></i></button>
                                </div>
                                <span className="text-sm font-black text-stone-900">{(Number(product?.price ?? 0) * item.quantity).toFixed(2)}€</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {cart.length > 0 && (
                      <div className="p-4 bg-stone-50 border-t border-stone-100">
                        <button onClick={() => { onCheckout(); setIsCartOpen(false); }} className="w-full bg-emerald-600 text-white px-4 py-3 rounded-xl text-sm sm:text-base font-bold leading-tight">Vormista tellimus ({cartTotal.toFixed(2)}€)</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <button aria-label="Ava profiil" onClick={() => setCurrentView('profile')} className="w-9 h-9 rounded-full border border-stone-200 overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all">
                  <img src={user.avatar || '/seeding.png'} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
                <button onClick={(e) => handleLogout(e)} className="hidden sm:block text-stone-400 hover:text-red-500 transition-colors" title="Logi välja">
                  <i className="fa-solid fa-right-from-bracket"></i>
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex gap-2">
                <button onClick={() => setAuthModal('login')} className="text-stone-700 border border-stone-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-stone-50 transition-all">{t.nav.login}</button>
                <button onClick={() => setAuthModal('register')} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all">{t.nav.register}</button>
              </div>
            )}

            <button aria-label="Ava menüü" onClick={() => setIsMenuOpen(true)} className="md:hidden p-2 text-stone-500 hover:text-emerald-600 transition-colors">
              <i className="fa-solid fa-bars text-xl"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Side Menu Drawer for Mobile */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
        <div className={`absolute top-0 right-0 h-full w-72 bg-white shadow-2xl transition-transform duration-300 ease-in-out transform ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 flex justify-between items-center border-b border-stone-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs">
                <i className="fa-solid fa-leaf"></i>
              </div>
              <span className="font-bold text-emerald-900">Menüü</span>
            </div>
            <button aria-label="Sulge menüü" onClick={() => setIsMenuOpen(false)} className="text-stone-400 text-xl"><i className="fa-solid fa-xmark"></i></button>
          </div>
          <div className="p-6 space-y-2">
            <button onClick={() => navigateTo('home')} className={`block w-full text-left px-4 py-3 rounded-xl font-bold ${currentView === 'home' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600'}`}>{t.nav.home}</button>
            <button onClick={() => navigateTo('catalog')} className={`block w-full text-left px-4 py-3 rounded-xl font-bold ${currentView === 'catalog' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600'}`}>{t.nav.catalog}</button>
            {user && <button onClick={() => navigateTo('orders')} className={`block w-full text-left px-4 py-3 rounded-xl font-bold ${currentView === 'orders' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600'}`}>{t.nav.orders}</button>}
            {user?.role === UserRole.GARDENER && <button onClick={() => navigateTo('dashboard')} className={`block w-full text-left px-4 py-3 rounded-xl font-bold ${currentView === 'dashboard' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600'}`}>{t.nav.dashboard}</button>}
            
            <div className="pt-6 border-t border-stone-100 mt-6 space-y-6">
              <div className="space-y-3 px-2">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Keel</p>
                <div className="flex gap-2">
                  {(['ET', 'EN', 'RU'] as Language[]).map(lang => (
                    <button key={lang} onClick={() => setLanguage(lang)} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${language === lang ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-stone-500 border-stone-200'}`}>{lang}</button>
                  ))}
                </div>
              </div>
              
              {!user ? (
                <div className="space-y-2 px-2">
                  <button onClick={() => { setAuthModal('login'); setIsMenuOpen(false); }} className="w-full py-4 border border-stone-200 rounded-2xl font-bold text-sm text-stone-700 hover:bg-stone-50">{t.nav.login}</button>
                  <button onClick={() => { setAuthModal('register'); setIsMenuOpen(false); }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/10">{t.nav.register}</button>
                </div>
              ) : (
                <div className="px-2">
                  <button onClick={(e) => handleLogout(e)} className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
                    <i className="fa-solid fa-right-from-bracket"></i> {t.nav.logout}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal - Login & Register */}
      {authModal !== 'none' && (
        <Suspense fallback={null}>
          <AuthModal
            mode={authModal}
            setMode={setAuthModal}
            setUser={setUser}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {false && isCartOpen && (
        <>
          <div className="fixed inset-0 z-[45] bg-transparent" onClick={() => setIsCartOpen(false)}></div>
          <div className="absolute right-4 top-20 w-80 bg-white shadow-2xl rounded-2xl border border-stone-100 z-50 overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <h3 className="font-bold text-stone-900 text-xs uppercase tracking-widest">Ostukorv</h3>
              <button onClick={() => setIsCartOpen(false)} className="text-stone-400 hover:text-stone-600"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="max-h-80 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? <p className="text-center text-stone-500 py-8 italic text-sm">Ostukorv on tühi</p> : cart.map(item => {
                const product = products.find(p => p.id === item.productId);
                return (
                  <div key={item.productId} className="flex gap-3">
                    <img src={product?.image} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-grow min-w-0">
                      <p className="text-xs font-bold truncate">{product?.title}</p>
                      <p className="text-[10px] text-stone-500">{item.quantity} {product?.unit} x {product?.price.toFixed(2)}€</p>
                      <button onClick={() => onRemoveFromCart(item.productId)} className="text-xs text-red-500 font-bold">Eemalda</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {cart.length > 0 && (
              <div className="p-4 bg-stone-50 border-t border-stone-100">
                <button onClick={() => { onCheckout(); setIsCartOpen(false); }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold">Vormista tellimus ({cartTotal.toFixed(2)}€)</button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </nav>
  );
};

export default Navbar;
