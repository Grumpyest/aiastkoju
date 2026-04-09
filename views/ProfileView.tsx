
import React, { useState, useRef } from 'react';
import { User, UserRole } from '../types';
import { supabase } from '../supabaseClient';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';

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

const avatarInputRef = useRef<HTMLInputElement>(null);
const [isAvatarUploading, setIsAvatarUploading] = useState(false);

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

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
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: formData.name,
        phone: formData.phone || null,
        location: formData.location || null,
      })
      .eq('id', user.id);

    if (error) throw error;

    setUser({
      ...user,
      name: formData.name,
      phone: formData.phone || undefined,
      location: formData.location || undefined,
      avatar: formData.avatar || undefined,
    });

    onNotify?.('Profiil edukalt uuendatud!', 'success');
  } catch (err: any) {
    onNotify?.(err?.message || 'Profiili salvestamine ebaõnnestus', 'error');
  }
};

 const toggleGardenerRole = async () => {
  try {
    if (user.role === UserRole.GARDENER) {
      const ok = confirm(
        'Kas soovid tõesti aedniku staatusest loobuda? Sinu tooted ei ole enam avalikult nähtavad.'
      );
      if (!ok) return;

      // 1) profiil ostjaks
      const { error } = await supabase
        .from('profiles')
        .update({ is_seller: false })
        .eq('id', user.id);

      if (error) throw error;

      await supabase
        .from('products')
        .update({ is_active: false })
        .eq('seller_id', user.id);

      setUser({ ...user, role: UserRole.BUYER });
      onNotify?.('Oled nüüd uuesti Ostja rollis.', 'success');
      return;
    }

    // kui ostja -> müüjaks
    if (!formData.phone.trim() || !formData.location.trim()) {
      onNotify?.(
        'Aedniku staatuse aktiveerimiseks pead esmalt täitma telefoni ja asukoha!',
        'error'
      );
      return;
    }

    const ok = confirm(
      'Soovid hakata Aednikuks? Rakendub aedniku kuutasu 1€/kuu (prototüüp). Kas nõustud?'
    );
    if (!ok) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        is_seller: true,
        phone: formData.phone,
        location: formData.location,
      })
      .eq('id', user.id);

    if (error) throw error;

    await supabase
      .from('products')
      .update({ is_active: true })
      .eq('seller_id', user.id);

    setUser({
      ...user,
      role: UserRole.GARDENER,
      phone: formData.phone,
      location: formData.location,
    });

    onNotify?.('Oled nüüd Aednik! Päisesse lisandus "Töölaud".', 'success');
  } catch (err: any) {
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
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-emerald-600 font-bold hover:translate-x-1 transition-transform">
        <i className="fa-solid fa-arrow-left"></i> {t.nav.home}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-stone-100 shadow-sm text-center">
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

          <div className={`p-8 rounded-[32px] shadow-xl relative overflow-hidden group transition-all ${user.role === UserRole.GARDENER ? 'bg-stone-800 text-white' : 'bg-emerald-900 text-white'}`}>
             <h3 className="text-lg font-bold mb-2 relative z-10">{user.role === UserRole.GARDENER ? 'Aedniku staatus: Aktiivne' : 'Hakka aednikuks!'}</h3>
             <p className="text-xs opacity-70 mb-6 relative z-10">
               {user.role === UserRole.GARDENER ? 'Sinu tellimus on aktiivne (1€/kuu). Halda tooteid töölaual.' : 'Müü oma aia saadusi teistele mugavalt vaid 1€ kuutasu eest.'}
             </p>
             <button 
              onClick={toggleGardenerRole} 
              className={`w-full py-3 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 ${user.role === UserRole.GARDENER ? 'bg-red-500 hover:bg-red-600' : 'bg-white text-emerald-900 hover:bg-emerald-50'}`}
             >
               {user.role === UserRole.GARDENER ? 'Lõpeta aedniku staatus' : 'Aktiveeri aedniku staatus (1€/kuu)'}
             </button>
          </div>

          <button onClick={(e) => handleLogout(e)} className="w-full p-4 text-red-600 font-black bg-white border border-red-100 rounded-2xl hover:bg-red-50 transition-all shadow-sm flex items-center justify-center gap-2">
            <i className="fa-solid fa-right-from-bracket"></i> LOGI VÄLJA
          </button>
        </div>

        <div className="lg:col-span-2 space-y-8">
           <form onSubmit={handleSave} className="bg-white p-8 rounded-[32px] border border-stone-100 shadow-sm space-y-6">
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
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
