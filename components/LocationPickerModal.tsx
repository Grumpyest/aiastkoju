import React, { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MarketplaceLocationFilter, ResolvedLocation } from '../types';
import { clampRadiusKm, geocodeLocation, getCurrentCoordinates, reverseGeocodeLocation } from '../utils/location';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER: [number, number] = [59.437, 24.7536];

export interface LocationMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
}

interface LocationPickerModalProps {
  isOpen: boolean;
  value: MarketplaceLocationFilter;
  defaultQuery?: string;
  markers?: LocationMapMarker[];
  onClose: () => void;
  onApply: (filter: MarketplaceLocationFilter) => void;
}

const MapViewportSync: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();

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
  markers = [],
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

    setSearchInput(value.location?.label || defaultQuery);
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

      setDraftLocation({
        ...resolved,
        label: query,
      });
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

      setDraftLocation(
        resolved || {
          ...coordinates,
          label: 'Minu asukoht',
          address: `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`,
        }
      );
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

      setDraftLocation(
        resolved || {
          ...coordinates,
          label: `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`,
        }
      );
    } catch (error: any) {
      setErrorMessage(error?.message || 'Kaardilt valitud asukohta ei saanud tõlkida.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#1f1f1f] text-white rounded-[28px] shadow-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black">Määra asukoht</h2>
            <p className="text-sm text-white/65 mt-2 max-w-2xl">
              Vali piirkond, kus soovid kuulutusi näha. Võid kasutada telefoni asukohta, sisestada linna või klõpsata kaardil.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white/70"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px] gap-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                resolveSearch();
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3"
            >
              <i className="fa-solid fa-location-dot text-white/60"></i>
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Sisesta linn, aadress või piirkond"
                className="bg-transparent flex-1 outline-none text-white placeholder:text-white/35"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-bold"
              >
                Otsi
              </button>
            </form>

            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={isBusy}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 disabled:opacity-60 text-sm font-bold flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-location-crosshairs"></i>
              Minu asukoht
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4 items-start">
            <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Raadius km</span>
              <input
                type="number"
                min="1"
                max="500"
                inputMode="numeric"
                value={radiusInput}
                onChange={(event) => setRadiusInput(event.target.value)}
                className="w-full bg-transparent outline-none text-lg font-black text-white"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-h-[76px]">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Valitud koht</span>
              {draftLocation ? (
                <>
                  <p className="font-bold text-white">{draftLocation.label}</p>
                  {draftLocation.address && (
                    <p className="text-sm text-white/60 mt-1 line-clamp-2">{draftLocation.address}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-white/50">Asukohta pole veel valitud.</p>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          )}

          <div className="rounded-[24px] overflow-hidden border border-white/10">
            <MapContainer
              center={mapCenter}
              zoom={11}
              scrollWheelZoom
              className="h-[380px] w-full"
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
                    <Popup>{draftLocation.label}</Popup>
                  </Marker>
                  <Circle
                    center={[draftLocation.lat, draftLocation.lng]}
                    radius={clampRadiusKm(Number(radiusInput.replace(',', '.'))) * 1000}
                    pathOptions={{
                      color: '#60a5fa',
                      fillColor: '#60a5fa',
                      fillOpacity: 0.12,
                    }}
                  />
                </>
              )}

              {markers.map(marker => (
                <Marker key={marker.id} position={[marker.lat, marker.lng]}>
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-bold">{marker.label}</p>
                      {marker.subtitle && <p className="text-xs text-stone-500">{marker.subtitle}</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="text-sm text-white/50">
            Klõpsa kaardil, kui tahad markerit käsitsi paigutada. Müüjate markerid kuvatakse kaardil siis, kui nende asukoht on lahendatud.
          </div>
        </div>

        <div className="px-6 py-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={clearSelection}
            className="px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-sm font-bold"
          >
            Tühjenda filter
          </button>
          <button
            type="button"
            onClick={applySelection}
            disabled={!draftLocation || isBusy}
            className="px-6 py-3 rounded-2xl bg-[#1877f2] hover:bg-[#2c82f6] disabled:opacity-60 text-sm font-bold"
          >
            Rakenda
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
