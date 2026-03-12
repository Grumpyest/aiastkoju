
import React, { useState, useMemo, useEffect } from 'react';
import { Product, User, Review, UserRole, ReviewReply } from '../types';
import { supabase } from '../supabaseClient';

interface ProductDetailProps {
  product: Product;
  user: User | null;
  reviews: Review[];
  setReviews: React.Dispatch<React.SetStateAction<Review[]>>;
  onAddToCart: (id: string, qty: number) => void;
  onBuyNow: (id: string, qty: number) => void;
  onBack: () => void;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

const ProductDetail: React.FC<ProductDetailProps> = ({ product, user, reviews, setReviews, onAddToCart, onBuyNow, onBack, onNotify }) => {
  const [quantity, setQuantity] = useState<number>(Number(product.minOrderQty ?? 1));
  
const PLACEHOLDER = "/placeholder.png";

  const allImages = useMemo(
  () => [product.image, ...(product.images || [])].filter(Boolean) as string[],
  [product.image, product.images]
);
const [mainImage, setMainImage] = useState(allImages[0] ?? PLACEHOLDER);

useEffect(() => {
  setMainImage(allImages[0] ?? PLACEHOLDER);
}, [allImages]);

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewStars, setNewReviewStars] = useState(5);
  const [replyingToReviewId, setReplyingToReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const productReviews = useMemo(
  () => reviews.filter(r => String(r.productId) === String(product.id)),
  [reviews, product.id]
);

  const averageRating = useMemo(() => {
  if (productReviews.length === 0) return '0.0';
  const sum = productReviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
  return (sum / productReviews.length).toFixed(1);
}, [productReviews]);

const handleAddReview = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!user) {
    onNotify?.('Palun logi sisse!', 'error');
    return;
  }

