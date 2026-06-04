import React, { useEffect, useRef, useState } from 'react';
import { User, UserRole } from '../types';
import { supabase } from '../supabaseClient';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';
import { assertSafeImageFile, cleanEmail, cleanPhone, cleanText, cleanUrlPathPart } from '../utils/security';
import {
  activateSellerStatus,
  deactivateSellerStatus,
  getCachedPaymentProfile,
  getPaymentProfile,
  maskLast4,
  PaymentProfileSummary,
  redirectToPaymentFunction,
  removeBuyerPaymentCard,
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);

  const safeName = (name: string) => cleanUrlPathPart(name);
  const isSellerStatusLoading =
    paymentAction === 'seller-status-on' || paymentAction === 'seller-status-off';

  useEffect(() => {
    let isCancelled = false;

    const loadPaymentProfile = async () => {
      try {
        const profile = await getCachedPaymentProfile(user.id);

        if (!isCancelled) {
          setPaymentProfile(profile);
        }

        const refreshedProfile = await getPaymentProfile({ refreshStripe: true });

        if (!isCancelled) {
          setPaymentProfile(refreshedProfile);
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
  }, [user.id]);

  const startPaymentRedirect = async (
    action: string,
    functionName: string,
    body: Record<string, unknown> = {}
  ) => {
    try {
      setPaymentAction(action);
      await redirectToPaymentFunction(functionName, body);
    } catch (error: any) {
      onNotify?.(error?.message || 'Makse tegevust ei saanud alustada.', 'error');
      setPaymentAction(null);
    }
  };

  const removeBuyerCard = async () => {
    if (!paymentProfile?.buyerCard?.last4) {
      onNotify?.('Salvestatud maksekaarti pole.', 'success');
      return;
    }

    try {
      setPaymentAction('remove-buyer-card');
      await removeBuyerPaymentCard();
      setPaymentProfile(prev => (prev ? { ...prev, buyerCard: null } : { buyerCard: null }));
      onNotify?.('Maksekaart eemaldatud.', 'success');
    } catch (error: any) {
      onNotify?.(error?.message || 'Maksekaardi eemaldamine ebaõnnestus.', 'error');
    } finally {
      setPaymentAction(null);
    }
  };

  const uploadAvatarToStorage = async (file: File, path: string) => {
    assertSafeImageFile(file);

    const { error } = await supabase.storage.from('product-images').upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const preview = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, avatar: preview }));

    try {
      setIsAvatarUploading(true);

      const path = `${user.id}/avatar/avatar-${Date.now()}-${safeName(file.name)}`;
      const url = await uploadAvatarToStorage(file, path);

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      setUser(prev => (prev ? { ...prev, avatar: url } : prev));
      setFormData(prev => ({ ...prev, avatar: url }));
      onNotify?.('Profiilipilt uuendatud!', 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Profiilipildi uuendamine ebaõnnestus', 'error');
    } finally {
      setIsAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const nextName = cleanText(formData.name);
      const nextEmail = cleanEmail(formData.email);
      const nextPhone = cleanPhone(formData.phone);
      const nextLocation = cleanText(formData.location, 240);
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

      if (error) {
        throw error;
      }

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
          'Kas soovid tõesti aedniku staatusest loobuda? Sinu tooted peidetakse avalikust vaatest.'
        );

        if (!ok) {
          return;
        }

        setPaymentAction('seller-status-off');
        await deactivateSellerStatus();
        setUser({ ...user, role: UserRole.BUYER });
        onNotify?.('Aedniku staatus lõpetatud.', 'success');
        return;
      }

      const nextPhone = cleanPhone(formData.phone);
      const nextLocation = cleanText(formData.location, 240);

      if (!nextPhone || !nextLocation) {
        onNotify?.(
          'Aedniku staatuse aktiveerimiseks pead esmalt täitma telefoni ja asukoha.',
          'error'
        );
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          phone: nextPhone,
          location: nextLocation,
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          phone: nextPhone,
          location: nextLocation,
        },
      });

      if (metadataError) {
        console.warn('Auth metadata location update failed', metadataError);
      }

      setUser(prev => (prev ? {
        ...prev,
        phone: nextPhone,
        location: nextLocation,
      } : prev));

      setPaymentAction('seller-status-on');
      await activateSellerStatus();
      setUser(prev => (prev ? { ...prev, role: UserRole.GARDENER } : prev));
      onNotify?.('Aedniku staatus aktiveeritud.', 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Rolli vahetus ebaõnnestus', 'error');
    } finally {
      setPaymentAction(null);
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

    if (onNotify) {
      onNotify('Välja logitud.', 'success');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <button
        onClick={onBack}
        className="mb-8 flex items-center gap-2 font-bold text-emerald-600 transition-transform hover:translate-x-1"
      >
        <i className="fa-solid fa-arrow-left"></i> {t.nav.home}
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="rounded-3xl border border-stone-100 bg-white p-8 text-center shadow-sm">
            <div className="group relative mx-auto mb-6 h-32 w-32">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative block h-32 w-32 overflow-hidden rounded-full ring-4 ring-stone-50"
                title="Muuda profiilipilti"
                disabled={isAvatarUploading}
              >
                <img
                  src={formData.avatar || '/seeding.png'}
                  className={`h-full w-full object-cover transition duration-200 ${
                    isAvatarUploading ? 'opacity-70' : 'group-hover:blur-[2px]'
                  }`}
                />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                  <div className="flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 text-[10px] font-black text-white">
                    <i className="fa-solid fa-pen"></i>
                    MUUDA
                  </div>
                </div>

                {isAvatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-xl bg-white/90 px-3 py-2 text-[10px] font-black text-stone-700">
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
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-stone-400">
              {user.role === UserRole.GARDENER ? 'Aednik' : user.role === UserRole.ADMIN ? 'Admin' : 'Ostja'}
            </p>
          </div>

          <div
            className={`group relative overflow-hidden rounded-3xl p-8 shadow-xl transition-all ${
              user.role === UserRole.GARDENER ? 'bg-stone-800 text-white' : 'bg-emerald-900 text-white'
            }`}
          >
            <h3 className="relative z-10 mb-2 text-lg font-bold">
              {user.role === UserRole.GARDENER ? 'Aedniku staatus: aktiivne' : 'Hakka aednikuks'}
            </h3>
            <p className="relative z-10 mb-6 text-xs opacity-70">
              {user.role === UserRole.GARDENER
                ? 'Aedniku konto on aktiivne. Halda tooteid töölaual.'
                : 'Aedniku staatuse aktiveerimine on tasuta. Tellimustele lisandub ainult teenustasu checkoutis.'}
            </p>
            <button
              onClick={toggleGardenerRole}
              disabled={isSellerStatusLoading}
              className={`w-full rounded-xl py-3 text-xs font-bold shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                user.role === UserRole.GARDENER
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-white text-emerald-900 hover:bg-emerald-50'
              }`}
            >
              {paymentAction === 'seller-status-on'
                ? 'Aktiveerime...'
                : paymentAction === 'seller-status-off'
                ? 'Lõpetame staatust...'
                : user.role === UserRole.GARDENER
                ? 'Lõpeta aedniku staatus'
                : 'Aktiveeri aedniku staatus'}
            </button>
          </div>

          <button
            onClick={(e) => handleLogout(e)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white p-4 font-black text-red-600 shadow-sm transition-all hover:bg-red-50"
          >
            <i className="fa-solid fa-right-from-bracket"></i> LOGI VÄLJA
          </button>
        </div>

        <div className="space-y-8 lg:col-span-2">
          <form
            onSubmit={handleSave}
            className="space-y-6 rounded-3xl border border-stone-100 bg-white p-8 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Profiili seaded</h3>
              {(!formData.phone || !formData.location) && (
                <span className="animate-pulse rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-amber-600">
                  * Täida kontaktandmed, et hakata aednikuks
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-stone-400">Nimi</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-stone-100 bg-stone-50 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-stone-400">E-post</label>
                <input
                  required
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-stone-100 bg-stone-50 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-stone-400">Telefon</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-xl border border-stone-100 bg-stone-50 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Aednikule kohustuslik"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-stone-400">Asukoht</label>
                <LocationAutocompleteInput
                  type="text"
                  value={formData.location}
                  onChange={(value) => setFormData({ ...formData, location: value })}
                  onSelectLocation={(location) =>
                    setFormData({ ...formData, location: location.address || location.label })
                  }
                  placeholder="Sisesta linn, aadress või piirkond"
                  autoComplete="off"
                  inputClassName="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  dropdownClassName="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                  suggestionClassName="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-stone-100 last:border-b-0"
                  emptyStateClassName="px-4 py-3 text-sm text-stone-500 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-600 py-4 font-bold text-white shadow-lg transition-all hover:bg-emerald-700"
            >
              Salvesta muudatused
            </button>
          </form>

          <div className="space-y-6 rounded-3xl border border-stone-100 bg-white p-8 shadow-sm">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">Maksed</p>
              <h3 className="text-lg font-bold text-stone-900">Maksekaart</h3>
              <p className="mt-2 text-sm text-stone-500">
                Kaardiandmed salvestatakse Stripe'is. Aiast Koju kuvab ainult kaardi tüübi ja viimased 4 numbrit.
              </p>
            </div>

            <div className="grid max-w-md grid-cols-1 gap-4">
              <div className="rounded-3xl border border-stone-100 bg-stone-50/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Ostja maksekaart
                    </p>
                    <p className="text-lg font-black text-stone-900">
                      {maskLast4(paymentProfile?.buyerCard?.last4)}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {paymentProfile?.buyerCard
                        ? `${paymentProfile.buyerCard.brand || 'kaart'} · ${paymentProfile.buyerCard.expMonth}/${paymentProfile.buyerCard.expYear}`
                        : 'Lisa kaart, et järgmine makse oleks kiirem.'}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                    <i className="fa-solid fa-credit-card"></i>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => startPaymentRedirect('buyer-card', 'payments-create-setup-session')}
                  disabled={paymentAction === 'buyer-card' || paymentAction === 'remove-buyer-card'}
                  className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {paymentAction === 'buyer-card'
                    ? 'Avame Stripe...'
                    : paymentProfile?.buyerCard
                    ? 'Uuenda kaarti'
                    : 'Salvesta kaart'}
                </button>

                {paymentProfile?.buyerCard?.last4 && (
                  <button
                    type="button"
                    onClick={removeBuyerCard}
                    disabled={paymentAction === 'buyer-card' || paymentAction === 'remove-buyer-card'}
                    className="mt-3 w-full rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paymentAction === 'remove-buyer-card' ? 'Eemaldame...' : 'Eemalda kaart'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
