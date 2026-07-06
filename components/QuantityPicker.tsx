import React, { useEffect, useMemo, useState } from 'react';

interface QuantityPickerProps {
  label: string;
  quantity: number;
  unit?: string | null;
  minQty: number;
  maxQty?: number;
  onSetQty: (quantity: number) => void;
  size?: 'sm' | 'md' | 'lg';
  showMinHint?: boolean;
  compact?: boolean;
}

const normalizeUnit = (unit?: string | null) => String(unit || 'tk').trim().toLowerCase() || 'tk';

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
};

const toDisplayQuantity = (quantity: number, displayUnit: string, baseUnit: string) => {
  if (baseUnit === 'g' && displayUnit === 'kg') {
    return quantity / 1000;
  }

  return quantity;
};

const toBaseQuantity = (quantity: number, displayUnit: string, baseUnit: string) => {
  if (baseUnit === 'g' && displayUnit === 'kg') {
    return quantity * 1000;
  }

  return quantity;
};

const getStep = (displayUnit: string, baseUnit: string) => {
  if (baseUnit === 'g' && displayUnit === 'kg') {
    return 1;
  }

  return 1;
};

const getSizeClasses = (size: QuantityPickerProps['size']) => {
  if (size === 'lg') {
    return {
      button: 'w-10 h-10 rounded-xl',
      input: 'w-24 text-xl',
      shell: 'gap-2 p-2 rounded-2xl',
      unitToggle: 'px-3 py-2 text-xs',
    };
  }

  if (size === 'md') {
    return {
      button: 'w-7 h-7 rounded-lg',
      input: 'w-20 text-sm',
      shell: 'gap-2 px-2 py-1.5 rounded-xl',
      unitToggle: 'px-2.5 py-1.5 text-[10px]',
    };
  }

  return {
    button: 'w-6 h-6 rounded-lg',
    input: 'w-12 text-sm',
    shell: 'gap-1.5 px-1.5 py-1.5 rounded-xl',
    unitToggle: 'px-2 py-1 text-[10px]',
  };
};

