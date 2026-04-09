import React, { useEffect, useMemo, useState } from 'react';
import { User, UserRole, Language, Product, CartItem, Order, OrderStatus, Review, MarketplaceLocationFilter } from './types';
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
import { supabase } from './supabaseClient';

const LOCATION_FILTER_STORAGE_KEY = 'marketplace-location-filter-v1';

const mergeProductsWithReviewStats = (products: Product[], reviews: Review[]) => {
  const statsByProductId = new Map<string, { total: number; count: number }>();

  for (const review of reviews) {
    const productId = String(review.productId);
    const rating = Number(review.rating ?? 0);
    const current = statsByProductId.get(productId) ?? { total: 0, count: 0 };

    statsByProductId.set(productId, {
      total: current.total + rating,
      count: current.count + 1,
    });
  }

  return products.map(product => {
    const stats = statsByProductId.get(String(product.id));
    const reviewsCount = stats?.count ?? 0;
    const rating = reviewsCount > 0 ? Number((stats!.total / reviewsCount).toFixed(1)) : 0;

    return {
      ...product,
      rating,
      reviewsCount,
    };
  });
};

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

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  const [currentView, setCurrentView] = useState<'home' | 'catalog' | 'dashboard' | 'admin' | 'product' | 'orders' | 'profile' | 'checkout'>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<'none' | 'login' | 'register'>('none');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<MarketplaceLocationFilter>(() => {
    if (typeof window === 'undefined') {
      return { location: null, radiusKm: 20 };
    }

    try {
      const saved = window.localStorage.getItem(LOCATION_FILTER_STORAGE_KEY);
      if (!saved) {
        return { location: null, radiusKm: 20 };
      }

      const parsed = JSON.parse(saved) as MarketplaceLocationFilter;
      return {
        location: parsed?.location ?? null,
        radiusKm: Number.isFinite(parsed?.radiusKm) ? parsed.radiusKm : 20,
      };
    } catch {
      return { location: null, radiusKm: 20 };
    }
  });

  const [legalModal, setLegalModal] = useState<'none' | 'about' | 'terms' | 'privacy'>('none');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    const init = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const supabaseUser = sess.session?.user;

      if (!supabaseUser) {
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id,email,full_name,phone,location,is_seller,avatar_url')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (!profile) {
        await supabase.auth.signOut();
        setUser(null);
        return;
      }

      setUser({
        id: profile.id,
        name: profile.full_name || (profile.email?.split('@')[0] ?? 'Kasutaja'),
        email: profile.email || supabaseUser.email || '',
        phone: profile.phone || undefined,
        location: profile.location || undefined,
        role: profile.is_seller ? UserRole.GARDENER : UserRole.BUYER,
        avatar: profile.avatar_url || `https://i.pravatar.cc/150?u=${profile.id}`,
      });
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          seller_id,
          title,
          description,
          category,
          price_cents,
          unit,
          stock_qty,
          min_order_qty,
          image_url,
          is_active,
          status,
          created_at,
          product_images (
            url,
            sort_order
          )
        `)
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (error) {
        showToast(error.message, 'error');
        return;
      }

      const sellerIds = [...new Set((data || []).map((product: any) => String(product.seller_id)).filter(Boolean))];
      const sellersById = new Map<string, { full_name?: string | null; location?: string | null }>();

      if (sellerIds.length > 0) {
        const { data: sellerRows, error: sellerError } = await supabase
          .from('profiles')
          .select('id, full_name, location')
          .in('id', sellerIds);

        if (sellerError) {
          console.error('Failed to load seller profiles', sellerError);
        } else {
          for (const seller of sellerRows || []) {
            sellersById.set(String(seller.id), seller);
          }
        }
      }

      const mapped: Product[] = (data || []).map((productRow: any) => {
        const seller = sellersById.get(String(productRow.seller_id));

        return {
          id: String(productRow.id),
          sellerId: String(productRow.seller_id),
          sellerName: seller?.full_name || 'Müüja',
          sellerLocation: seller?.location || '',
          createdAt: String(productRow.created_at ?? ''),
          title: productRow.title || '',
          description: productRow.description || '',
          category: productRow.category || 'Muu',
          price: Number((productRow.price_cents ?? 0) / 100),
          unit: productRow.unit || 'tk',
          stockQty: Number(productRow.stock_qty ?? 0),
          minOrderQty: Number(productRow.min_order_qty ?? 1),
          image: productRow.image_url || '/placeholder.png',
          images: productRow.product_images
            ? productRow.product_images
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((img: any) => img.url)
            : [],
          isActive: productRow.is_active === true,
          status: productRow.status,
          rating: 0,
          reviewsCount: 0,
        };
      });

      setProducts(mapped);
    };

    loadProducts();
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      const { data: orderRows, error: orderErr } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (orderErr) {
        showToast(orderErr.message, 'error');
        return;
      }

      const { data: itemRows, error: itemErr } = await supabase
        .from('order_items')
        .select('*');

      if (itemErr) {
        showToast(itemErr.message, 'error');
        return;
      }

      const sellerIds = [...new Set((orderRows || []).map((orderRow: any) => String(orderRow.seller_id)).filter(Boolean))];
      const sellersById = new Map<string, { full_name?: string | null; location?: string | null }>();

      if (sellerIds.length > 0) {
        const { data: sellerRows, error: sellerError } = await supabase
          .from('profiles')
          .select('id, full_name, location')
          .in('id', sellerIds);

        if (sellerError) {
          console.error('Failed to load order seller profiles', sellerError);
        } else {
          for (const seller of sellerRows || []) {
            sellersById.set(String(seller.id), seller);
          }
        }
      }

      const productById = new Map(products.map(product => [String(product.id), product]));
      const itemsByOrderId = new Map<string, Order['items']>();

      for (const itemRow of itemRows || []) {
        const orderId = String(itemRow.order_id);
        const product = productById.get(String(itemRow.product_id));
        const existingItems = itemsByOrderId.get(orderId) ?? [];

        existingItems.push({
          productId: String(itemRow.product_id),
          title: product?.title || 'Toode',
          qty: Number(itemRow.quantity ?? 0),
          price: Number(itemRow.unit_price ?? 0),
        });

        itemsByOrderId.set(orderId, existingItems);
      }

      const mapped: Order[] = (orderRows || []).map((orderRow: any) => {
        const seller = sellersById.get(String(orderRow.seller_id));

        return {
        id: String(orderRow.id),
        buyerId: String(orderRow.buyer_id),
        buyerName: orderRow.buyer_name || '',
        buyerPhone: orderRow.buyer_phone || '',
        buyerEmail: orderRow.buyer_email || '',
        sellerId: String(orderRow.seller_id),
        sellerName: seller?.full_name || 'Müüja',
        sellerLocation: seller?.location || '',
        status: orderRow.status as OrderStatus,
        total: Number(orderRow.total ?? 0),
        createdAt: String(orderRow.created_at ?? ''),
        deliveryAddress: orderRow.delivery_address || '',
        notes: orderRow.notes || '',
        items: itemsByOrderId.get(String(orderRow.id)) ?? [],
      };
      });

      setOrders(mapped);
    };

    if (products.length > 0) {
      loadOrders();
    }
  }, [products]);

  useEffect(() => {
    const loadReviews = async () => {
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id,
          order_id,
          product_id,
          user_id,
          rating,
          comment,
          created_at,
          profiles:user_id (
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      if (reviewsError) {
        showToast(reviewsError.message, 'error');
        return;
      }

      const { data: repliesData, error: repliesError } = await supabase
        .from('review_replies')
        .select('id, review_id, user_id, user_name, text, role, created_at')
        .order('created_at', { ascending: true });

      if (repliesError) {
        showToast(repliesError.message, 'error');
        return;
      }

      const mappedReviews: Review[] = (reviewsData || []).map((reviewRow: any) => ({
        id: String(reviewRow.id),
        orderId: reviewRow.order_id ? String(reviewRow.order_id) : null,
        productId: String(reviewRow.product_id),
        userId: String(reviewRow.user_id),
        reviewerName: reviewRow.profiles?.full_name || 'Kasutaja',
        rating: Number(reviewRow.rating ?? 0),
        comment: String(reviewRow.comment ?? ''),
        createdAt: String(reviewRow.created_at ?? ''),
        replies: (repliesData || [])
          .filter((replyRow: any) => String(replyRow.review_id) === String(reviewRow.id))
          .map((replyRow: any) => ({
            id: String(replyRow.id),
            userId: String(replyRow.user_id),
            userName: String(replyRow.user_name),
            text: String(replyRow.text ?? ''),
            role: replyRow.role,
            createdAt: String(replyRow.created_at ?? ''),
          })),
      }));

      setReviews(mappedReviews);
    };

    loadReviews();
  }, []);

  useEffect(() => {
    localStorage.setItem('lang', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(LOCATION_FILTER_STORAGE_KEY, JSON.stringify(locationFilter));
  }, [locationFilter]);

  const t = useMemo(() => TRANSLATIONS[language], [language]);
  const productsWithReviewStats = useMemo(() => mergeProductsWithReviewStats(products, reviews), [products, reviews]);

  const getCartQuantityBounds = (productId: string) => {
    const product = products.find(item => item.id === productId);
    const minQty = Math.max(1, Number(product?.minOrderQty ?? 1));
    const rawStockQty = Number(product?.stockQty ?? 0);
    const maxQty = rawStockQty > 0 ? rawStockQty : Number.MAX_SAFE_INTEGER;

    return { product, minQty, maxQty };
  };

  const handleAddToCart = (productId: string, quantity: number = 1) => {
    const { product, minQty, maxQty } = getCartQuantityBounds(productId);
    if (!product) return;

    const requestedQty = Math.max(minQty, Number(quantity || minQty));

    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);

      if (existing) {
        return prev.map(item =>
          item.productId === productId
            ? { ...item, quantity: Math.min(maxQty, item.quantity + requestedQty) }
            : item
        );
      }

      return [...prev, { productId, quantity: Math.min(maxQty, requestedQty) }];
    });

    showToast('Toode lisatud ostukorvi!', 'success');
  };

  const handleIncreaseCartQty = (productId: string) => {
    const { maxQty } = getCartQuantityBounds(productId);

    setCart(prev =>
      prev.map(item =>
        item.productId === productId
          ? { ...item, quantity: Math.min(maxQty, item.quantity + 1) }
          : item
      )
    );
  };

  const handleDecreaseCartQty = (productId: string) => {
    const { minQty } = getCartQuantityBounds(productId);

    setCart(prev =>
      prev.map(item =>
        item.productId === productId
          ? { ...item, quantity: Math.max(minQty, item.quantity - 1) }
          : item
      )
    );
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
      showToast('Sinu ostukorv on tühi!', 'error');
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
      return;
    }

    setCurrentView('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const completeOrder = (newOrders: Order[]) => {
    setOrders(prev => [...prev, ...newOrders]);
    setCart([]);
    setCurrentView('orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Tellimus esitatud! Müüjad võtavad teiega ühendust.', 'success');
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
    const onViewProduct = (id: string) => {
      setSelectedProductId(id);
      setCurrentView('product');
      window.scrollTo({ top: 0 });
    };

    switch (currentView) {
      case 'home':
        return (
          <HomeView
            onSearch={onSearch}
            onSelectCategory={onSelectCategory}
            onViewProduct={onViewProduct}
            t={t}
            products={productsWithReviewStats}
          />
        );
      case 'catalog':
        return (
          <CatalogView
            onViewProduct={onViewProduct}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            t={t}
            user={user}
            products={productsWithReviewStats}
            initialSearch={searchQuery}
            initialCategory={activeCategory}
            locationFilter={locationFilter}
            setLocationFilter={setLocationFilter}
          />
        );
      case 'dashboard':
        return user?.role === UserRole.GARDENER ? (
          <GardenerDashboard
            user={user}
            products={productsWithReviewStats}
            orders={orders}
            reviews={reviews}
            setProducts={setProducts}
            setOrders={setOrders}
            setReviews={setReviews}
            onNotify={showToast}
          />
        ) : (
          <HomeView
            onSearch={onSearch}
            onSelectCategory={onSelectCategory}
            onViewProduct={onViewProduct}
            t={t}
            products={productsWithReviewStats}
          />
        );
      case 'admin':
        return user?.role === UserRole.ADMIN ? (
          <AdminDashboard products={productsWithReviewStats} setProducts={setProducts} />
        ) : (
          <HomeView
            onSearch={onSearch}
            onSelectCategory={onSelectCategory}
            onViewProduct={onViewProduct}
            t={t}
            products={productsWithReviewStats}
          />
        );
      case 'profile':
        return user ? (
          <ProfileView
            user={user}
            setUser={setUser}
            setCurrentView={setCurrentView}
            t={t}
            onBack={() => setCurrentView('home')}
            onNotify={showToast}
          />
        ) : null;
      case 'product': {
        const product = productsWithReviewStats.find(p => p.id === selectedProductId);

        return product ? (
          <ProductDetail
            product={product}
            user={user}
            reviews={reviews}
            setReviews={setReviews}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onBack={() => setCurrentView('catalog')}
            onNotify={showToast}
          />
        ) : (
          <div>Toodet ei leitud</div>
        );
      }
      case 'orders':
        return user ? (
          <OrdersView
            user={user}
            orders={orders}
            products={productsWithReviewStats}
            reviews={reviews}
            setReviews={setReviews}
            cart={cart}
            onIncreaseQty={handleIncreaseCartQty}
            onDecreaseQty={handleDecreaseCartQty}
            onRemoveFromCart={handleRemoveFromCart}
            onCheckout={handleGoToCheckout}
            onNotify={showToast}
          />
        ) : (
          <HomeView
            onSearch={onSearch}
            onSelectCategory={onSelectCategory}
            onViewProduct={onViewProduct}
            t={t}
            products={productsWithReviewStats}
          />
        );
      case 'checkout':
        return user ? (
          <CheckoutView
            user={user}
            cart={cart}
            products={productsWithReviewStats}
            onIncreaseQty={handleIncreaseCartQty}
            onDecreaseQty={handleDecreaseCartQty}
            onRemoveFromCart={handleRemoveFromCart}
            onComplete={completeOrder}
            onBack={() => setCurrentView('catalog')}
          />
        ) : (
          <div className="py-20 text-center">Palun logi sisse, et kassasse pääseda.</div>
        );
      default:
        return (
          <HomeView
            onSearch={onSearch}
            onSelectCategory={onSelectCategory}
            onViewProduct={onViewProduct}
            t={t}
            products={productsWithReviewStats}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        user={user}
        setUser={setUser}
        cart={cart}
        onIncreaseQty={handleIncreaseCartQty}
        onDecreaseQty={handleDecreaseCartQty}
        onRemoveFromCart={handleRemoveFromCart}
        onCheckout={handleGoToCheckout}
        language={language}
        setLanguage={setLanguage}
        t={t}
        products={productsWithReviewStats}
        authModal={isAuthModalOpen}
        setAuthModal={setIsAuthModalOpen}
        onNotify={showToast}
      />

      <main className="flex-grow">{renderView()}</main>

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
