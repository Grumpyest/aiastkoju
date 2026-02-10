
import React, { useState } from 'react';
import { User, UserRole } from '../types';

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

  const [bankData, setBankData] = useState({
    cardNumber: user.bankDetails?.cardNumber || '',
    expiry: user.bankDetails?.expiry || '',
    cvv: user.bankDetails?.cvv || '',
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setUser({ 
      ...user, 
      ...formData, 
      bankDetails: bankData 
    });
    if (onNotify) onNotify('Profiil edukalt uuendatud!', 'success');
  };

  const toggleGardenerRole = () => {
    if (user.role === UserRole.GARDENER) {
      if (confirm("Kas soovid tõesti aedniku staatusest loobuda? Sinu tooted ei ole enam avalikult nähtavad.")) {
        const updatedUser: User = { ...user, role: UserRole.BUYER };
        setUser(updatedUser);
        if (onNotify) onNotify('Oled nüüd uuesti Ostja rollis.', 'success');
      }
    } else {
      if (!formData.phone.trim() || !formData.location.trim()) {
        if (onNotify) onNotify("Aedniku staatuse aktiveerimiseks pead esmalt täitma oma profiilis telefoni ja asukoha väljad!", "error");
        return;
      }

      const confirmationMsg = `Soovid hakata Aednikuks? Rakendub aedniku kuutasu 1€, mis debiteeritakse Sinu kontolt automaatselt iga 30 päeva järel. Kas nõustud?`;

      if (confirm(confirmationMsg)) {
        const updatedUser: User = { 
          ...user, 
          role: UserRole.GARDENER,
          phone: formData.phone,
          location: formData.location
        };
        setUser(updatedUser);
        if (onNotify) onNotify('Oled nüüd Aednik! Päisesse lisandus "Töölaud".', 'success');
      }
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
             <div className="relative w-32 h-32 mx-auto mb-6">
                <img src={formData.avatar || `https://i.pravatar.cc/150?u=${user.id}`} className="w-full h-full object-cover rounded-full ring-4 ring-stone-50" />
             </div>
             <h2 className="text-xl font-bold text-stone-900">{user.name}</h2>
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
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Asukoht (Maakond)</label>
                    <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Aednikule kohustuslik" />
                 </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <i className="fa-solid fa-credit-card text-stone-400"></i> Makseandmed
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Kaardi number</label>
                    <input 
                      required
                      type="text" 
                      placeholder="0000 0000 0000 0000"
                      value={bankData.cardNumber} 
                      onChange={e => setBankData({...bankData, cardNumber: e.target.value})} 
                      className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase">Kehtivus (KK/AA)</label>
                      <input 
                        required
                        type="text" 
                        placeholder="MM/YY"
                        value={bankData.expiry} 
                        onChange={e => setBankData({...bankData, expiry: e.target.value})} 
                        className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase">CVV</label>
                      <input 
                        required
                        type="text" 
                        placeholder="***"
                        value={bankData.cvv} 
                        onChange={e => setBankData({...bankData, cvv: e.target.value})} 
                        className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                      />
                    </div>
                  </div>
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
