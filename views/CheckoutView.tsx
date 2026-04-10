import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { User, Product, CartItem, Order, OrderStatus, ResolvedLocation } from '../types';
import { supabase } from '../supabaseClient';
import { buildExternalMapUrl, calculateDistanceKm, formatDistanceKm, geocodeLocation } from '../utils/location';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';

interface CheckoutViewProps {
  user: User | null;
  cart: CartItem[];
  products: Product[];
  onIncreaseQty: (productId: string) => void;
  onDecreaseQty: (productId: string) => void;
  onRemoveFromCart: (productId: string) => void;
  onComplete: (orders: Order[]) => void;
  onBack: () => void;
}

const getDistanceState = (distanceKm?: number | null) => {
  if (typeof distanceKm !== 'number') {
    return {
      containerClass: 'bg-stone-50 border-stone-100',
      iconClass: 'text-stone-400',
      textClass: 'text-stone-900',
      noteClass: 'text-stone-500',
      title: 'Ostja asukoht on valikuline',
      note: 'Lisa oma asukoht ainult siis, kui soovid müüja kaugust hinnata.',
    };
  }

  if (distanceKm <= 20) {
    return {
      containerClass: 'bg-emerald-50 border-emerald-100',
      iconClass: 'text-emerald-500',
      textClass: 'text-emerald-900',
      noteClass: 'text-emerald-700',
      title: `Müüja on umbes ${formatDistanceKm(distanceKm)} kaugusel`,
      note: 'Pealevõtmine peaks olema üsna mugav.',
    };
  }

  if (distanceKm <= 50) {
    return {
      containerClass: 'bg-amber-50 border-amber-100',
      iconClass: 'text-amber-500',
      textClass: 'text-amber-900',
      noteClass: 'text-amber-700',
      title: `Arvesta umbes ${formatDistanceKm(distanceKm)} sõiduga`,
      note: 'See müüja ei ole väga lähedal, seega kontrolli pealevõtmise plaan üle.',
    };
  }

  return {
    containerClass: 'bg-red-50 border-red-100',
    iconClass: 'text-red-500',
    textClass: 'text-red-900',
    noteClass: 'text-red-700',
    title: `Müüja asub umbes ${formatDistanceKm(distanceKm)} kaugusel`,
    note: 'Vahemaa on pikk. Soovitame enne kinnitamist üle mõelda, kas pealevõtmine sobib.',
  };
};

