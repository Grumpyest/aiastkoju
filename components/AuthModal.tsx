import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { supabase } from '../supabaseClient';
import LocationAutocompleteInput from './LocationAutocompleteInput';
import { cleanEmail, cleanPhone, cleanText } from '../utils/security';

interface AuthModalProps {
  mode: 'login' | 'register';
  setMode: (mode: 'none' | 'login' | 'register') => void;
  setUser: (user: User | null) => void;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ mode, setMode, setUser, onNotify }) => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    location: '',
    role: UserRole.BUYER,
    termsAccepted: false,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = cleanEmail(loginData.email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: loginData.password,
    });

    if (error || !data.user) {
      onNotify?.(error?.message || 'Login ebaõnnestus', 'error');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,is_seller,location,username,avatar_url')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      onNotify?.('Sisse logimine keelatud: profiili ei leitud andmebaasist.', 'error');
      return;
    }

    const metadataLocation = typeof data.user.user_metadata?.location === 'string'
      ? data.user.user_metadata.location.trim()
      : '';
    const nextLocation = profile.location || metadataLocation || '';

    if (!profile.location && metadataLocation) {
      const { error: locationUpdateError } = await supabase
        .from('profiles')
        .update({ location: metadataLocation })
        .eq('id', data.user.id);

      if (locationUpdateError) {
        console.warn('Profile location backfill failed', locationUpdateError);
      }
    }

    setUser({
      id: profile.id,
      name: profile.full_name || (profile.email?.split('@')[0] ?? 'Kasutaja'),
      email: profile.email || email,
      phone: profile.phone || undefined,
      location: nextLocation || undefined,
      role: profile.is_seller ? UserRole.GARDENER : UserRole.BUYER,
      avatar: profile.avatar_url || '/seeding.png',
    });

    setMode('none');
    onNotify?.('Sisselogimine õnnestus!', 'success');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (regData.password !== regData.confirmPassword) {
      onNotify?.('Paroolid ei ühti!', 'error');
      return;
    }

    if (regData.role === UserRole.GARDENER) {
      if (!regData.termsAccepted) {
        onNotify?.('Aednikuna liitumiseks pead nõustuma tingimustega!', 'error');
        return;
      }
      if (!regData.phone || !regData.location) {
        onNotify?.('Aednikuna registreerimiseks on telefon ja asukoht kohustuslikud!', 'error');
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail(regData.email),
      password: regData.password,
      options: {
        data: {
          full_name: cleanText(regData.name),
          username: cleanText(regData.name),
          phone: cleanPhone(regData.phone),
          location: cleanText(regData.location, 240),
          is_seller: regData.role === UserRole.GARDENER,
        },
      },
    });

    if (error) {
      onNotify?.(error.message, 'error');
      return;
    }

    if (!data.session) {
      setMode('none');
      onNotify?.('Konto loodud! Palun kinnita e-post ja logi siis sisse.', 'success');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,is_seller,location')
      .eq('id', data.user!.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      onNotify?.('Konto loodi, aga profiili ei tekkinud. Kontrolli triggerit/RLS-i.', 'error');
      return;
    }

    if (regData.phone || regData.location) {
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          phone: cleanPhone(regData.phone) || null,
          location: cleanText(regData.location, 240) || null,
        })
        .eq('id', data.user!.id);

      if (profileUpdateError) {
        onNotify?.('Konto loodi, aga asukoha salvestamine ebaõnnestus. Salvesta see hiljem profiilis uuesti.', 'error');
      }
    }

    setUser({
      id: profile.id,
      name: profile.full_name || cleanEmail(regData.email).split('@')[0] || 'Kasutaja',
      email: profile.email || cleanEmail(regData.email),
      phone: profile.phone || cleanPhone(regData.phone) || undefined,
      location: cleanText(regData.location, 240) || profile.location || undefined,
      role: profile.is_seller ? UserRole.GARDENER : UserRole.BUYER,
      avatar: '/seeding.png',
    });

    setMode('none');
    onNotify?.('Konto loodud ja sisse logitud!', 'success');
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-md w-full shadow-2xl relative animate-fade-in overflow-y-auto max-h-[90vh]">
        <button aria-label="Sulge sisselogimise aken" onClick={() => setMode('none')} className="absolute top-6 right-6 text-stone-300 hover:text-stone-500 text-xl"><i className="fa-solid fa-xmark"></i></button>
        {mode === 'login' ? (
          <>
            <h2 className="text-2xl font-black text-stone-900 mb-6">Logi sisse</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <input required type="text" placeholder="E-post" value={loginData.email} onChange={e => setLoginData({ ...loginData, email: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
              <input required type="password" placeholder="Parool" value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition-all">Sisenen</button>
              <p className="text-center text-xs text-stone-400 mt-4">Pole veel kontot? <button type="button" onClick={() => setMode('register')} className="text-emerald-600 font-bold">Registreeru</button></p>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black text-stone-900 mb-6">Loo konto</h2>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="flex gap-2 p-1 bg-stone-100 rounded-xl mb-2">
                <button type="button" onClick={() => setRegData({ ...regData, role: UserRole.BUYER })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${regData.role === UserRole.BUYER ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500'}`}>Ostja</button>
                <button type="button" onClick={() => setRegData({ ...regData, role: UserRole.GARDENER })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${regData.role === UserRole.GARDENER ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500'}`}>Aednik</button>
              </div>
              <div className="space-y-3 pb-4 border-b border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Isikuandmed</p>
                <input type="text" placeholder="Kasutajanimi" value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                <input required type="email" placeholder="E-post" value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                <input required={regData.role === UserRole.GARDENER} type="tel" placeholder={regData.role === UserRole.GARDENER ? 'Telefoninumber (Kohustuslik)' : 'Telefoninumber (Valikuline)'} value={regData.phone} onChange={e => setRegData({ ...regData, phone: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="space-y-2">
                  <LocationAutocompleteInput
                    required={regData.role === UserRole.GARDENER}
                    type="text"
                    value={regData.location}
                    onChange={(value) => setRegData({ ...regData, location: value })}
                    onSelectLocation={(location) => setRegData({ ...regData, location: location.address || location.label })}
                    placeholder={regData.role === UserRole.GARDENER ? 'Asukoht või aadress (Kohustuslik)' : 'Asukoht või aadress (Valikuline)'}
                    autoComplete="off"
                    inputClassName="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500"
                    dropdownClassName="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                    suggestionClassName="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-stone-100 last:border-b-0"
                    emptyStateClassName="px-4 py-3 text-sm text-stone-500 bg-white"
                  />
                  <p className="text-[10px] text-emerald-600 font-medium px-1 italic leading-tight">
                    * Määrates asukoha, saame pakkuda sulle asjakohasemat kogemust ja näidata lähemal asuvaid aednikke.
                  </p>
                </div>
                <input required type="password" placeholder="Parool" value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                <input required type="password" placeholder="Kinnita parool" value={regData.confirmPassword} onChange={e => setRegData({ ...regData, confirmPassword: e.target.value })} className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              {regData.role === UserRole.GARDENER && (
                <label className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100 cursor-pointer">
                  <input type="checkbox" required checked={regData.termsAccepted} onChange={e => setRegData({ ...regData, termsAccepted: e.target.checked })} className="w-5 h-5 accent-emerald-600" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-amber-800 uppercase leading-tight">Nõustun aedniku tingimustega</span>
                    <span className="text-[8px] text-amber-700">Kuutasu puudub. Teenustasu lisandub ainult tellimuse checkoutis.</span>
                  </div>
                </label>
              )}
              <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition-all">Loon konto</button>
              <p className="text-center text-xs text-stone-400 mt-4">On juba konto? <button type="button" onClick={() => setMode('login')} className="text-emerald-600 font-bold">Logi sisse</button></p>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
