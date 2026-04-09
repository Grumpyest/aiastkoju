import React, { useEffect, useRef, useState } from 'react';
import { ResolvedLocation } from '../types';
import { searchLocationSuggestions } from '../utils/location';

interface LocationAutocompleteInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  onSelectLocation?: (location: ResolvedLocation) => void;
  containerClassName?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  suggestionClassName?: string;
  emptyStateClassName?: string;
  startIcon?: React.ReactNode;
  minSearchLength?: number;
}

const LocationAutocompleteInput: React.FC<LocationAutocompleteInputProps> = ({
  value,
  onChange,
  onSelectLocation,
  containerClassName = '',
  inputClassName = '',
  dropdownClassName = '',
  suggestionClassName = '',
  emptyStateClassName = '',
  startIcon,
  minSearchLength = 2,
  ...inputProps
}) => {
  const [suggestions, setSuggestions] = useState<ResolvedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextSearchRef = useRef(false);

  useEffect(() => {
    const trimmed = value.trim();

    if (!isFocused || suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    if (trimmed.length < minSearchLength) {
      setSuggestions([]);
      setIsLoading(false);
      setHasLoadedOnce(false);
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const results = await searchLocationSuggestions(trimmed);

        if (!isCancelled) {
          setSuggestions(results);
          setHasLoadedOnce(true);
          setIsOpen(true);
        }
      } catch {
        if (!isCancelled) {
          setSuggestions([]);
          setHasLoadedOnce(true);
          setIsOpen(true);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }, 280);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isFocused, minSearchLength, value]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const selectSuggestion = (location: ResolvedLocation) => {
    const nextValue = location.address || location.label;
    suppressNextSearchRef.current = true;
    onChange(nextValue);
    onSelectLocation?.(location);
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className={`relative ${containerClassName}`}>
      {startIcon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          {startIcon}
        </div>
      )}

      <input
        {...inputProps}
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={(event) => {
          inputProps.onFocus?.(event);
          setIsFocused(true);
          if (value.trim().length >= minSearchLength) {
            setIsOpen(true);
          }
        }}
        onBlur={(event) => {
          inputProps.onBlur?.(event);
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsFocused(false);
            setIsOpen(false);
          }, 140);
        }}
        onKeyDown={(event) => {
          inputProps.onKeyDown?.(event);

          if (event.key === 'Enter' && suggestions.length > 0 && isOpen) {
            event.preventDefault();
            selectSuggestion(suggestions[0]);
          }
        }}
        className={inputClassName}
      />

      {isOpen && value.trim().length >= minSearchLength && (
        <div className={dropdownClassName}>
          {isLoading ? (
            <div className={emptyStateClassName}>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i>
              Otsin asukohti...
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.lat}-${suggestion.lng}-${index}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
                className={suggestionClassName}
              >
                <span className="block font-bold">{suggestion.label}</span>
                {suggestion.address && (
                  <span className="block text-xs opacity-75 mt-1">{suggestion.address}</span>
                )}
                {suggestion.subtitle && (
                  <span className="block text-[11px] opacity-55 mt-1 capitalize">{suggestion.subtitle}</span>
                )}
              </button>
            ))
          ) : hasLoadedOnce ? (
            <div className={emptyStateClassName}>
              Sobivat asukohta ei leitud.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default LocationAutocompleteInput;
