import React, { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MarketplaceLocationFilter, ResolvedLocation } from '../types';
import { clampRadiusKm, geocodeLocation, getCurrentCoordinates, reverseGeocodeLocation } from '../utils/location';
import LocationAutocompleteInput from './LocationAutocompleteInput';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER: [number, number] = [59.437, 24.7536];

interface LocationPickerModalProps {
  isOpen: boolean;
  value: MarketplaceLocationFilter;
  defaultQuery?: string;
  onClose: () => void;
  onApply: (filter: MarketplaceLocationFilter) => void;
}

const MapViewportSync: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    const refreshMapSize = () => {
      map.invalidateSize();
    };

    refreshMapSize();

    if (typeof window === 'undefined') {
      return;
    }

    const frameId = window.requestAnimationFrame(refreshMapSize);
    const timeoutId = window.setTimeout(refreshMapSize, 250);
    const settledTimeoutId = window.setTimeout(refreshMapSize, 600);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(settledTimeoutId);
    };
  }, [center, map]);

  useEffect(() => {
    map.flyTo(center, map.getZoom(), {
      duration: 0.6,
    });
  }, [center, map]);

  return null;
};

const MapClickSelector: React.FC<{ onSelect: (coordinates: { lat: number; lng: number }) => void }> = ({ onSelect }) => {
  useMapEvents({
    click(event) {
      onSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
};

const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  value,
  defaultQuery = '',
  onClose,
  onApply,
}) => {
  const [searchInput, setSearchInput] = useState(defaultQuery);
  const [radiusInput, setRadiusInput] = useState(String(value.radiusKm || 20));
  const [draftLocation, setDraftLocation] = useState<ResolvedLocation | null>(value.location);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchInput(value.location?.address || value.location?.label || defaultQuery);
    setRadiusInput(String(value.radiusKm || 20));
    setDraftLocation(value.location);
    setErrorMessage('');
  }, [defaultQuery, isOpen, value.location, value.radiusKm]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (draftLocation) {
      return [draftLocation.lat, draftLocation.lng];
    }

    return DEFAULT_CENTER;
  }, [draftLocation]);

  if (!isOpen) {
    return null;
  }

  const resolveSearch = async () => {
    const query = searchInput.trim();
    if (!query) {
      setErrorMessage('Sisesta asukoht või linn.');
      return;
    }

    setIsBusy(true);
    setErrorMessage('');

    try {
      const resolved = await geocodeLocation(query);

      if (!resolved) {
        setErrorMessage('Seda asukohta ei õnnestunud leida.');
        return;
      }

      setDraftLocation(resolved);
      setSearchInput(resolved.address || resolved.label);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Asukoha otsimine ebaõnnestus.');
    } finally {
      setIsBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const coordinates = await getCurrentCoordinates();
      const resolved = await reverseGeocodeLocation(coordinates);

      const nextLocation = resolved || {
        ...coordinates,
        label: 'Minu asukoht',
        address: `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`,
      };

      setDraftLocation(nextLocation);
      setSearchInput(nextLocation.address || nextLocation.label);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Seadme asukohta ei saanud kätte.');
    } finally {
      setIsBusy(false);
    }
  };

  const applySelection = () => {
    if (!draftLocation) {
      setErrorMessage('Vali enne asukoht.');
      return;
    }

    onApply({
      location: draftLocation,
      radiusKm: clampRadiusKm(Number(radiusInput.replace(',', '.'))),
    });
    onClose();
  };

  const clearSelection = () => {
    onApply({
      location: null,
      radiusKm: clampRadiusKm(Number(radiusInput.replace(',', '.'))),
    });
    onClose();
  };

  const handleMapPick = async (coordinates: { lat: number; lng: number }) => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const resolved = await reverseGeocodeLocation(coordinates);
      const nextLocation = resolved || {
        ...coordinates,
        label: `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`,
      };

      setDraftLocation(nextLocation);
      setSearchInput(nextLocation.address || nextLocation.label);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Kaardilt valitud asukohta ei saanud tõlkida.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] overflow-y-auto overscroll-contain">
      <button
        type="button"
        aria-label="Sulge asukoha valik"
        onClick={onClose}
        className="fixed inset-0 z-0 bg-stone-200/70 backdrop-blur-sm"
      ></button>

      <div className="relative z-10 min-h-full flex items-start md:items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-3xl bg-white text-stone-900 rounded-[28px] sm:rounded-[32px] shadow-2xl border border-stone-200 overflow-hidden my-3 sm:my-4 sm:max-h-[calc(100svh-2rem)] sm:flex sm:flex-col">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black">Määra asukoht</h2>
            <p className="text-sm text-stone-500 mt-2 max-w-2xl">
              Vali piirkond, kus soovid kuulutusi näha. Võid kasutada seadme asukohta, sisestada linna või klõpsata kaardil.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors flex items-center justify-center text-stone-500"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-b from-white to-stone-50/60 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_156px] gap-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                resolveSearch();
              }}
              className="relative rounded-2xl border border-stone-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm"
            >
              <LocationAutocompleteInput
                value={searchInput}
                onChange={setSearchInput}
                onSelectLocation={(location) => {
                  setDraftLocation(location);
                  setSearchInput(location.address || location.label);
                  setErrorMessage('');
                }}
                placeholder="Sisesta linn, aadress või piirkond"
                startIcon={<i className="fa-solid fa-location-dot text-stone-400"></i>}
                autoComplete="off"
                containerClassName="flex-1"
                inputClassName="w-full bg-transparent pl-8 pr-20 outline-none text-stone-900 placeholder:text-stone-400"
                dropdownClassName="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                suggestionClassName="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-stone-100 last:border-b-0"
                emptyStateClassName="px-4 py-3 text-sm text-stone-500"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="shrink-0 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-bold text-white"
              >
                Otsi
              </button>
            </form>

            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={isBusy}
              className="rounded-2xl border border-stone-200 bg-white px-4 py-3 hover:bg-emerald-50 disabled:opacity-60 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
            >
              <i className="fa-solid fa-location-crosshairs text-emerald-600"></i>
              Minu asukoht
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4 items-start">
            <label className="rounded-2xl border border-stone-200 bg-white px-4 py-3 block shadow-sm">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Raadius km</span>
              <input
                type="number"
                min="1"
                max="500"
                inputMode="numeric"
                value={radiusInput}
                onChange={(event) => setRadiusInput(event.target.value)}
                className="w-full bg-transparent outline-none text-lg font-black text-stone-900"
              />
            </label>

            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 min-h-[76px] shadow-sm">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Valitud koht</span>
              {draftLocation ? (
                <>
                  <p className="font-bold text-stone-900">{draftLocation.label}</p>
                  {draftLocation.address && (
                    <p className="text-sm text-stone-500 mt-1 line-clamp-2">{draftLocation.address}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-stone-500">Asukohta pole veel valitud.</p>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="rounded-[24px] overflow-hidden border border-stone-200 shadow-sm">
            <MapContainer
              center={mapCenter}
              zoom={11}
              scrollWheelZoom
              className="h-[320px] sm:h-[380px] w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapViewportSync center={mapCenter} />
              <MapClickSelector onSelect={handleMapPick} />

              {draftLocation && (
                <>
                  <Marker position={[draftLocation.lat, draftLocation.lng]}>
                    <Popup>{draftLocation.address || draftLocation.label}</Popup>
                  </Marker>
                  <Circle
                    center={[draftLocation.lat, draftLocation.lng]}
                    radius={clampRadiusKm(Number(radiusInput.replace(',', '.'))) * 1000}
                    pathOptions={{
                      color: '#059669',
                      fillColor: '#10b981',
                      fillOpacity: 0.12,
                    }}
                  />
                </>
              )}

            </MapContainer>
          </div>

          <div className="text-sm text-stone-500">
            Klõpsa kaardil, kui tahad markerit käsitsi paigutada. Valitud punkti ümber kuvatakse sinu otsinguraadius.
          </div>
        </div>

        <div className="px-6 py-5 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3 bg-white">
          <button
            type="button"
            onClick={clearSelection}
            className="px-4 py-3 rounded-2xl bg-stone-100 hover:bg-stone-200 text-sm font-bold text-stone-700"
          >
            Tühjenda filter
          </button>
          <button
            type="button"
            onClick={applySelection}
            disabled={!draftLocation || isBusy}
            className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-bold text-white"
          >
            Rakenda
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
