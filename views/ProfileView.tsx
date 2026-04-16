
import React, { useEffect, useState, useRef } from 'react';
import { User, UserRole } from '../types';
import { supabase } from '../supabaseClient';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';
import GardenerSubscriptionCheckoutModal from '../components/GardenerSubscriptionCheckoutModal';
import {
  createSellerSubscriptionSession,
  getPaymentProfile,
  maskLast4,
  PaymentProfileSummary,
  redirectToPaymentFunction,
} from '../utils/payments';

interface ProfileViewProps {
  user: User;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setCurrentView: (view: any) => void;
  t: any;
  onBack: () => void;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ user, setUser, setCurrentView, t, onBack, onNotify }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    location: user.location || '',
    avatar: user.avatar || '',
  });
  const [paymentProfile, setPaymentProfile] = useState<PaymentProfileSummary | null>(null);
  const [paymentAction, setPaymentAction] = useState<string | null>(null);
  const [sellerSubscriptionCheckout, setSellerSubscriptionCheckout] = useState<{
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  const [isSellerSubscriptionChoiceOpen, setIsSellerSubscriptionChoiceOpen] = useState(false);

const avatarInputRef = useRef<HTMLInputElement>(null);
const [isAvatarUploading, setIsAvatarUploading] = useState(false);

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

useEffect(() => {
  let isCancelled = false;

  const loadPaymentProfile = async () => {
    try {
      const profile = await getPaymentProfile();

      if (!isCancelled) {
        setPaymentProfile(profile);

        if (['active', 'trialing'].includes(String(profile.subscription?.status)) && user.role !== UserRole.GARDENER) {
          setUser(prev => prev ? { ...prev, role: UserRole.GARDENER } : prev);
        }
      }
    } catch (error) {
      if (!isCancelled) {
        console.warn('Payment profile load failed', error);
      }
    }
  };

  loadPaymentProfile();

  return () => {
    isCancelled = true;
  };
}, [setUser, user.id, user.role]);

const startPaymentRedirect = async (action: string, functionName: string, body: Record<string, unknown> = {}) => {
  try {
    setPaymentAction(action);
    await redirectToPaymentFunction(functionName, body);
  } catch (error: any) {
    onNotify?.(error?.message || 'Makse tegevust ei saanud alustada.', 'error');
    setPaymentAction(null);
  }
};

const startSellerSubscriptionCheckout = async () => {
  try {
    setPaymentAction('seller-subscription');
    const session = await createSellerSubscriptionSession({
      siteUrl: window.location.origin,
      useSavedCard: false,
    });

    if (session.clientSecret && session.publishableKey) {
      setSellerSubscriptionCheckout({
        clientSecret: session.clientSecret,
        publishableKey: session.publishableKey,
      });
      return;
    }

    throw new Error('Aedniku kuutasu maksevaadet ei saadud avada.');
  } catch (error: any) {
    onNotify?.(error?.message || 'Aedniku kuutasu maksevaadet ei saanud avada.', 'error');
    setPaymentAction(null);
  }
};

const startSellerSubscriptionWithSavedCard = async () => {
  try {
    setPaymentAction('seller-subscription-saved-card');
    const result = await createSellerSubscriptionSession({
      useSavedCard: true,
    });

    if (!result.success) {
      throw new Error('Salvestatud kaardiga kuutasu aktiveerimine ebaõnnestus.');
    }

    setIsSellerSubscriptionChoiceOpen(false);
    setSellerSubscriptionCheckout(null);
    setUser(prev => prev ? { ...prev, role: UserRole.GARDENER } : prev);
    onNotify?.('Aedniku staatus aktiveeritud salvestatud kaardiga.', 'success');
  } catch (error: any) {
    onNotify?.(error?.message || 'Salvestatud kaardiga makse ebaõnnestus.', 'error');
  } finally {
    setPaymentAction(null);
  }
};

const uploadAvatarToStorage = async (file: File, path: string) => {
  const { error } = await supabase.storage.from('product-images').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
};

const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  // preview kohe
  const preview = URL.createObjectURL(file);
  setFormData(prev => ({ ...prev, avatar: preview }));

  try {
    setIsAvatarUploading(true);

    const path = `${user.id}/avatar/avatar-${Date.now()}-${safeName(file.name)}`;
    const url = await uploadAvatarToStorage(file, path);

    // salvesta DB-sse
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', user.id);

    if (error) throw error;

    // uuenda UI user state
    setUser(prev => (prev ? { ...prev, avatar: url } : prev));
    setFormData(prev => ({ ...prev, avatar: url }));

    onNotify?.('Profiilipilt uuendatud!', 'success');
  } catch (err: any) {
    onNotify?.(err?.message || 'Profiilipildi uuendamine ebaõnnestus', 'error');
  } finally {
    setIsAvatarUploading(false);
    e.target.value = ''; // lubab sama faili uuesti valida
  }
};


  const handleSave = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const nextName = formData.name.trim();
    const nextEmail = formData.email.trim().toLowerCase();
    const nextPhone = formData.phone.trim();
    const nextLocation = formData.location.trim();
    const emailChanged = nextEmail !== user.email.trim().toLowerCase();

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: nextName,
        email: nextEmail,
        phone: nextPhone || null,
        location: nextLocation || null,
      })
      .eq('id', user.id);

    if (error) throw error;

    const { error: metadataError } = await supabase.auth.updateUser({
      ...(emailChanged ? { email: nextEmail } : {}),
      data: {
        full_name: nextName,
        email: nextEmail,
        phone: nextPhone || null,
        location: nextLocation || null,
      },
    });

    if (metadataError) {
      console.warn('Auth profile update failed', metadataError);
    }

    setUser({
      ...user,
      name: nextName,
      email: nextEmail,
      phone: nextPhone || undefined,
      location: nextLocation || undefined,
      avatar: formData.avatar || undefined,
    });

    onNotify?.(
      emailChanged
        ? 'Profiil uuendatud. Kui Supabase küsib kinnitust, kinnita uus e-post oma postkastis.'
        : 'Profiil edukalt uuendatud!',
      'success'
    );
  } catch (err: any) {
    onNotify?.(err?.message || 'Profiili salvestamine ebaõnnestus', 'error');
  }
};

 const toggleGardenerRole = async () => {
  try {
    if (user.role === UserRole.GARDENER) {
      const ok = confirm(
        'Kas soovid tõesti aedniku staatusest loobuda? Sinu kuutasu lõpetatakse ja tooted ei ole enam avalikult nähtavad.'
      );
      if (!ok) return;

      setPaymentAction('cancel-subscription');
      const { error } = await supabase.functions.invoke('payments-cancel-seller-subscription');

      if (error) throw error;

      setPaymentAction(null);

      setUser({ ...user, role: UserRole.BUYER });
      onNotify?.('Aedniku staatus ja kuutasu on lõpetatud.', 'success');
      return;
    }

    // kui ostja -> müüjaks
    const nextPhone = formData.phone.trim();
    const nextLocation = formData.location.trim();

    if (!nextPhone || !nextLocation) {
      onNotify?.(
        'Aedniku staatuse aktiveerimiseks pead esmalt täitma telefoni ja asukoha!',
        'error'
      );
      return;
    }

    const ok = confirm(
      'Soovid hakata Aednikuks? Aedniku staatus maksab 1€/kuu ja makse toimub Stripe kaudu.'
    );
    if (!ok) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        phone: nextPhone,
        location: nextLocation,
      })
      .eq('id', user.id);

    if (error) throw error;

    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        phone: nextPhone,
        location: nextLocation,
      },
    });

    if (metadataError) {
      console.warn('Auth metadata location update failed', metadataError);
    }

    setUser({
      ...user,
      phone: nextPhone,
      location: nextLocation,
    });

    if (paymentProfile?.buyerCard?.last4) {
      setPaymentAction(null);
      setIsSellerSubscriptionChoiceOpen(true);
      return;
    }

    await startSellerSubscriptionCheckout();
  } catch (err: any) {
    setPaymentAction(null);
    onNotify?.(err?.message || 'Rolli vahetus ebaõnnestus', 'error');
  }
};

  const handleLogout = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    localStorage.removeItem('user');
    setUser(null);
    setCurrentView('home');
    if (onNotify) onNotify('Välja logitud.', 'success');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {isSellerSubscriptionChoiceOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-stone-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
                  Aedniku kuutasu
                </p>
                <h2 className="text-2xl font-black text-stone-950">Vali makseviis</h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  Kuutasu on 1€/kuu. Võid kasutada salvestatud kaarti või lisada uue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSellerSubscriptionChoiceOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
                aria-label="Sulge maksevalik"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Salvestatud kaart
              </p>
              <p className="text-lg font-black text-stone-950">
                {paymentProfile?.buyerCard?.brand || 'kaart'} {maskLast4(paymentProfile?.buyerCard?.last4)}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {paymentProfile?.buyerCard?.expMonth}/{paymentProfile?.buyerCard?.expYear}
              </p>
              <button
                type="button"
                onClick={startSellerSubscriptionWithSavedCard}
                disabled={paymentAction === 'seller-subscription-saved-card'}
                className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-black text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentAction === 'seller-subscription-saved-card'
                  ? 'Aktiveerime...'
                  : 'Kasuta olemasolevat kaarti'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsSellerSubscriptionChoiceOpen(false);
                startSellerSubscriptionCheckout();
              }}
              disabled={paymentAction === 'seller-subscription'}
              className="mt-4 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm font-black text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Lisa uus kaart
            </button>
          </div>
        </div>
      )}

      {sellerSubscriptionCheckout && (
        <GardenerSubscriptionCheckoutModal
          clientSecret={sellerSubscriptionCheckout.clientSecret}
          publishableKey={sellerSubscriptionCheckout.publishableKey}
          onClose={() => {
            setSellerSubscriptionCheckout(null);
            setPaymentAction(null);
          }}
        />
      )}

      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-emerald-600 font-bold hover:translate-x-1 transition-transform">
        <i className="fa-solid fa-arrow-left"></i> {t.nav.home}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm text-center">
             <div className="relative w-32 h-32 mx-auto mb-6 group">
  <button
    type="button"
    onClick={() => avatarInputRef.current?.click()}
    className="relative w-32 h-32 rounded-full overflow-hidden ring-4 ring-stone-50 block"
    title="Muuda profiilipilti"
    disabled={isAvatarUploading}
  >
    <img
      src={formData.avatar || `https://i.pravatar.cc/150?u=${user.id}`}
      className={`w-full h-full object-cover transition duration-200 ${
        isAvatarUploading ? 'opacity-70' : 'group-hover:blur-[2px]'
      }`}
    />

    {/* Hover overlay */}
    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
      <div className="bg-black/55 text-white px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-2">
        <i className="fa-solid fa-pen"></i>
        MUUDA
      </div>
    </div>

    {/* Upload overlay */}
    {isAvatarUploading && (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white/90 text-stone-700 px-3 py-2 rounded-xl text-[10px] font-black">
          Laen üles...
        </div>
      </div>
    )}
  </button>

  <input
    ref={avatarInputRef}
    type="file"
    className="hidden"
    accept="image/*"
    onChange={handleAvatarPick}
  />