const CheckoutView: React.FC<CheckoutViewProps> = ({
  user,
  cart,
  products,
  onIncreaseQty,
  onDecreaseQty,
  onRemoveFromCart,
  onComplete,
  onBack,
}) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.location || '',
    notes: '',
  });
  const [buyerResolvedLocation, setBuyerResolvedLocation] = useState<ResolvedLocation | null>(null);
  const [sellerResolvedLocations, setSellerResolvedLocations] = useState<Record<string, ResolvedLocation | null>>({});
  const [isResolvingDistances, setIsResolvingDistances] = useState(false);
  const [distanceError, setDistanceError] = useState('');

  const deferredAddress = useDeferredValue(formData.address);

  const cartItemsWithDetails = useMemo(() => {
    return cart
      .map(item => {
        const product = products.find(prod => prod.id === item.productId);
        return product ? { ...item, ...product } : null;
      })
      .filter((item): item is CartItem & Product => item !== null);
  }, [cart, products]);

  const itemsBySeller = useMemo(() => {
    const groups: Record<string, (CartItem & Product)[]> = {};

    for (const item of cartItemsWithDetails) {
      if (!groups[item.sellerId]) {
        groups[item.sellerId] = [];
      }

      groups[item.sellerId].push(item);
    }

    return groups;
  }, [cartItemsWithDetails]);

  useEffect(() => {
    let isCancelled = false;
    const sellerEntries = Object.entries(itemsBySeller).filter(([, sellerItems]) => sellerItems[0]?.sellerLocation?.trim());
    const trimmedAddress = deferredAddress.trim();

    if (!trimmedAddress || sellerEntries.length === 0) {
      setBuyerResolvedLocation(null);
      setDistanceError('');
      setIsResolvingDistances(false);
      return () => {
        isCancelled = true;
      };
    }

    const resolveLocations = async () => {
      setIsResolvingDistances(true);
      setDistanceError('');

      try {
        const [buyerLocation, sellerLocations] = await Promise.all([
          geocodeLocation(trimmedAddress),
          Promise.all(
            sellerEntries.map(async ([sellerId, sellerItems]) => {
              const sellerLocation = sellerItems[0]?.sellerLocation?.trim() || '';
              const resolved = sellerLocation ? await geocodeLocation(sellerLocation) : null;

              return [sellerId, resolved] as const;
            })
          ),
        ]);

        if (isCancelled) {
          return;
        }

        setBuyerResolvedLocation(buyerLocation);
        setSellerResolvedLocations(prev => {
          const next = { ...prev };

          for (const [sellerId, resolved] of sellerLocations) {
            next[sellerId] = resolved;
          }

          return next;
        });

        if (!buyerLocation) {
          setDistanceError('Sinu sisestatud asukohta ei õnnestunud kaardil leida. Kontrolli aadressi täpsust.');
        }
      } catch (error: any) {
        if (!isCancelled) {
          setDistanceError(error?.message || 'Asukohapõhine kauguse arvutus ebaõnnestus.');
        }
      } finally {
        if (!isCancelled) {
          setIsResolvingDistances(false);
        }
      }
    };

    resolveLocations();

    return () => {
      isCancelled = true;
    };
  }, [deferredAddress, itemsBySeller]);

  const distanceBySellerId = useMemo(() => {
    if (!buyerResolvedLocation) {
      return {} as Record<string, number>;
    }

    const distances: Record<string, number> = {};

    for (const sellerId of Object.keys(itemsBySeller)) {
      const sellerLocation = sellerResolvedLocations[sellerId];

      if (!sellerLocation) {
        continue;
      }

      distances[sellerId] = calculateDistanceKm(buyerResolvedLocation, sellerLocation);
    }

    return distances;
  }, [buyerResolvedLocation, itemsBySeller, sellerResolvedLocations]);

  const total = cartItemsWithDetails.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cartItemsWithDetails.length === 0) {
      alert('Sinu ostukorv on tühi');
      return;
    }

    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      alert('Palun täida kõik tärniga märgitud kohustuslikud väljad.');
      return;
    }

    try {
      const sellers = Object.keys(itemsBySeller);
      const createdOrders: Order[] = [];
      const buyerName = formData.name.trim();
      const buyerEmail = formData.email.trim();
      const buyerPhone = formData.phone.trim();
      const deliveryAddress = formData.address.trim();
      const notes = formData.notes.trim();

      for (const sellerId of sellers) {
        const sellerItems = itemsBySeller[sellerId];
        const totalAmount = sellerItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);

        const { data: orderRow, error: orderError } = await supabase
          .from('orders')
          .insert({
            buyer_id: user?.id ?? null,
            seller_id: sellerId,
            total: totalAmount,
            status: OrderStatus.NEW,
            buyer_name: buyerName,
            buyer_email: buyerEmail,
            buyer_phone: buyerPhone,
            delivery_address: deliveryAddress || null,
            notes: notes || null,
          })
          .select('*')
          .single();

        if (orderError) throw orderError;

        const itemsPayload = sellerItems.map(item => ({
          order_id: orderRow.id,
          product_id: item.productId,
          seller_id: item.sellerId,
          quantity: item.quantity,
          unit_price: item.price,
        }));

        const { error: itemError } = await supabase
          .from('order_items')
          .insert(itemsPayload);

        if (itemError) {
          await supabase.from('orders').delete().eq('id', orderRow.id);
          throw itemError;
        }

        createdOrders.push({
          id: String(orderRow.id),
          buyerId: user?.id ?? '',
          buyerName,
          buyerPhone,
          buyerEmail,
          sellerId,
          sellerName: sellerItems[0].sellerName,
          sellerLocation: sellerItems[0].sellerLocation,
          status: OrderStatus.NEW,
          total: totalAmount,
          items: sellerItems.map(item => ({
            productId: item.productId,
            title: item.title,
            qty: item.quantity,
            price: item.price,
          })),
          createdAt: String(orderRow.created_at ?? ''),
          deliveryAddress,
          notes,
        });
      }

      onComplete(createdOrders);
    } catch (err: any) {
      alert(err?.message || 'Tellimuse salvestamine ebaõnnestus');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <button
        onClick={onBack}
        className="mb-8 flex items-center gap-2 text-emerald-600 font-bold hover:translate-x-1 transition-transform"
      >
        <i className="fa-solid fa-arrow-left"></i> Tagasi kataloogi
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(420px,1fr)] gap-12 items-start">
        <div className="order-1 lg:order-2 space-y-8">
          <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-stone-100 shadow-sm lg:sticky lg:top-24">
            <h3 className="text-lg font-bold text-stone-900 mb-6 border-b border-stone-50 pb-4">Ostukorvi kokkuvõte</h3>

            {distanceError && (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {distanceError}
              </div>
            )}

            {isResolvingDistances && (
              <div className="mb-6 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 flex items-center gap-2">
                <i className="fa-solid fa-spinner fa-spin text-emerald-600"></i>
                Arvutame müüjate kaugust sinu asukohast...
              </div>
            )}

            <div className="space-y-6 mb-8">
              {Object.keys(itemsBySeller).map(sellerId => {
                const sellerItems = itemsBySeller[sellerId];
                const sellerLocation = sellerItems[0].sellerLocation || 'Teadmata';
                const distance = distanceBySellerId[sellerId];
                const distanceState = getDistanceState(distance);
                const mapUrl = buildExternalMapUrl({
                  coordinates: sellerResolvedLocations[sellerId],
                  label: sellerLocation,
                  fallbackQuery: sellerLocation,
                });

                return (
                  <div key={sellerId} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        Müüja: {sellerItems[0].sellerName}
                      </p>
                      {typeof distance === 'number' && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-700">
                          <i className="fa-solid fa-route text-emerald-600"></i>
                          {formatDistanceKm(distance)}
                        </span>
                      )}
                    </div>

                    <div className={`p-4 rounded-2xl border ${distanceState.containerClass}`}>
                      <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">Pealevõtmise asukoht:</p>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <i className={`fa-solid fa-location-dot ${distanceState.iconClass}`}></i>
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`text-sm font-bold underline decoration-transparent hover:decoration-current transition-all break-words ${distanceState.textClass}`}
                            >
                              {sellerLocation}
                            </a>
                          </div>
                          <p className={`text-[11px] mt-2 ${distanceState.noteClass}`}>
                            {distanceState.title}
                          </p>
                          <p className={`text-[11px] mt-1 ${distanceState.noteClass}`}>
                            {distanceState.note}
                          </p>
                        </div>
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-[11px] font-bold text-stone-700 border border-white/70 hover:bg-white"
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square"></i>
                          Ava kaart
                        </a>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {sellerItems.map(item => {
                        const minQty = Math.max(1, Number(item.minOrderQty ?? 1));
                        const maxQty = Number(item.stockQty ?? 0) > 0 ? Number(item.stockQty ?? 0) : Number.MAX_SAFE_INTEGER;
                        const canDecrease = item.quantity > minQty;
                        const canIncrease = item.quantity < maxQty;

                        return (
                          <div key={item.productId} className="rounded-2xl border border-stone-100 bg-white p-3">
                            <div className="flex items-start gap-3">
                              <img src={item.image} className="w-12 h-12 rounded-xl object-cover bg-stone-100" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-stone-900 truncate">{item.title}</p>
                                    <p className="text-[11px] text-stone-500 mt-1">
                                      {Number(item.price ?? 0).toFixed(2)}€ / {item.unit}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onRemoveFromCart(item.productId)}
                                    className="text-[10px] font-bold text-red-500 whitespace-nowrap"
                                  >
                                    Eemalda
                                  </button>
                                </div>

                                <div className="mt-3 space-y-3">
                                  <div className="inline-flex w-fit items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
                                    <button
                                      type="button"
                                      onClick={() => onDecreaseQty(item.productId)}
                                      disabled={!canDecrease}
                                      className="w-7 h-7 rounded-lg bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <i className="fa-solid fa-minus text-[10px]"></i>
                                    </button>
                                    <span className="min-w-[22px] text-center text-sm font-black text-stone-900">
                                      {item.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onIncreaseQty(item.productId)}
                                      disabled={!canIncrease}
                                      className="w-7 h-7 rounded-lg bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <i className="fa-solid fa-plus text-[10px]"></i>
                                    </button>
                                  </div>

                                  <div className="flex items-end justify-between gap-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                                      Minimaalne tellimus: {minQty} {item.unit}
                                    </p>
                                    <span className="shrink-0 text-base font-black text-stone-900">
                                      {(item.price * item.quantity).toFixed(2)}€
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 border-t border-stone-100 flex justify-between items-center gap-4">
              <span className="text-sm font-bold text-stone-400 uppercase">Kokku tasuda:</span>
              <span className="shrink-0 text-3xl font-black text-emerald-800">{total.toFixed(2)}€</span>
            </div>
          </div>
        </div>

        <div className="order-2 lg:order-1 space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-stone-100 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900 mb-8 flex items-center gap-3">
              <i className="fa-solid fa-truck-fast text-emerald-600"></i> Tellimuse andmed
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm font-bold text-stone-900">
                Tärniga (*) märgitud väljad on kohustuslikud.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Täisnimi <span className="text-emerald-600">*</span></label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">E-post <span className="text-emerald-600">*</span></label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Telefon <span className="text-emerald-600">*</span></label>
                  <input
                    required
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="+372 ..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Sinu asukoht (valikuline)</label>
                  <LocationAutocompleteInput
                    type="text"
                    value={formData.address}
                    onChange={(value) => {
                      setFormData({ ...formData, address: value });
                      setDistanceError('');
                    }}
                    onSelectLocation={(location) => {
                      setFormData({ ...formData, address: location.address || location.label });
                      setBuyerResolvedLocation(location);
                      setDistanceError('');
                    }}
                    placeholder="Sisesta linn, aadress või piirkond"
                    autoComplete="off"
                    inputClassName="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    dropdownClassName="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                    suggestionClassName="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-stone-100 last:border-b-0"
                    emptyStateClassName="px-4 py-3 text-sm text-stone-500 bg-white"
                  />
                  {buyerResolvedLocation && (
                    <p className="text-xs text-emerald-700 px-1">
                      Leitud asukoht: {buyerResolvedLocation.label}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Lisamärkused müüjale (valikuline)</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  placeholder="Nt: tulen ise järgi neljapäeval kl 17"
                />
              </div>

              <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex gap-4">
                <i className="fa-solid fa-circle-info text-amber-500 text-xl mt-1"></i>
                <div className="text-sm text-amber-900">
                  <p className="font-bold">Oluline info!</p>
                  <p className="opacity-80">
                    Tehingud ja kauba kättesaamine toimuvad otse müüjaga. Platvorm ei paku hetkel automaatset tarnet.
                  </p>
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
      </div>
    </div>
  );
};

export default CheckoutView;
