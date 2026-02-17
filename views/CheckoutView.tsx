
import React, { useState, useMemo } from 'react';
import { User, Product, CartItem, Order, OrderStatus } from '../types';
import { supabase } from '../supabaseClient';

interface CheckoutViewProps {
  user: User;
  cart: CartItem[];
  products: Product[];
  onComplete: (orders: Order[]) => void;
  onBack: () => void;
}

const CheckoutView: React.FC<CheckoutViewProps> = ({ user, cart, products, onComplete, onBack }) => {
  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    address: user.location || '',
    notes: ''
  });

  const cartItemsWithDetails = useMemo(() => {
    return cart.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      return p ? { ...item, ...p } : null;
    }).filter((cp): cp is (CartItem & Product) => cp !== null);
  }, [cart, products]);

  // Group by seller to show location warnings
  const itemsBySeller = useMemo(() => {
    const groups: Record<string, (CartItem & Product)[]> = {};
    cartItemsWithDetails.forEach(item => {
      if (!groups[item.sellerId]) groups[item.sellerId] = [];
      groups[item.sellerId].push(item);
    });
    return groups;
  }, [cartItemsWithDetails]);

  const total = cartItemsWithDetails.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const sellers = Object.keys(itemsBySeller);
    const createdOrders: Order[] = [];

    for (const sellerId of sellers) {
      const sellerItems = itemsBySeller[sellerId];

      const totalAmount = sellerItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);

      // 1) insert order header
      const { data: orderRow, error: oErr } = await supabase
        .from('orders')
        .insert({
          buyer_id: user.id,
          total_amount: totalAmount,
          status: 'new'
        })
        .select('*')
        .single();

      if (oErr) throw oErr;

      // 2) insert order items
      const itemsPayload = sellerItems.map(si => ({
        order_id: orderRow.id,
        product_id: Number(si.productId),
        seller_id: si.sellerId,
        quantity: si.quantity,
        price_at_purchase: si.price
      }));

      const { error: iErr } = await supabase
        .from('order_items')
        .insert(itemsPayload);

      if (iErr) throw iErr;

      // 3) map tagasi app Order tüübiks (et su UI töötab)
      createdOrders.push({
        id: String(orderRow.id),
        buyerId: user.id,
        buyerName: formData.name,
        buyerPhone: formData.phone,
        buyerEmail: formData.email,
        sellerId: sellerId,
        sellerLocation: sellerItems[0].sellerLocation,
        status: OrderStatus.NEW,
        total: totalAmount,
        items: sellerItems.map(si => ({
          productId: si.productId,
          title: si.title,
          qty: si.quantity,
          price: si.price
        })),
        createdAt: orderRow.created_at,
        deliveryAddress: formData.address
      });
    }

    onComplete(createdOrders);
  } catch (err: any) {
    alert(err?.message || 'Tellimuse salvestamine ebaõnnestus');
  }
};

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <button 
        onClick={onBack}
        className="mb-8 flex items-center gap-2 text-emerald-600 font-bold hover:translate-x-1 transition-transform"
      >
        <i className="fa-solid fa-arrow-left"></i> Tagasi ostukorvi
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-stone-100 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900 mb-8 flex items-center gap-3">
              <i className="fa-solid fa-truck-fast text-emerald-600"></i> Tellimuse andmed
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Täisnimi</label>
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">E-post</label>
                  <input 
                    required
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Telefon</label>
                  <input 
                    required
                    type="tel" 
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="+372 ..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Sinu asukoht</label>
                  <input 
                    required
                    type="text" 
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Linn, Maakond"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Lisamärkused müüjale</label>
                <textarea 
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  placeholder="Nt: tulen ise järgi neljapäeval kl 17"
                />
              </div>

              <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex gap-4">
                <i className="fa-solid fa-circle-info text-amber-500 text-xl mt-1"></i>
                <div className="text-sm text-amber-900">
                  <p className="font-bold">Oluline info!</p>
                  <p className="opacity-80">Tehingud ja kauba kättesaamine toimuvad otse müüjaga. Platvorm ei paku hetkel automaatset tarnet.</p>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-emerald-600 text-white py-5 rounded-[24px] font-black text-xl shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95"
              >
                Kinnita ja esita tellimus
              </button>
            </form>
          </div>
        </div>

        {/* Right: Summary & Location Warnings */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-stone-100 shadow-sm sticky top-24">
            <h3 className="text-lg font-bold text-stone-900 mb-6 border-b border-stone-50 pb-4">Ostukorvi kokkuvõte</h3>
            
            <div className="space-y-6 mb-8">
              {Object.keys(itemsBySeller).map(sellerId => {
                const sellerItems = itemsBySeller[sellerId];
                const sellerLoc = sellerItems[0].sellerLocation || 'Teadmata';
                const isFar = user.location && !sellerLoc.toLowerCase().includes(user.location.toLowerCase().split(' ')[0]);

                return (
                  <div key={sellerId} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Müüja: {sellerItems[0].sellerName}</p>
                    </div>
                    
                    <div className={`p-4 rounded-2xl border ${isFar ? 'bg-red-50 border-red-100' : 'bg-stone-50 border-stone-100'}`}>
                      <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">Pealevõtmise asukoht:</p>
                      <div className="flex items-center gap-2">
                        <i className={`fa-solid fa-location-dot ${isFar ? 'text-red-500' : 'text-emerald-500'}`}></i>
                        <span className={`text-sm font-bold ${isFar ? 'text-red-700' : 'text-stone-900'}`}>{sellerLoc}</span>
                      </div>
                      {isFar && (
                        <p className="text-[10px] text-red-600 mt-2 font-bold uppercase animate-pulse">
                          <i className="fa-solid fa-triangle-exclamation mr-1"></i> See müüja asub Sinu asukohast kaugel!
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {sellerItems.map(item => (
                        <div key={item.id} className="flex justify-between text-xs">
                          <span className="text-stone-600">{item.title} (x{item.quantity})</span>
                          <span className="font-bold text-stone-900">{(item.price * item.quantity).toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 border-t border-stone-100 flex justify-between items-center">
              <span className="text-sm font-bold text-stone-400 uppercase">Kokku tasuda:</span>
              <span className="text-3xl font-black text-emerald-800">{total.toFixed(2)}€</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutView;
