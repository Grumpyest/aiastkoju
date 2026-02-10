
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, Language, Product, CartItem, Order, OrderStatus, Review } from './types';
import { TRANSLATIONS, CATEGORIES } from './constants';
import Navbar from './components/Navbar';
import HomeView from './views/HomeView';
import CatalogView from './views/CatalogView';
import GardenerDashboard from './views/GardenerDashboard';
import AdminDashboard from './views/AdminDashboard';
import ProductDetail from './views/ProductDetail';
import OrdersView from './views/OrdersView';
import ProfileView from './views/ProfileView';
import CheckoutView from './views/CheckoutView';
import { initialProducts, initialOrders, initialReviews } from './mockData';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('lang') as Language) || Language.ET);
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('products');
    return saved ? JSON.parse(saved) : initialProducts;
  });
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  
  const [currentView, setCurrentView] = useState<'home' | 'catalog' | 'dashboard' | 'admin' | 'product' | 'orders' | 'profile' | 'checkout'>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<'none' | 'login' | 'register'>('none');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  
  const [legalModal, setLegalModal] = useState<'none' | 'about' | 'terms' | 'privacy'>('none');

  // Teavituste olek
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => { localStorage.setItem('lang', language); }, [language]);
  useEffect(() => { localStorage.setItem('user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('products', JSON.stringify(products)); }, [products]);

  const t = useMemo(() => TRANSLATIONS[language], [language]);

  const handleAddToCart = (productId: string, quantity: number = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) return prev.map(item => item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item);
      return [...prev, { productId, quantity }];
    });
    showToast('Toode lisatud ostukorvi!', 'success');
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
    showToast('Toode eemaldatud.', 'success');
  };

  const handleGoToCheckout = () => {
    if (!user) { 
      setIsAuthModalOpen('login');
      return; 
    }
    if (cart.length === 0) {
      showToast("Sinu ostukorv on tühi!", "error");
      setCurrentView('catalog');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentView('checkout');
  };

  const handleBuyNow = (productId: string, quantity: number = 1) => {
    handleAddToCart(productId, quantity);
    if (!user) {
      setIsAuthModalOpen('login');
    } else {
      setCurrentView('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const completeOrder = (newOrders: Order[]) => {
    setOrders(prev => [...prev, ...newOrders]);
    setCart([]);
    setCurrentView('orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Tellimus esitatud! Müüjad võtavad teiega ühendust.", "success");
  };

  const onSearch = (query: string) => {
    setSearchQuery(query);
    setActiveCategory(null);
    setCurrentView('catalog');
  };

  const onSelectCategory = (cat: string | null) => {
    setActiveCategory(cat);
    setSearchQuery('');
    setCurrentView('catalog');
  };

  const renderView = () => {
    const onViewProduct = (id: string) => { setSelectedProductId(id); setCurrentView('product'); window.scrollTo({ top: 0 }); };

    switch (currentView) {
      case 'home':
        return <HomeView onSearch={onSearch} onSelectCategory={onSelectCategory} onViewProduct={onViewProduct} t={t} products={products} />;
      case 'catalog':
        return <CatalogView onViewProduct={onViewProduct} onAddToCart={handleAddToCart} onBuyNow={handleBuyNow} t={t} products={products} initialSearch={searchQuery} initialCategory={activeCategory} />;
      case 'dashboard':
        return user?.role === UserRole.GARDENER ? (
          <GardenerDashboard 
            user={user} 
            products={products} 
            orders={orders} 
            reviews={reviews}
            setProducts={setProducts} 
            setOrders={setOrders} 
            setReviews={setReviews}
            onNotify={showToast}
          />
        ) : <HomeView onSearch={onSearch} onSelectCategory={onSelectCategory} onViewProduct={onViewProduct} t={t} products={products} />;
      case 'admin':
        return user?.role === UserRole.ADMIN ? <AdminDashboard products={products} setProducts={setProducts} /> : <HomeView onSearch={onSearch} onSelectCategory={onSelectCategory} onViewProduct={onViewProduct} t={t} products={products} />;
      case 'profile':
        return user ? <ProfileView user={user} setUser={setUser} setCurrentView={setCurrentView} t={t} onBack={() => setCurrentView('home')} onNotify={showToast} /> : null;
      case 'product':
        const prod = products.find(p => p.id === selectedProductId);
        return prod ? (
          <ProductDetail 
            product={prod} 
            user={user}
            reviews={reviews}
            setReviews={setReviews}
            onAddToCart={handleAddToCart} 
            onBuyNow={handleBuyNow}
            onBack={() => setCurrentView('catalog')} 
            onNotify={showToast}
          />
        ) : <div>Toodet ei leitud</div>;
      case 'orders':
        return user ? <OrdersView user={user} orders={orders} products={products} /> : <HomeView onSearch={onSearch} onSelectCategory={onSelectCategory} onViewProduct={onViewProduct} t={t} products={products} />;
      case 'checkout':
        return user ? (
          <CheckoutView 
            user={user} 
            cart={cart} 
            products={products} 
            onComplete={completeOrder}
            onBack={() => setCurrentView('catalog')}
          />
        ) : <div className="py-20 text-center">Palun logi sisse, et kassasse pääseda.</div>;
      default:
        return <HomeView onSearch={onSearch} onSelectCategory={onSelectCategory} onViewProduct={onViewProduct} t={t} products={products} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar 
        currentView={currentView} setCurrentView={setCurrentView}
        user={user} setUser={setUser} cart={cart}
        onRemoveFromCart={handleRemoveFromCart} onCheckout={handleGoToCheckout}
        language={language} setLanguage={setLanguage} t={t} products={products}
        authModal={isAuthModalOpen} setAuthModal={setIsAuthModalOpen}
        onNotify={showToast}
      />
      
      <main className="flex-grow">{renderView()}</main>

      {/* Teavituste kuvamine */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border-2 animate-bounce-in ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-red-50 border-red-500 text-red-800'}`}>
          <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
          <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}

      <footer className="bg-stone-900 text-stone-300 py-16 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white">
              <i className="fa-solid fa-leaf text-emerald-500 text-2xl"></i>
              <span className="text-2xl font-bold tracking-tight">Aiast Koju</span>
            </div>
            <p className="text-sm leading-relaxed opacity-70">
              Aiast Koju on platvorm, sihtkoht mis ühendab kohalikke väiketootjaid ja teadlikke tarbijaid. Me usume puhtasse toitu ja kogukonna jõusse.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-white mb-6 uppercase text-xs tracking-widest">Kasulik info</h4>
            <ul className="space-y-3 text-sm">
              <li><button onClick={() => setLegalModal('about')} className="hover:text-emerald-400 transition-colors">Meist</button></li>
              <li><button onClick={() => setLegalModal('terms')} className="hover:text-emerald-400 transition-colors">Kasutustingimused</button></li>
              <li><button onClick={() => setLegalModal('privacy')} className="hover:text-emerald-400 transition-colors">Privaatsuspoliitika</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-6 uppercase text-xs tracking-widest">Kategooriad</h4>
            <ul className="space-y-3 text-sm">
              {CATEGORIES.slice(0, 5).map(c => (
                <li key={c}><button onClick={() => onSelectCategory(c)} className="hover:text-emerald-400 transition-colors">{c}</button></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-6 uppercase text-xs tracking-widest">Jälgi meid</h4>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"><i className="fa-brands fa-facebook-f"></i></a>
              <a href="#" className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"><i className="fa-brands fa-instagram"></i></a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-stone-800 text-center opacity-40 text-[10px] uppercase tracking-[0.2em]">
          &copy; {new Date().getFullYear()} Aiast Koju Platvorm. Kõik õigused kaitstud.
        </div>
      </footer>

      {legalModal !== 'none' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-y-auto relative">
            <button onClick={() => setLegalModal('none')} className="absolute top-6 right-6 text-stone-400 hover:text-stone-900"><i className="fa-solid fa-xmark text-xl"></i></button>
            {legalModal === 'about' && (
              <div className="prose prose-stone">
                <h2 className="text-2xl font-bold mb-4">Meie lugu</h2>
                <p>Aiast Koju sai alguse soovist tuua värske ja puhas eestimaine toidukraam lähemale neile, kes hindavad kvaliteeti ja kohalikku toodangut.</p>
                <p>Oleme vahenduskeskkond, kus aednik saab mugavalt oma saaki pakkuda ja ostja leiab endale sobiva kraami otse peenra servalt.</p>
              </div>
            )}
            {legalModal === 'terms' && (
              <div className="prose prose-stone">
                <h2 className="text-2xl font-bold mb-4">Kasutustingimused</h2>
                <p className="font-bold text-red-600">Oluline teada:</p>
                <p>1. Aiast Koju on kuulutuste platvorm ja infovahetuskeskkond. Meie ei ole kaupade müüja ega tootja.</p>
                <p>2. Platvorm ei vastuta pakutava kauba kvaliteedi, koguse ega kirjelduse vastavuse eest. Kogu vastutus lasub kauba pakkujal (Müüjal).</p>
                <p>3. Tehingud, maksed ja kauba üleandmine toimuvad otse Ostja ja Müüja vahel. Platvorm ei paku maksete vahendust ega transporditeenust.</p>
                <p>4. Platvorm jätab endale õiguse eemaldada kuulutusi või kasutajaid, kes rikuvad häid tavasid.</p>
              </div>
            )}
            {legalModal === 'privacy' && (
              <div className="prose prose-stone">
                <h2 className="text-2xl font-bold mb-4">Privaatsuspoliitika</h2>
                <p>Teie andmete turvalisus on meile oluline. Kogume vaid hädavajalikku infot (nimi, e-post), et tagada platvormi toimimine.</p>
                <p>Me ei jaga teie andmeid kolmandatele osapooltele turunduslikel eesmärkidel.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-in {
          0% { transform: translate(-50%, 100%); opacity: 0; }
          70% { transform: translate(-50%, -10px); opacity: 1; }
          100% { transform: translate(-50%, 0); }
        }
        .animate-bounce-in { animation: bounce-in 0.4s ease-out; }
      `}</style>
    </div>
  );
};

export default App;
