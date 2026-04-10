import React, { useState } from 'react';
import { User, Order, OrderStatus, Product, Review, CartItem } from '../types';
import { supabase } from '../supabaseClient';
import { buildExternalMapUrl } from '../utils/location';

interface OrdersViewProps {
  user: User;
  orders: Order[];
  products: Product[];
  reviews: Review[];
  setReviews: React.Dispatch<React.SetStateAction<Review[]>>;
  cart: CartItem[];
  onIncreaseQty: (productId: string) => void;
  onDecreaseQty: (productId: string) => void;
  onRemoveFromCart: (productId: string) => void;
  onCheckout: () => void;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

const OrdersView: React.FC<OrdersViewProps> = ({ user, orders, products, reviews, setReviews, onNotify }) => {
  const myOrders = orders
    .filter(order => order.buyerId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [openReviewOrderId, setOpenReviewOrderId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: number; comment: string; saving?: boolean }>>({});

  const updateDraft = (orderId: string, productId: string, patch: Partial<{ rating: number; comment: string; saving?: boolean }>) => {
    const key = `${orderId}:${productId}`;

    setReviewDrafts(prev => ({
      ...prev,
      [key]: {
        rating: prev[key]?.rating ?? 5,
        comment: prev[key]?.comment ?? '',
        saving: prev[key]?.saving ?? false,
        ...patch,
      },
    }));
  };

  const submitReview = async (orderId: string, productId: string) => {
    const key = `${orderId}:${productId}`;
    const draft = reviewDrafts[key] ?? { rating: 5, comment: '' };
    const alreadyReviewed = reviews.some(
      review =>
        review.userId === user.id &&
        review.orderId === orderId &&
        String(review.productId) === String(productId)
    );

    if (alreadyReviewed) {
      onNotify?.('Selle tellimuse tootele on arvustus juba lisatud.', 'error');
      return;
    }

    if (!draft.comment.trim()) {
      onNotify?.('Palun kirjuta arvustus.', 'error');
      return;
    }

    updateDraft(orderId, productId, { saving: true });

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        order_id: orderId,
        product_id: productId,
        user_id: user.id,
        rating: draft.rating,
        comment: draft.comment.trim(),
      })
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
      .single();

    if (error) {
      console.error(error);
      onNotify?.(error.message || 'Arvustuse salvestamine ebaõnnestus.', 'error');
      updateDraft(orderId, productId, { saving: false });
      return;
    }

    const profileData = data.profiles as any;
    const reviewerName = Array.isArray(profileData)
      ? profileData[0]?.full_name
      : profileData?.full_name;

    setReviews(prev => [
      {
        id: String(data.id),
        orderId: data.order_id ? String(data.order_id) : null,
        productId: String(data.product_id),
        userId: String(data.user_id),
        reviewerName: reviewerName || user.name || 'Kasutaja',
        rating: Number(data.rating ?? 0),
        comment: String(data.comment ?? ''),
        createdAt: String(data.created_at ?? ''),
        replies: [],
      },
      ...prev,
    ]);

    updateDraft(orderId, productId, { rating: 5, comment: '', saving: false });
    onNotify?.('Arvustus lisatud!', 'success');
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.NEW:
        return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Ootel</span>;
      case OrderStatus.CONFIRMED:
        return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Kinnitatud</span>;
      case OrderStatus.COMPLETED:
        return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Täidetud</span>;
      case OrderStatus.CANCELLED:
        return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Tühistatud</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Minu tellimused</h1>

      {myOrders.length === 0 ? (
        <div className="text-center py-24 bg-stone-50 rounded-3xl border border-stone-200 border-dashed">
          <i className="fa-solid fa-basket-shopping text-4xl text-stone-300 mb-4"></i>
          <p className="text-stone-500">Sul pole veel ühtegi tellimust.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {myOrders.map(order => {
            const sellerMapUrl = order.sellerLocation
              ? buildExternalMapUrl({
                  label: order.sellerLocation,
                  fallbackQuery: order.sellerLocation,
                })
              : null;
            return (
              <div key={order.id} className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-stone-100 flex flex-wrap justify-between items-center gap-4 bg-stone-50/50">
                  <div>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-widest mb-1">Tellimus #{order.id.slice(-6).toUpperCase()}</p>
                    <p className="text-sm text-stone-600">{new Date(order.createdAt).toLocaleDateString()} kl {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(order.status)}
                    <p className="text-xl font-bold text-emerald-700">{order.total.toFixed(2)}€</p>
                  </div>
                </div>

                <div className="p-6">
                  <div className="space-y-4">
                    {order.items.map((item, idx) => {
                      const product = products.find(p => p.id === item.productId);

                      return (
                        <div key={idx} className="flex justify-between items-center text-sm gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <img src={product?.image} className="w-10 h-10 rounded object-cover bg-stone-100" />
                            <div className="min-w-0">
                              <p className="font-bold text-stone-800 truncate">{item.title}</p>
                              <p className="text-xs text-stone-500">{item.qty} {product?.unit || 'tk'} x {item.price}€</p>
                            </div>
                          </div>
                          <p className="font-medium text-stone-900 shrink-0">{(item.qty * item.price).toFixed(2)}€</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-8 pt-6 border-t border-stone-100 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
                    <div className="space-y-4">
                      <div className={`transition-all duration-300 ${openReviewOrderId === order.id ? '-translate-y-1' : 'translate-y-0'}`}>
                        <p className="text-xs font-bold text-stone-400 uppercase mb-2">Müüja kontakt</p>
                        <div className="flex items-center gap-3">
                          <img src={`https://i.pravatar.cc/150?u=${order.sellerId}`} className="w-8 h-8 rounded-full" />
                          <div>
                            <span className="block font-bold text-stone-700">{order.sellerName || 'Müüja'}</span>
                            {sellerMapUrl && order.sellerLocation && (
                              <a
                                href={sellerMapUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-emerald-700 hover:text-emerald-800 underline decoration-transparent hover:decoration-current"
                              >
                                {order.sellerLocation}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {sellerMapUrl && order.sellerLocation && (
                        <div className="grid grid-cols-1 gap-3">
                          <a
                            href={sellerMapUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 hover:bg-emerald-100/70 transition-colors"
                          >
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2">Pealevõtmine</span>
                            <span className="block font-bold text-emerald-900">{order.sellerLocation}</span>
                            <span className="block text-xs text-emerald-700 mt-2">Ava kaardirakenduses</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {order.status === OrderStatus.COMPLETED && (
                      <button
                        onClick={() => setOpenReviewOrderId(openReviewOrderId === order.id ? null : order.id)}
                        className="bg-white border border-stone-200 text-stone-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors"
                      >
                        {openReviewOrderId === order.id ? 'Sulge' : 'Lisa arvustus'}
                      </button>
                    )}
                  </div>

                  <div className={`grid transition-all duration-300 ease-in-out ${openReviewOrderId === order.id ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                    <div className="overflow-hidden">
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-4">
                        {order.items.map((item, idx) => {
                          const product = products.find(p => p.id === item.productId);
                          const key = `${order.id}:${item.productId}`;
                          const draft = reviewDrafts[key] ?? { rating: 5, comment: '', saving: false };
                          const alreadyReviewed = reviews.some(
                            review =>
                              review.userId === user.id &&
                              review.orderId === order.id &&
                              String(review.productId) === String(item.productId)
                          );

                          return (
                            <div key={idx} className="bg-white rounded-2xl border border-stone-200 p-4">
                              <div className="flex items-center gap-3 mb-4">
                                <img src={product?.image} className="w-12 h-12 rounded-xl object-cover bg-stone-100" />
                                <div>
                                  <p className="font-bold text-stone-800">{item.title}</p>
                                  <p className="text-xs text-stone-500">
                                    {alreadyReviewed ? 'Selle tellimuse tootele on arvustus juba lisatud' : 'Lisa sellele tellimuse reale arvustus'}
                                  </p>
                                </div>
                              </div>

                              {alreadyReviewed ? (
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold border border-emerald-200">
                                  <i className="fa-solid fa-circle-check"></i>
                                  Arvustus lisatud
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1 mb-4">
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <button
                                        key={star}
                                        type="button"
                                        onClick={() => updateDraft(order.id, item.productId, { rating: star })}
                                        className="text-2xl leading-none transition-transform hover:scale-110"
                                      >
                                        {star <= draft.rating ? '★' : '☆'}
                                      </button>
                                    ))}
                                  </div>

                                  <textarea
                                    value={draft.comment}
                                    onChange={(e) => updateDraft(order.id, item.productId, { comment: e.target.value })}
                                    placeholder="Jaga oma kogemust selle tootega..."
                                    className="w-full min-h-[110px] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />

                                  <div className="mt-4">
                                    <button
                                      type="button"
                                      onClick={() => submitReview(order.id, item.productId)}
                                      disabled={draft.saving}
                                      className="bg-emerald-600 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                    >
                                      {draft.saving ? 'Salvestan...' : 'Postita arvustus'}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrdersView;
