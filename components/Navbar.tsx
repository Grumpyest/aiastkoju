
import React, { useState } from 'react';
import { User, UserRole, Language, CartItem, Product } from '../types';
import { supabase } from '../supabaseClient';
import LocationAutocompleteInput from './LocationAutocompleteInput';

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
  
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    location: '',
    role: UserRole.BUYER,
    termsAccepted: false
  });

  const cartTotal = cart.reduce((acc, item) => {
    const product = products.find(p => p.id === item.productId);
    return acc + (product?.price || 0) * item.quantity;
  }, 0);
  const cartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();

  const email = loginData.email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: loginData.password,
  });

  if (error || !data.user) {
    onNotify?.(error?.message || 'Login ebaõnnestus', 'error');
    return;
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id,email,full_name,phone,is_seller,location,username,avatar_url')
    .eq('id', data.user.id)
    .single();

  if (pErr || !profile) {
    await supabase.auth.signOut();
    onNotify?.('Sisse logimine keelatud: profiili ei leitud andmebaasist.', 'error');
    return;
  }

  const metadataLocation = typeof data.user.user_metadata?.location === 'string'
    ? data.user.user_metadata.location.trim()
    : '';
  const nextLocation = profile.location || metadataLocation || '';

  if (!profile.location && metadataLocation) {
    const { error: locationUpdateError } = await supabase
      .from('profiles')
      .update({ location: metadataLocation })
      .eq('id', data.user.id);

    if (locationUpdateError) {
      console.warn('Profile location backfill failed', locationUpdateError);
    }
  }

  setUser({
    id: profile.id,
    name: profile.full_name || (profile.email?.split('@')[0] ?? 'Kasutaja'),
    email: profile.email || email,
    phone: profile.phone || undefined,
    location: nextLocation || undefined,
    role: profile.is_seller ? UserRole.GARDENER : UserRole.BUYER,
    avatar: profile.avatar_url || `https://i.pravatar.cc/150?u=${profile.id}`,
  });

  setAuthModal('none');
  onNotify?.('Sisselogimine õnnestus!', 'success');
};

