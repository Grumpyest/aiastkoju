
import React, { useState, useMemo, useRef } from 'react';
import { User, Product, Order, OrderStatus, ProductStatus, Review } from '../types';
import { CATEGORIES, UNITS } from '../constants';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, YAxis } from 'recharts';

interface GardenerDashboardProps {
  user: User;
  products: Product[];
  orders: Order[];
  reviews?: Review[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setReviews?: React.Dispatch<React.SetStateAction<Review[]>>;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?auto=format&fit=crop&q=80&w=600';

const GardenerDashboard: React.FC<GardenerDashboardProps> = ({ 
  user, products, orders, reviews = [], setProducts, setOrders, setReviews, onNotify 
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'products' | 'orders' | 'reviews'>('stats');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editExtraFileInputRef = useRef<HTMLInputElement>(null);

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    title: '',
    description: '',
    category: CATEGORIES[0],
    unit: UNITS[0],
    price: 0,
    stockQty: 0,
    minOrderQty: 1,
    image: DEFAULT_IMAGE,
    images: [],
    status: ProductStatus.ACTIVE
  });

  const myProducts = useMemo(() => products.filter(p => p.sellerId === user.id), [products, user.id]);
  const myOrders = useMemo(() => orders.filter(o => o.sellerId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [orders, user.id]);
  const myReviews = useMemo(() => reviews.filter(r => myProducts.some(p => p.id === r.targetId)), [reviews, myProducts]);
  
  const totalRevenue = myOrders.filter(o => o.status === OrderStatus.COMPLETED).reduce((acc, curr) => acc + curr.total, 0);
  const pendingOrdersCount = myOrders.filter(o => o.status === OrderStatus.NEW).length;
  const inProgressOrdersCount = myOrders.filter(o => o.status === OrderStatus.CONFIRMED).length;

  const chartData = useMemo(() => {
    return myProducts.map(p => {
      const revenue = myOrders
        .filter(o => o.status === OrderStatus.COMPLETED)
        .reduce((acc, o) => {
          const item = o.items.find(i => i.productId === p.id);
          return acc + (item ? item.price * item.qty : 0);
        }, 0);
      return { name: p.title.length > 10 ? p.title.substring(0, 10) + '...' : p.title, fullName: p.title, revenue };
    }).filter(d => d.revenue > 0);
  }, [myProducts, myOrders]);

  const handleStatusUpdate = (orderId: string, newStatus: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    if (onNotify) onNotify(`Tellimuse staatus uuendatud: ${newStatus}`, 'success');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: 'add' | 'edit', isExtra: boolean = false) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (mode === 'add') {
          if (isExtra) {
            setNewProduct(prev => ({ ...prev, images: [...(prev.images || []), base64String] }));
          } else {
            setNewProduct(prev => ({ ...prev, image: base64String }));
          }
        } else if (mode === 'edit' && editingProduct) {
          if (isExtra) {
            setEditingProduct(prev => prev ? ({ ...prev, images: [...(prev.images || []), base64String] }) : null);
          } else {
            setEditingProduct(prev => prev ? ({ ...prev, image: base64String }) : null);
          }
        }
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const removeImage = (index: number, mode: 'add' | 'edit') => {
    if (mode === 'add') {
      setNewProduct(prev => ({ ...prev, images: (prev.images || []).filter((_, i) => i !== index) }));
    } else if (mode === 'edit' && editingProduct) {
      setEditingProduct(prev => prev ? ({ ...prev, images: (prev.images || []).filter((_, i) => i !== index) }) : null);
    }
  };

  const handleSaveNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.title) return;

    const productToAdd: Product = {
      id: `p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sellerId: user.id,
      sellerName: user.name,
      sellerLocation: user.location || 'Määramata',
      title: newProduct.title || '',
      description: newProduct.description || '',
      category: newProduct.category || CATEGORIES[0],
      price: newProduct.price || 0,
      unit: newProduct.unit || UNITS[0],
      stockQty: newProduct.stockQty || 0,
      minOrderQty: newProduct.minOrderQty || 1,
      image: newProduct.image || DEFAULT_IMAGE,
      images: newProduct.images || [],
      isActive: true,
      status: ProductStatus.ACTIVE,
      rating: 0,
      reviewsCount: 0
    };
    
    setProducts(prev => [productToAdd, ...prev]);
    setIsAddModalOpen(false);
    setNewProduct({
      title: '', description: '', category: CATEGORIES[0], unit: UNITS[0],
      price: 0, stockQty: 0, minOrderQty: 1, image: DEFAULT_IMAGE, images: [],
      status: ProductStatus.ACTIVE
    });
    if (onNotify) onNotify('Toode edukalt lisatud! See on nüüd kataloogis nähtav.', 'success');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setProducts(prev => prev.map(p => p.id === editingProduct.id ? editingProduct : p));
    setIsEditModalOpen(false);
    if (onNotify) onNotify('Muudatused salvestatud!', 'success');
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
    setConfirmingDeleteId(null);
    if (onNotify) onNotify('Toode on eemaldatud.', 'success');
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.NEW: return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Uus</span>;
      case OrderStatus.CONFIRMED: return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Kinnitatud</span>;
      case OrderStatus.COMPLETED: return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Täidetud</span>;
      case OrderStatus.CANCELLED: return <span className="bg-stone-100 text-stone-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Tühistatud</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">Minu Aed</h1>
          <p className="text-stone-500 text-sm">Tere, {user.name}! Halda siin oma tooteid ja tellimusi.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)} 
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black shadow-lg shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-2"
        >
          <i className="fa-solid fa-plus"></i> Lisa uus toode
        </button>
      </div>

      <div className="flex gap-2 mb-8 bg-stone-100 p-1.5 rounded-2xl overflow-x-auto no-scrollbar">
        {[
          { id: 'stats', label: 'Statistika', icon: 'fa-chart-pie' },
          { id: 'products', label: 'Tooted', icon: 'fa-basket-shopping' },
          { id: 'orders', label: 'Tellimused', icon: 'fa-receipt' },
          { id: 'reviews', label: 'Arvustused', icon: 'fa-star' }
        ].map(tab => (
          <button 
  key={tab.id} 
  onClick={() => setActiveTab(tab.id as any)} 
  className={`relative flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-emerald-700 shadow-md' : 'text-stone-500 hover:text-stone-900'}`}
>
  <i className={`fa-solid ${tab.icon} text-xs`}></i> 
  {tab.label}

  {tab.id === 'orders' && activeTab !== 'orders' && pendingOrdersCount > 0 && (
    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
      {pendingOrdersCount}
    </span>
  )}

  {tab.id === 'orders' && activeTab !== 'orders' && pendingOrdersCount === 0 && inProgressOrdersCount > 0 && (
    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-white text-[10px] font-black flex items-center justify-center">
      {inProgressOrdersCount}
    </span>
  )}
</button>
        ))}
      </div>

      {activeTab === 'stats' && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[32px] border border-stone-100 shadow-sm">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Käive</p>
              <h3 className="text-2xl font-black text-emerald-700">{totalRevenue.toFixed(2)}€</h3>
            </div>
            <div className="bg-white p-6 rounded-[32px] border border-stone-100 shadow-sm">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Tellimused</p>
              <h3 className="text-2xl font-black text-amber-600">{pendingOrdersCount}</h3>
            </div>
            <div className="bg-white p-6 rounded-[32px] border border-stone-100 shadow-sm">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Tooteid</p>
              <h3 className="text-2xl font-black text-stone-900">{myProducts.length}</h3>
            </div>
            <div className="bg-white p-6 rounded-[32px] border border-stone-100 shadow-sm">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Arvustusi</p>
              <h3 className="text-2xl font-black text-stone-900">{myReviews.length}</h3>
            </div>
          </div>
          
          <div className="bg-white p-8 rounded-[40px] border border-stone-100 shadow-sm">
            <h3 className="text-lg font-bold text-stone-900 mb-8 uppercase tracking-widest text-xs">Müük toote lõikes (€)</h3>
            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis hide />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-xl">
                              <p className="text-[10px] font-bold text-stone-400 uppercase mb-1">{payload[0].payload.fullName}</p>
                              <p className="text-sm font-black text-emerald-700">{payload[0].value}€</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="revenue" radius={[10, 10, 10, 10]} barSize={40}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10b981' : '#059669'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-300">
                  <i className="fa-solid fa-chart-bar text-3xl mb-2"></i>
                  <p className="text-xs font-bold uppercase">Andmed puuduvad</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {myProducts.length === 0 ? (
            <div className="col-span-full py-24 text-center bg-white rounded-[40px] border-2 border-dashed border-stone-100">
               <i className="fa-solid fa-seedling text-4xl text-stone-200 mb-4"></i>
               <p className="text-stone-400 font-bold">Sul pole veel ühtegi toodet müügis.</p>
            </div>
          ) : myProducts.map(p => (
            <div key={p.id} className="bg-white rounded-[32px] border border-stone-100 shadow-sm overflow-hidden group">
               <div className="h-48 relative overflow-hidden">
                 <img src={p.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                 <div className="absolute top-4 right-4 flex gap-2">
                    {confirmingDeleteId === p.id ? (
                      <div className="flex gap-2 animate-fade-in">
                         <button onClick={() => handleDeleteProduct(p.id)} className="h-10 px-4 bg-red-600 text-white rounded-xl shadow-lg font-bold text-[10px] flex items-center gap-2 hover:bg-red-700 transition-all active:scale-90"><i className="fa-solid fa-check"></i> Kinnita</button>
                         <button onClick={() => setConfirmingDeleteId(null)} className="w-10 h-10 bg-white/90 backdrop-blur text-stone-500 rounded-xl shadow-lg flex items-center justify-center hover:bg-stone-200 transition-all active:scale-90"><i className="fa-solid fa-xmark"></i></button>
                      </div>
                    ) : (
                      <>
                         <button onClick={() => { setEditingProduct({...p}); setIsEditModalOpen(true); }} className="w-10 h-10 bg-white/90 backdrop-blur text-emerald-600 rounded-xl shadow-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all active:scale-90" title="Muuda"><i className="fa-solid fa-pen"></i></button>
                         <button onClick={() => setConfirmingDeleteId(p.id)} className="w-10 h-10 bg-white/90 backdrop-blur text-red-500 rounded-xl shadow-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-90" title="Kustuta"><i className="fa-solid fa-trash"></i></button>
                      </>
                    )}
                 </div>
               </div>
               <div className="p-6">
                 <div className="flex justify-between items-start mb-2">
                   <h3 className="font-black text-stone-900 text-lg">{p.title}</h3>
                   <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-tight">{p.category}</span>
                 </div>
                 <div className="flex justify-between items-center mt-4 pt-4 border-t border-stone-50">
                    <div>
                      <span className="text-xl font-black text-emerald-700">{p.price.toFixed(2)}€</span>
                      <span className="text-stone-400 text-[10px] font-bold ml-1 uppercase">/ {p.unit}</span>
                    </div>
                    <span className="text-[10px] font-bold text-stone-400 uppercase bg-stone-50 px-3 py-1 rounded-full">Laos: {p.stockQty}</span>
                 </div>
               </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-6">
          {myOrders.length === 0 ? (
            <div className="py-24 text-center bg-white rounded-[40px] border-2 border-dashed border-stone-100">
               <i className="fa-solid fa-receipt text-4xl text-stone-200 mb-4"></i>
               <p className="text-stone-400 font-bold">Sul pole veel ühtegi tellimust.</p>
            </div>
          ) : myOrders.map(order => (
            <div key={order.id} className="bg-white rounded-[32px] border border-stone-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-stone-50 flex flex-wrap justify-between items-center gap-4 bg-stone-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-stone-400 border border-stone-100 shadow-sm">
                    <i className="fa-solid fa-box-open"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-stone-900">Tellimus #{order.id.substring(4, 10).toUpperCase()}</h4>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {getStatusBadge(order.status)}
                  <div className="text-right">
                    <p className="text-xl font-black text-emerald-700">{order.total.toFixed(2)}€</p>
                  </div>
                </div>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4">Sisu:</p>
                  <div className="space-y-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm font-medium">
                        <span className="text-stone-600">{item.title} <span className="text-stone-400 ml-1">x{item.qty}</span></span>
                        <span className="text-stone-900">{(item.qty * item.price).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4">Ostja:</p>
                    <div className="flex items-center gap-3">
                      <img src={`https://i.pravatar.cc/150?u=${order.buyerId}`} className="w-10 h-10 rounded-xl shadow-sm" />
                      <div>
                        <p className="text-sm font-bold text-stone-900">{order.buyerName}</p>
                        <p className="text-xs text-stone-500">{order.buyerPhone || order.buyerEmail}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-4">
                    {order.status === OrderStatus.NEW && (
                      <button 
                        onClick={() => handleStatusUpdate(order.id, OrderStatus.CONFIRMED)}
                        className="flex-1 bg-emerald-600 text-white py-3 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/10 hover:bg-emerald-700 transition-all active:scale-95"
                      >
                        Kinnita tellimus
                      </button>
                    )}
                    {order.status === OrderStatus.CONFIRMED && (
                      <button 
                        onClick={() => handleStatusUpdate(order.id, OrderStatus.COMPLETED)}
                        className="flex-1 bg-emerald-600 text-white py-3 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/10 hover:bg-emerald-700 transition-all active:scale-95"
                      >
                        Märgi täidetuks
                      </button>
                    )}
                    {(order.status === OrderStatus.NEW || order.status === OrderStatus.CONFIRMED) && (
                      <button 
                        onClick={() => handleStatusUpdate(order.id, OrderStatus.CANCELLED)}
                        className="px-6 border border-stone-200 text-stone-400 py-3 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all active:scale-95"
                      >
                        Tühista
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {myReviews.length === 0 ? (
            <div className="col-span-full py-24 text-center bg-white rounded-[40px] border-2 border-dashed border-stone-100">
               <i className="fa-solid fa-star text-4xl text-stone-200 mb-4"></i>
               <p className="text-stone-400 font-bold">Sinule pole veel arvustusi jäetud.</p>
            </div>
          ) : myReviews.map(review => {
            const product = products.find(p => p.id === review.targetId);
            return (
              <div key={review.id} className="bg-white p-8 rounded-[32px] border border-stone-100 shadow-sm flex gap-6">
                <img src={`https://i.pravatar.cc/150?u=${review.reviewerId}`} className="w-16 h-16 rounded-2xl shadow-sm border border-stone-50" />
                <div className="flex-grow">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-black text-stone-900 text-sm">{review.reviewerName}</h4>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{product?.title}</p>
                    </div>
                    <div className="flex text-yellow-400 text-[10px] gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => <i key={s} className={`fa-solid fa-star ${s <= review.stars ? 'text-yellow-400' : 'text-stone-100'}`}></i>)}
                    </div>
                  </div>
                  <p className="text-stone-600 text-sm font-medium italic mt-4">"{review.comment}"</p>
                  <p className="text-[9px] text-stone-400 mt-4 uppercase font-bold tracking-widest">{new Date(review.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[110] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl animate-fade-in relative my-auto">
            <div className="p-8 border-b border-stone-50 flex justify-between items-center">
              <h2 className="text-2xl font-black text-stone-900">Lisa uus toode</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-stone-300 hover:text-stone-600 text-2xl transition-colors"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleSaveNewProduct} className="p-8 space-y-8 max-h-[70vh] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-stone-100">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 block">Peamine toote pilt</label>
                  <div className="flex gap-6 items-center bg-stone-50 p-6 rounded-3xl border border-dashed border-stone-200">
                    <img src={newProduct.image} className="w-24 h-24 object-cover rounded-2xl shadow-sm bg-white" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-emerald-600 text-emerald-600 px-6 py-2.5 rounded-xl text-xs font-black shadow-sm hover:bg-emerald-50 transition-all">Vali fail</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'add', false)} />
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 block">Lisapildid galeriisse</label>
                  <div className="grid grid-cols-4 gap-4">
                    {(newProduct.images || []).map((img, i) => (
                      <div key={i} className="relative group aspect-square rounded-2xl overflow-hidden shadow-sm border border-stone-100">
                        <img src={img} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(i, 'add')} className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"><i className="fa-solid fa-trash"></i></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => extraFileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-stone-200 rounded-2xl flex items-center justify-center text-stone-300 hover:text-emerald-500 hover:border-emerald-500 transition-all bg-stone-50/30"><i className="fa-solid fa-plus text-xl"></i></button>
                    <input type="file" ref={extraFileInputRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'add', true)} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-full">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Toote nimi</label>
                  <input required value={newProduct.title} onChange={e => setNewProduct({...newProduct, title: e.target.value})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 focus:ring-2 focus:ring-emerald-500 outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Kategooria</label>
                  <select required value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none font-bold">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Hind (€)</label>
                  <input required type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value) || 0})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Ühik</label>
                  <select required value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none font-bold">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Laoseis</label>
                  <input required type="number" value={newProduct.stockQty} onChange={e => setNewProduct({...newProduct, stockQty: parseInt(e.target.value) || 0})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none font-bold" />
                </div>
                <div className="space-y-2 col-span-full">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Kirjeldus</label>
                  <textarea required rows={3} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-[24px] font-black text-lg shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95">Lisa toode poodi</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 z-[110] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl animate-fade-in relative my-auto">
            <div className="p-8 border-b border-stone-50 flex justify-between items-center">
              <h2 className="text-2xl font-black text-stone-900">Muuda toodet</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-stone-300 hover:text-stone-600 text-2xl transition-colors"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-8 space-y-8 max-h-[70vh] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-stone-100">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 block">Peamine toote pilt</label>
                  <div className="flex gap-6 items-center bg-stone-50 p-6 rounded-3xl border border-dashed border-stone-200">
                    <img src={editingProduct.image} className="w-24 h-24 object-cover rounded-2xl shadow-sm bg-white" />
                    <button type="button" onClick={() => editFileInputRef.current?.click()} className="bg-white border-2 border-emerald-600 text-emerald-600 px-6 py-2.5 rounded-xl text-xs font-black shadow-sm hover:bg-emerald-50 transition-all">Muuda pilti</button>
                    <input type="file" ref={editFileInputRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'edit', false)} />
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 block">Lisapildid galeriisse</label>
                  <div className="grid grid-cols-4 gap-4">
                    {(editingProduct.images || []).map((img, i) => (
                      <div key={i} className="relative group aspect-square rounded-2xl overflow-hidden shadow-sm border border-stone-100">
                        <img src={img} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(i, 'edit')} className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"><i className="fa-solid fa-trash"></i></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => editExtraFileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-stone-200 rounded-2xl flex items-center justify-center text-stone-300 hover:text-emerald-500 hover:border-emerald-500 transition-all bg-stone-50/30"><i className="fa-solid fa-plus text-xl"></i></button>
                    <input type="file" ref={editExtraFileInputRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'edit', true)} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-full">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Toote nimi</label>
                  <input required value={editingProduct.title} onChange={e => setEditingProduct({...editingProduct, title: e.target.value})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 focus:ring-2 focus:ring-emerald-500 outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Hind (€)</label>
                  <input required type="number" step="0.01" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value) || 0})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Laoseis</label>
                  <input required type="number" value={editingProduct.stockQty} onChange={e => setEditingProduct({...editingProduct, stockQty: parseInt(e.target.value) || 0})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none font-bold" />
                </div>
                <div className="space-y-2 col-span-full">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Kirjeldus</label>
                  <textarea required rows={4} value={editingProduct.description} onChange={e => setEditingProduct({...editingProduct, description: e.target.value})} className="w-full p-4 bg-stone-50 rounded-2xl border border-stone-100 outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-[24px] font-black text-lg shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95">Salvesta muudatused</button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thumb-stone-100::-webkit-scrollbar-thumb { background: #f5f5f4; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default GardenerDashboard;