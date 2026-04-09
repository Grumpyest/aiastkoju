import { Coordinates, ResolvedLocation } from '../types';

const GEOCODE_CACHE_KEY = 'aiastkoju-geocode-cache-v1';

type CachedLocationMap = Record<string, ResolvedLocation>;

const normalizeCacheKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const readCache = (): CachedLocationMap => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) as CachedLocationMap : {};
  } catch {
    return {};
  }
};

const writeCache = (cache: CachedLocationMap) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures and continue with live data.
  }
};

const getCachedLocation = (key: string) => {
  const normalized = normalizeCacheKey(key);
  const cache = readCache();
  return cache[normalized] ?? null;
};

const setCachedLocation = (key: string, value: ResolvedLocation) => {
  const normalized = normalizeCacheKey(key);
  const cache = readCache();
  cache[normalized] = value;
  writeCache(cache);
};

const parseLocation = (item: any): ResolvedLocation | null => {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon ?? item?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const address = String(item?.display_name || item?.name || '');
  const shortLabelFromAddress = address
    .split(',')
    .map((part: string) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');

  return {
    lat,
    lng,
    label: String(item?.name || shortLabelFromAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`),
    address,
    subtitle: String(item?.type || ''),
  };
};

export const clampRadiusKm = (value: number) => {
  if (!Number.isFinite(value)) {
    return 20;
  }

  return Math.max(1, Math.min(500, Math.round(value)));
};

export const geocodeLocation = async (query: string): Promise<ResolvedLocation | null> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const cached = getCachedLocation(trimmed);
  if (cached) {
    return cached;
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': 'et,en',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const parsed = Array.isArray(data) && data.length > 0 ? parseLocation(data[0]) : null;

  if (parsed) {
    setCachedLocation(trimmed, parsed);
  }

  return parsed;
};

export const searchLocationSuggestions = async (query: string, limit: number = 5): Promise<ResolvedLocation[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 8))));
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': 'et,en',
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(parseLocation)
    .filter((item): item is ResolvedLocation => item !== null);
};

export const reverseGeocodeLocation = async (coordinates: Coordinates): Promise<ResolvedLocation | null> => {
  const cacheKey = `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
  const cached = getCachedLocation(cacheKey);
  if (cached) {
    return cached;
  }

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(coordinates.lat));
  url.searchParams.set('lon', String(coordinates.lng));
  url.searchParams.set('format', 'jsonv2');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': 'et,en',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const parsed = parseLocation(data);

  if (parsed) {
    setCachedLocation(cacheKey, parsed);
  }

  return parsed;
};

export const getCurrentCoordinates = () =>
  new Promise<Coordinates>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation ei ole selles seadmes saadaval.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
        });
      },
      (error) => {
        reject(new Error(error.message || 'Asukohta ei saanud lugeda.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  });

export const calculateDistanceKm = (from: Coordinates, to: Coordinates) => {
  const toRadians = (value: number) => value * (Math.PI / 180);
  const earthRadiusKm = 6371;

  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

export const formatDistanceKm = (distanceKm: number) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  if (distanceKm >= 100) {
    return `${Math.round(distanceKm)} km`;
  }

  return `${distanceKm.toFixed(1)} km`;
};

export const buildExternalMapUrl = (options: {
  coordinates?: Coordinates | null;
  label?: string;
  fallbackQuery?: string;
}) => {
  const { coordinates, label, fallbackQuery } = options;
  const query = coordinates
    ? `${coordinates.lat},${coordinates.lng}`
    : fallbackQuery || label || '';
  const encodedLabel = encodeURIComponent(label || fallbackQuery || query);
  const encodedQuery = encodeURIComponent(fallbackQuery || label || query);

  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || '';
    const isAndroid = /Android/i.test(userAgent);
    const isAppleDevice = /iPhone|iPad|iPod|Macintosh/i.test(userAgent);

    if (isAndroid) {
      if (coordinates) {
        return `geo:${coordinates.lat},${coordinates.lng}?q=${coordinates.lat},${coordinates.lng}(${encodedLabel})`;
      }

      return `geo:0,0?q=${encodedQuery}`;
    }

    if (isAppleDevice) {
      if (coordinates) {
        return `https://maps.apple.com/?ll=${coordinates.lat},${coordinates.lng}&q=${encodedLabel}`;
      }

      return `https://maps.apple.com/?q=${encodedQuery}`;
    }
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};