const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault();

  if (regData.password !== regData.confirmPassword) {
    onNotify?.("Paroolid ei ühti!", "error");
    return;
  }

  if (regData.role === UserRole.GARDENER) {
    if (!regData.termsAccepted) {
      onNotify?.("Aednikuna liitumiseks pead nõustuma tingimustega!", "error");
      return;
    }
    if (!regData.phone || !regData.location) {
      onNotify?.("Aednikuna registreerimiseks on telefon ja asukoht kohustuslikud!", "error");
      return;
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email: regData.email,
    password: regData.password,
    options: {
      data: {
        full_name: regData.name,
        username: regData.name,
        phone: regData.phone,
        location: regData.location,
        is_seller: regData.role === UserRole.GARDENER,
      }
    }
  });

  if (error) {
    onNotify?.(error.message, 'error');
    return;
  }

  // Kui email confirmation on sees, session võib olla null
  if (!data.session) {
    setAuthModal('none');
    onNotify?.('Konto loodud! Palun kinnita e-post ja logi siis sisse.', 'success');
    return;
  }

  // Kui session olemas, kontrolli profiles (ja kui pole, signOut)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,full_name,phone,is_seller,location')
    .eq('id', data.user!.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    onNotify?.('Konto loodi, aga profiili ei tekkinud. Kontrolli triggerit/RLS-i.', 'error');
    return;
  }

  if (regData.phone || regData.location) {
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        phone: regData.phone || null,
        location: regData.location || null,
      })
      .eq('id', data.user!.id);

    if (profileUpdateError) {
      onNotify?.('Konto loodi, aga asukoha salvestamine ebaõnnestus. Salvesta see hiljem profiilis uuesti.', 'error');
    }
  }

  setUser({
    id: profile.id,
    name: profile.full_name || regData.email.split('@')[0] || 'Kasutaja',
    email: profile.email || regData.email,
    phone: profile.phone || undefined,
    location: regData.location || profile.location || undefined,
    role: profile.is_seller ? UserRole.GARDENER : UserRole.BUYER,
    avatar: `https://i.pravatar.cc/150?u=${profile.id}`,
  });

  setAuthModal('none');
  onNotify?.('Konto loodud ja sisse logitud!', 'success');
};

  const handleLogout = async (e?: React.MouseEvent) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
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
                  <div className="fixed inset-0 z-[45] bg-transparent" onClick={() => setIsCartOpen(false)}></div>
                  <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] sm:w-80 bg-white shadow-2xl rounded-2xl border border-stone-100 overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                      <h3 className="font-bold text-stone-900 text-xs uppercase tracking-widest">Ostukorv</h3>
                      <button onClick={() => setIsCartOpen(false)} className="text-stone-400 hover:text-stone-600"><i className="fa-solid fa-xmark"></i></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-4 space-y-4">
                      {cart.length === 0 ? <p className="text-center text-stone-500 py-8 italic text-sm">Ostukorv on tühi</p> : cart.map(item => {
                        const product = products.find(p => p.id === item.productId);
                        const minQty = Math.max(1, Number(product?.minOrderQty ?? 1));
                        const maxQty = Number(product?.stockQty ?? 0) > 0 ? Number(product?.stockQty ?? 0) : Number.MAX_SAFE_INTEGER;
                        const canDecrease = item.quantity > minQty;
                        const canIncrease = item.quantity < maxQty;

                        return (
                          <div key={item.productId} className="flex gap-3 rounded-2xl border border-stone-100 p-3">
                            <img src={product?.image} className="w-14 h-14 rounded-xl object-cover bg-stone-100" />
                            <div className="flex-grow min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate">{product?.title}</p>
                                  <p className="text-[10px] text-stone-500 mt-1">{Number(product?.price ?? 0).toFixed(2)}€ / {product?.unit}</p>
                                </div>
                                <button onClick={() => onRemoveFromCart(item.productId)} className="text-[10px] text-red-500 font-bold whitespace-nowrap">Eemalda</button>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div className="inline-flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
                                  <button onClick={() => onDecreaseQty(item.productId)} disabled={!canDecrease} className="w-6 h-6 rounded-lg bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"><i className="fa-solid fa-minus text-[10px]"></i></button>
                                  <span className="min-w-[20px] text-center text-sm font-black text-stone-900">{item.quantity}</span>
                                  <button onClick={() => onIncreaseQty(item.productId)} disabled={!canIncrease} className="w-6 h-6 rounded-lg bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"><i className="fa-solid fa-plus text-[10px]"></i></button>
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
                        <button onClick={() => { onCheckout(); setIsCartOpen(false); }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold">Vormista tellimus ({cartTotal.toFixed(2)}€)</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <button onClick={() => setCurrentView('profile')} className="w-9 h-9 rounded-full border border-stone-200 overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all">
                  <img src={user.avatar || `https://i.pravatar.cc/150?u=${user.id}`} className="w-full h-full object-cover" />
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

            <button onClick={() => setIsMenuOpen(true)} className="md:hidden p-2 text-stone-500 hover:text-emerald-600 transition-colors">
              <i className="fa-solid fa-bars text-xl"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Side Menu Drawer for Mobile */}
      <div className={`fixed inset-0 z-[100] transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
        <div className={`absolute top-0 right-0 h-full w-[280px] bg-white shadow-2xl transition-transform duration-300 ease-in-out transform ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 flex justify-between items-center border-b border-stone-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs">
                <i className="fa-solid fa-leaf"></i>
              </div>
              <span className="font-bold text-emerald-900">Menüü</span>
            </div>
            <button onClick={() => setIsMenuOpen(false)} className="text-stone-400 text-xl"><i className="fa-solid fa-xmark"></i></button>
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
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 max-md w-full shadow-2xl relative animate-fade-in overflow-y-auto max-h-[90vh]">
            <button onClick={() => setAuthModal('none')} className="absolute top-6 right-6 text-stone-300 hover:text-stone-500 text-xl"><i className="fa-solid fa-xmark"></i></button>
            
            {authModal === 'login' ? (
              <>
                <h2 className="text-2xl font-black text-stone-900 mb-6">Logi sisse</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <input required type="text" placeholder="E-post" value={loginData.email} onChange={e => setLoginData({...loginData, email: e.target.value})} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input required type="password" placeholder="Parool" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition-all">Sisenen</button>
                  <p className="text-center text-xs text-stone-400 mt-4">Pole veel kontot? <button type="button" onClick={() => setAuthModal('register')} className="text-emerald-600 font-bold">Registreeru</button></p>
                </form>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-stone-900 mb-6">Loo konto</h2>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="flex gap-2 p-1 bg-stone-100 rounded-xl mb-2">
                    <button type="button" onClick={() => setRegData({...regData, role: UserRole.BUYER})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${regData.role === UserRole.BUYER ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500'}`}>Ostja</button>
                    <button type="button" onClick={() => setRegData({...regData, role: UserRole.GARDENER})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${regData.role === UserRole.GARDENER ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500'}`}>Aednik</button>
                  </div>
                  
                  <div className="space-y-3 pb-4 border-b border-stone-100">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Isikuandmed</p>
                    <input type="text" placeholder="Kasutajanimi" value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input required type="email" placeholder="E-post" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    
                    <input 
                      required={regData.role === UserRole.GARDENER}
                      type="tel" 
                      placeholder={regData.role === UserRole.GARDENER ? "Telefoninumber (Kohustuslik)" : "Telefoninumber (Valikuline)"}
                      value={regData.phone} 
                      onChange={e => setRegData({...regData, phone: e.target.value})} 
                      className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                    
                    <div className="space-y-2">
                      <LocationAutocompleteInput
                        required={regData.role === UserRole.GARDENER}
                        type="text"
                        value={regData.location}
                        onChange={(value) => setRegData({ ...regData, location: value })}
                        onSelectLocation={(location) => setRegData({ ...regData, location: location.address || location.label })}
                        placeholder={regData.role === UserRole.GARDENER ? "Asukoht või aadress (Kohustuslik)" : "Asukoht või aadress (Valikuline)"}
                        autoComplete="off"
                        inputClassName="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500"
                        dropdownClassName="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                        suggestionClassName="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-stone-100 last:border-b-0"
                        emptyStateClassName="px-4 py-3 text-sm text-stone-500 bg-white"
                      />
                      <p className="text-[10px] text-emerald-600 font-medium px-1 italic leading-tight">
                        * Määrates asukoha, saame pakkuda sulle asjakohasemat kogemust ja näidata lähemal asuvaid aednikke.
                      </p>
                    </div>
                    
                    <input required type="password" placeholder="Parool" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input required type="password" placeholder="Kinnita parool" value={regData.confirmPassword} onChange={e => setRegData({...regData, confirmPassword: e.target.value})} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  
                  {regData.role === UserRole.GARDENER && (
                    <label className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100 cursor-pointer">
                      <input type="checkbox" required checked={regData.termsAccepted} onChange={e => setRegData({...regData, termsAccepted: e.target.checked})} className="w-5 h-5 accent-emerald-600" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-amber-800 uppercase leading-tight">Nõustun aedniku kuutasuga (1€/kuu)</span>
                        <span className="text-[8px] text-amber-700">Tasu debiteeritakse automaatselt kord kuus.</span>
                      </div>
                    </label>
                  )}
                  <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition-all">Loon konto</button>
                  <p className="text-center text-xs text-stone-400 mt-4">On juba konto? <button type="button" onClick={() => setAuthModal('login')} className="text-emerald-600 font-bold">Logi sisse</button></p>
                </form>
              </>
            )}
          </div>
        </div>
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
                      <button onClick={() => onRemoveFromCart(item.productId)} className="text-[9px] text-red-500 font-bold">Eemalda</button>
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
