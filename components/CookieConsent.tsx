import React, { useEffect, useState } from 'react';

type OptionalCookieCategory = 'functional' | 'analytics' | 'marketing';

type CookiePreferences = Record<OptionalCookieCategory, boolean>;

type StoredCookieConsent = {
  version: 1;
  necessary: true;
  preferences: CookiePreferences;
  updatedAt: string;
};

const COOKIE_CONSENT_KEY = 'aiast-koju-cookie-consent-v1';
const COOKIE_CONSENT_OPEN_EVENT = 'cookie-consent-open';

const OPTIONAL_CATEGORIES: Array<{
  key: OptionalCookieCategory;
  title: string;
  description: string;
}> = [
  {
    key: 'functional',
    title: 'Funktsionaalsed',
    description: 'Hoiavad meeles mugavusseadeid, näiteks eelistusi ja kasutusvalikuid.',
  },
  {
    key: 'analytics',
    title: 'Analüütika',
    description: 'Aitavad mõista, kuidas lehte kasutatakse. Kasutame neid ainult sinu loal.',
  },
  {
    key: 'marketing',
    title: 'Turundus',
    description: 'Võimaldavad asjakohasemat sisu ja kampaaniaid, kui need tulevikus lisanduvad.',
  },
];

const emptyPreferences: CookiePreferences = {
  functional: false,
  analytics: false,
  marketing: false,
};

const allPreferences: CookiePreferences = {
  functional: true,
  analytics: true,
  marketing: true,
};

const hasStoredConsent = () => {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const saved = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!saved) {
      return false;
    }

    const parsed = JSON.parse(saved) as Partial<StoredCookieConsent>;
    return parsed.version === 1 && parsed.necessary === true && !!parsed.preferences;
  } catch {
    return false;
  }
};

const getStoredPreferences = (): CookiePreferences => {
  if (typeof window === 'undefined') {
    return emptyPreferences;
  }

  try {
    const saved = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!saved) {
      return emptyPreferences;
    }

    const parsed = JSON.parse(saved) as Partial<StoredCookieConsent>;
    return {
      functional: parsed.preferences?.functional === true,
      analytics: parsed.preferences?.analytics === true,
      marketing: parsed.preferences?.marketing === true,
    };
  } catch {
    return emptyPreferences;
  }
};

const saveConsent = (preferences: CookiePreferences) => {
  const consent: StoredCookieConsent = {
    version: 1,
    necessary: true,
    preferences,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent('cookie-consent-updated', { detail: consent }));
};

const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(() => !hasStoredConsent());
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(() => getStoredPreferences());

  useEffect(() => {
    const openPreferences = () => {
      setPreferences(getStoredPreferences());
      setIsCustomizing(true);
      setIsVisible(true);
    };

    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openPreferences);
    return () => window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openPreferences);
  }, []);

  if (!isVisible) {
    return null;
  }

  const closeWithConsent = (nextPreferences: CookiePreferences) => {
    saveConsent(nextPreferences);
    setIsVisible(false);
  };

  const togglePreference = (key: OptionalCookieCategory) => {
    setPreferences(current => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <i className="fa-solid fa-cookie-bite"></i>
              <h2 className="text-base font-black text-stone-950">Küpsiste valikud</h2>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-stone-600">
              Kasutame vajalikke küpsiseid ja salvestust ostukorvi ning konto toimimiseks. Valikulised küpsised jäävad sinu otsustada.
            </p>

            {isCustomizing && (
              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-stone-900">Hädavajalikud</p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Alati sees</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-stone-500">Vajalikud ostukorvi, sisselogimise ja maksete jaoks.</p>
                </div>
                {OPTIONAL_CATEGORIES.map(category => (
                  <label key={category.key} className="rounded-xl border border-stone-200 p-4 transition-colors hover:border-emerald-300">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-stone-900">{category.title}</span>
                      <input
                        type="checkbox"
                        checked={preferences[category.key]}
                        onChange={() => togglePreference(category.key)}
                        className="h-5 w-5 accent-emerald-600"
                      />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-stone-500">{category.description}</p>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:w-56 lg:flex-col">
            <button
              type="button"
              onClick={() => closeWithConsent(allPreferences)}
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700"
            >
              Aktsepteeri kõik
            </button>
            {isCustomizing ? (
              <button
                type="button"
                onClick={() => closeWithConsent(preferences)}
                className="rounded-xl border border-emerald-600 px-4 py-3 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                Salvesta valik
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-black text-stone-700 transition-colors hover:bg-stone-50"
              >
                Vali osaliselt
              </button>
            )}
            <button
              type="button"
              onClick={() => closeWithConsent(emptyPreferences)}
              className="rounded-xl px-4 py-3 text-sm font-black text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
            >
              Keeldu kõigist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { COOKIE_CONSENT_KEY, COOKIE_CONSENT_OPEN_EVENT };
export default CookieConsent;