  if (!newReviewComment.trim()) {
    onNotify?.('Kirjuta arvustus.', 'error');
    return;
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      product_id: product.id,
      user_id: user.id,
      rating: newReviewStars,
      comment: newReviewComment.trim(),
    })
    .select()
    .single();

  if (error) {
    onNotify?.(error.message, 'error');
    return;
  }

  const savedReview = {
    id: String(data.id),
    productId: String(data.product_id),
    userId: String(data.user_id),
    reviewerName: user.name,
    rating: Number(data.rating ?? 0),
    comment: String(data.comment ?? ''),
    createdAt: String(data.created_at ?? ''),
    replies: [],
  };

  setReviews(prev => [savedReview, ...prev]);
  setNewReviewComment('');
  setNewReviewStars(5);
  onNotify?.('Arvustus postitatud!', 'success');
};

 const handleReply = async (reviewId: string) => {
  if (!user || !replyText.trim()) return;

  const { data, error } = await supabase
    .from('review_replies')
    .insert({
      review_id: reviewId,
      user_id: user.id,
      user_name: user.name,
      text: replyText.trim(),
      role: user.role,
    })
    .select()
    .single();

  if (error) {
    onNotify?.(error.message, 'error');
    return;
  }

  const newReply: ReviewReply = {
    id: String(data.id),
    userId: String(data.user_id),
    userName: String(data.user_name),
    text: String(data.text),
    role: data.role,
    createdAt: String(data.created_at ?? ''),
  };

  setReviews(prev =>
    prev.map(r =>
      r.id === reviewId
        ? { ...r, replies: [...(r.replies || []), newReply] }
        : r
    )
  );

  setReplyingToReviewId(null);
  setReplyText('');
  onNotify?.('Vastus lisatud.', 'success');
};

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-16">
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-emerald-600 font-bold hover:translate-x-1 transition-transform">
        <i className="fa-solid fa-arrow-left"></i> Tagasi kataloogi
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        <div className="space-y-4">
          <div className="aspect-square sm:aspect-video rounded-[40px] overflow-hidden shadow-2xl bg-stone-100 cursor-zoom-in group relative border-4 border-white" onClick={() => setIsGalleryOpen(true)}>
            <img src={mainImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <i className="fa-solid fa-expand text-white text-3xl"></i>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {allImages.map((img, i) => (
              <div key={i} onClick={() => setMainImage(img)} className={`w-20 h-20 shrink-0 rounded-xl overflow-hidden cursor-pointer transition-all border-2 ${mainImage === img ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-transparent opacity-60'}`}>
                <img src={img} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">{product.category}</span>
            <div className="flex items-center text-yellow-400 text-sm font-bold">
               <i className="fa-solid fa-star"></i>
               <span className="ml-1.5 text-stone-900">{averageRating}</span>
               <span className="ml-1 text-stone-400 font-medium">({productReviews.length})</span>
            </div>
          </div>
          
          <h1 className="text-4xl font-black text-stone-900 mb-4 tracking-tight leading-tight">{product.title}</h1>
          <p className="text-3xl text-emerald-700 font-black mb-8">{Number(product.price ?? 0).toFixed(2)}€ <span className="text-stone-400 text-sm font-medium">/ {product.unit ?? ''}</span></p>
          <p className="text-stone-600 leading-relaxed text-lg mb-10">{product.description ?? ''}</p>

          <div className="bg-white rounded-[40px] p-8 border border-stone-100 shadow-xl shadow-stone-200/50">
            <div className="flex items-center justify-between mb-8">
              <span className="text-stone-900 font-black text-lg">Kogus ({product.unit ?? ''})</span>
              <div className="flex items-center gap-6 bg-stone-50 p-2 rounded-2xl border border-stone-100">
                <button onClick={() => setQuantity(q => Math.max(Number(product.minOrderQty ?? 1), (q ?? 0) - 1))} className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center hover:bg-emerald-50 transition-all active:scale-90"><i className="fa-solid fa-minus"></i></button>
                <span className="text-xl font-black w-8 text-center">{quantity}</span>
                <button onClick={() => setQuantity(q => Math.min(Number(product.stockQty ?? 999999), (q ?? 0) + 1))} className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center hover:bg-emerald-50 transition-all active:scale-90"><i className="fa-solid fa-plus"></i></button>
              </div>
            </div>
            
            <div className="flex gap-4">
              <button onClick={() => { onAddToCart(product.id, quantity); }} className="flex-1 border-2 border-emerald-600 text-emerald-600 py-4 rounded-2xl font-black hover:bg-emerald-50 transition-all active:scale-95 flex items-center justify-center gap-3"><i className="fa-solid fa-cart-shopping"></i> Lisa korvi</button>
              <button onClick={() => onBuyNow(product.id, quantity)} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95">Osta kohe</button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto border-t border-stone-200 pt-16 pb-20">
        <h2 className="text-3xl font-black text-stone-900 mb-8">Arvustused ja vastused</h2>

        {user ? (
          <form onSubmit={handleAddReview} className="bg-white rounded-[32px] p-8 border border-stone-100 shadow-sm mb-12 space-y-4">
            <div className="flex gap-2 mb-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} type="button" onClick={() => setNewReviewStars(s)} className={`text-2xl transition-all ${s <= newReviewStars ? 'text-yellow-400' : 'text-stone-200'}`}><i className="fa-solid fa-star"></i></button>
              ))}
            </div>
            <textarea required placeholder="Jaga oma kogemust selle tootega..." className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]" value={newReviewComment} onChange={e => setNewReviewComment(e.target.value)} />
            <button type="submit" className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all">Postita arvustus</button>
          </form>
        ) : <p className="text-center text-stone-400 py-8 italic bg-stone-50 rounded-2xl mb-12">Logi sisse, et jätta arvustus</p>}

        <div className="space-y-12">
          {productReviews.length === 0 ? <p className="text-stone-400 text-center py-10">Sellel tootel pole veel arvustusi.</p> : productReviews.map(review => (
            <div key={review.id} className="space-y-6">
              <div className="flex gap-4">
                <img src={`https://i.pravatar.cc/150?u=${review.userId}`} className="w-14 h-14 rounded-2xl border-2 border-white shadow-md shrink-0" />
                <div className="flex-grow">
                  <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm relative">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-black text-stone-900">{review.reviewerName ?? 'Kasutaja'}</p>
                      <div className="flex text-yellow-400 text-[10px] gap-0.5">
                        {[1,2,3,4,5].map(s => (
                        <i
                          key={s}
                          className={`fa-solid fa-star ${s <= Number(review.rating || 0) ? 'text-yellow-400' : 'text-stone-100'}`}
                        ></i>
                        ))}
                      </div>
                    </div>
                    <p className="text-stone-600 text-lg leading-relaxed font-medium">"{review.comment}"</p>
                    {user && (
                      <button 
                        onClick={() => setReplyingToReviewId(replyingToReviewId === review.id ? null : review.id)} 
                        className="mt-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline"
                      >
                        <i className="fa-solid fa-reply"></i> Vasta
                      </button>
                    )}
                  </div>

                  {/* Vastuste osa */}
                  <div className="mt-6 ml-10 space-y-4">
                    {review.replies?.map(rep => (
                      <div key={rep.id} className="flex gap-3 animate-fade-in">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm ${rep.role === UserRole.GARDENER ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                           <i className={`fa-solid ${rep.role === UserRole.GARDENER ? 'fa-leaf' : 'fa-user'} text-[10px]`}></i>
                        </div>
                        <div className={`p-4 rounded-2xl border flex-grow ${rep.role === UserRole.GARDENER ? 'bg-emerald-50 border-emerald-100' : 'bg-stone-50 border-stone-100'}`}>
                          <p className={`text-[10px] font-black uppercase mb-1 ${rep.role === UserRole.GARDENER ? 'text-emerald-700' : 'text-stone-500'}`}>
                            {rep.userName} {rep.role === UserRole.GARDENER && '• Aednik'}
                          </p>
                          <p className="text-stone-700 text-sm italic font-medium">"{rep.text}"</p>
                        </div>
                      </div>
                    ))}

                    {replyingToReviewId === review.id && (
                      <div className="animate-fade-in mt-4 flex gap-2">
                        <input 
                          type="text" 
                          placeholder={`Vasta kui ${user?.role === UserRole.GARDENER ? 'Aednik' : 'Ostja'}...`} 
                          className="flex-grow p-4 bg-white border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" 
                          value={replyText} 
                          onChange={e => setReplyText(e.target.value)} 
                        />
                        <button 
                          onClick={() => handleReply(review.id)} 
                          className="bg-emerald-600 text-white px-6 rounded-xl font-bold text-sm"
                        >
                          Saada
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {isGalleryOpen && (
        <div 
          className="fixed inset-0 z-[200] bg-stone-950/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setIsGalleryOpen(false)}
        >
           <button 
             onClick={(e) => { e.stopPropagation(); setIsGalleryOpen(false); }} 
             className="absolute top-8 right-8 text-white/40 hover:text-white text-4xl transition-all z-[210]"
           >
             <i className="fa-solid fa-xmark"></i>
           </button>
           <img 
             src={mainImage} 
             onClick={(e) => e.stopPropagation()} 
             className="max-w-full max-h-[80vh] object-contain rounded-3xl shadow-2xl cursor-default" 
           />
        </div>
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default ProductDetail;