</div>
             <h2 className="text-xl font-bold text-stone-900">{formData.name}</h2>
             <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-1">
               {user.role === UserRole.GARDENER ? 'Aednik' : user.role === UserRole.ADMIN ? 'Admin' : 'Ostja'}
             </p>
          </div>

          <div className={`p-8 rounded-3xl shadow-xl relative overflow-hidden group transition-all ${user.role === UserRole.GARDENER ? 'bg-stone-800 text-white' : 'bg-emerald-900 text-white'}`}>
             <h3 className="text-lg font-bold mb-2 relative z-10">{user.role === UserRole.GARDENER ? 'Aedniku staatus: Aktiivne' : 'Hakka aednikuks!'}</h3>
             <p className="text-xs opacity-70 mb-6 relative z-10">
               {user.role === UserRole.GARDENER ? 'Sinu tellimus on aktiivne (1€/kuu). Halda tooteid töölaual.' : 'Müü oma aia saadusi teistele mugavalt vaid 1€ kuutasu eest.'}
             </p>
             <button 
              onClick={toggleGardenerRole} 
              disabled={paymentAction === 'seller-subscription' || paymentAction === 'cancel-subscription'}
              className={`w-full py-3 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${user.role === UserRole.GARDENER ? 'bg-red-500 hover:bg-red-600' : 'bg-white text-emerald-900 hover:bg-emerald-50'}`}
             >
               {paymentAction === 'seller-subscription'
                 ? 'Avame Stripe makset...'
                 : paymentAction === 'cancel-subscription'
                 ? 'Lõpetame kuutasu...'
                 : user.role === UserRole.GARDENER ? 'Lõpeta aedniku staatus' : 'Aktiveeri aedniku staatus (1€/kuu)'}
             </button>
          </div>

          <button onClick={(e) => handleLogout(e)} className="w-full p-4 text-red-600 font-black bg-white border border-red-100 rounded-2xl hover:bg-red-50 transition-all shadow-sm flex items-center justify-center gap-2">
            <i className="fa-solid fa-right-from-bracket"></i> LOGI VÄLJA
          </button>
        </div>

        <div className="lg:col-span-2 space-y-8">
           <form onSubmit={handleSave} className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Profiili seaded</h3>
                {(!formData.phone || !formData.location) && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md uppercase tracking-tight animate-pulse">
                    * Täida kontaktandmed, et hakata aednikuks
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Nimi</label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">E-post</label>
                    <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Telefon</label>
                    <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Aednikule kohustuslik" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Asukoht</label>
                    <LocationAutocompleteInput
                      type="text"
                      value={formData.location}
                      onChange={(value) => setFormData({ ...formData, location: value })}
                      onSelectLocation={(location) => setFormData({ ...formData, location: location.address || location.label })}
                      placeholder="Sisesta linn, aadress või piirkond"
                      autoComplete="off"
                      inputClassName="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                      dropdownClassName="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                      suggestionClassName="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-stone-100 last:border-b-0"
                      emptyStateClassName="px-4 py-3 text-sm text-stone-500 bg-white"
                    />
                 </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition-all">Salvesta muudatused</button>
           </form>

           <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-6">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Maksed</p>
                <h3 className="text-lg font-bold text-stone-900">Maksekaart</h3>
                <p className="text-sm text-stone-500 mt-2">
                  Kaardiandmed salvestatakse Stripe'is. Aiast Koju kuvab ainult kaardi tüübi ja viimased 4 numbrit.
                </p>
              </div>

              <div className="grid grid-cols-1 max-w-md gap-4">
                <div className="rounded-3xl border border-stone-100 bg-stone-50/60 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Ostja maksekaart</p>
                      <p className="text-lg font-black text-stone-900">
                        {maskLast4(paymentProfile?.buyerCard?.last4)}
                      </p>
                      <p className="text-sm text-stone-500 mt-1">
                        {paymentProfile?.buyerCard
                          ? `${paymentProfile.buyerCard.brand || 'kaart'} · ${paymentProfile.buyerCard.expMonth}/${paymentProfile.buyerCard.expYear}`
                          : 'Lisa kaart, et järgmine makse oleks kiirem.'}
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                      <i className="fa-solid fa-credit-card"></i>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startPaymentRedirect('buyer-card', 'payments-create-setup-session')}
                    disabled={paymentAction === 'buyer-card'}
                    className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {paymentAction === 'buyer-card' ? 'Avame Stripe...' : paymentProfile?.buyerCard ? 'Uuenda kaarti' : 'Salvesta kaart'}
                  </button>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