const QuantityPicker: React.FC<QuantityPickerProps> = ({
  label,
  quantity,
  unit,
  minQty,
  maxQty = Number.MAX_SAFE_INTEGER,
  onSetQty,
  size = 'sm',
  showMinHint = true,
  compact = false,
}) => {
  const baseUnit = normalizeUnit(unit);
  const unitOptions = useMemo(() => (baseUnit === 'g' ? ['g', 'kg'] : [baseUnit]), [baseUnit]);
  const [displayUnit, setDisplayUnit] = useState(unitOptions[0]);
  const [draftValue, setDraftValue] = useState(formatNumber(toDisplayQuantity(quantity, unitOptions[0], baseUnit)));
  const [wasAdjusted, setWasAdjusted] = useState(false);
  const sizeClasses = getSizeClasses(size);

  useEffect(() => {
    const nextUnit = unitOptions.includes(displayUnit) ? displayUnit : unitOptions[0];
    if (nextUnit !== displayUnit) {
      setDisplayUnit(nextUnit);
    }

    setDraftValue(formatNumber(toDisplayQuantity(quantity, nextUnit, baseUnit)));
  }, [baseUnit, displayUnit, quantity, unitOptions]);

  const displayMin = toDisplayQuantity(minQty, displayUnit, baseUnit);
  const displayMax = maxQty === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : toDisplayQuantity(maxQty, displayUnit, baseUnit);
  const numericDraft = Number(draftValue.replace(',', '.'));
  const isBelowMin = draftValue.trim() !== '' && Number.isFinite(numericDraft) && toBaseQuantity(numericDraft, displayUnit, baseUnit) < minQty;
  const isAboveMax = draftValue.trim() !== '' && Number.isFinite(numericDraft) && toBaseQuantity(numericDraft, displayUnit, baseUnit) > maxQty;
  const canDecrease = quantity > minQty;
  const canIncrease = quantity < maxQty;

  const commitValue = (value: string) => {
    const parsed = Number(value.replace(',', '.'));
    const fallback = toDisplayQuantity(minQty, displayUnit, baseUnit);
    const displayQty = Number.isFinite(parsed) ? parsed : fallback;
    const roundedBaseQty = Math.round(toBaseQuantity(displayQty, displayUnit, baseUnit));
    const nextQty = Math.min(maxQty, Math.max(minQty, roundedBaseQty));

    setWasAdjusted(nextQty !== roundedBaseQty);
    setDraftValue(formatNumber(toDisplayQuantity(nextQty, displayUnit, baseUnit)));
    onSetQty(nextQty);
  };

  const adjustBy = (direction: -1 | 1) => {
    const nextQty = Math.min(maxQty, Math.max(minQty, quantity + Math.round(toBaseQuantity(getStep(displayUnit, baseUnit), displayUnit, baseUnit)) * direction));
    setWasAdjusted(false);
    setDraftValue(formatNumber(toDisplayQuantity(nextQty, displayUnit, baseUnit)));
    onSetQty(nextQty);
  };

  const handleUnitChange = (nextUnit: string) => {
    setDisplayUnit(nextUnit);
    setWasAdjusted(false);
    setDraftValue(formatNumber(toDisplayQuantity(quantity, nextUnit, baseUnit)));
  };
  const unitControl = unitOptions.length > 1 ? (
    <div className="inline-flex shrink-0 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
      {unitOptions.map(option => (
        <button
          key={option}
          type="button"
          aria-label={`Vali ${option}`}
          onClick={() => handleUnitChange(option)}
          className={`rounded-lg font-black uppercase transition-colors ${sizeClasses.unitToggle} ${
            displayUnit === option
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-stone-500 hover:text-emerald-700'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  ) : (
    <span className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-black uppercase text-emerald-800 shadow-sm">
      {baseUnit}
    </span>
  );

  return (
    <div className="space-y-2">
      <div className={`flex max-w-full items-center gap-2 ${compact ? 'w-full' : 'w-fit'}`}>
        <div className={`inline-flex min-w-0 flex-1 items-center justify-between border bg-stone-50 ${sizeClasses.shell} ${isBelowMin || isAboveMax ? 'border-amber-300 ring-2 ring-amber-100' : 'border-stone-200'}`}>
          <button
            type="button"
            aria-label={`Vahenda toote ${label} kogust`}
            onClick={() => adjustBy(-1)}
            disabled={!canDecrease}
            className={`${sizeClasses.button} bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <i className="fa-solid fa-minus text-[10px]"></i>
          </button>
          <input
            aria-label={`Muuda toote ${label} kogust`}
            type="text"
            inputMode="decimal"
            value={draftValue}
            onChange={e => {
              setWasAdjusted(false);
              setDraftValue(e.target.value);
            }}
            onBlur={() => commitValue(draftValue)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className={`${sizeClasses.input} bg-transparent text-center font-black text-stone-900 outline-none`}
          />
          <button
            type="button"
            aria-label={`Suurenda toote ${label} kogust`}
            onClick={() => adjustBy(1)}
            disabled={!canIncrease}
            className={`${sizeClasses.button} bg-white text-stone-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <i className="fa-solid fa-plus text-[10px]"></i>
          </button>
        </div>
        {unitControl}
      </div>
      {showMinHint && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">
            <i className="fa-solid fa-circle-info"></i>
            Min {formatNumber(displayMin)} {displayUnit}
          </span>
          {wasAdjusted && (
            <span className="text-[10px] font-bold text-amber-700">
              Kogus viidi lubatud piiridesse.
            </span>
          )}
          {isBelowMin && (
            <span className="text-[10px] font-bold text-amber-700">
              Alla miinimumi.
            </span>
          )}
          {isAboveMax && displayMax !== Number.MAX_SAFE_INTEGER && (
            <span className="text-[10px] font-bold text-amber-700">
              Laos kuni {formatNumber(displayMax)} {displayUnit}.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default QuantityPicker;
