import { Product, PriceBasis } from '../types';

export const PRICE_BASIS_OPTIONS: Array<{ value: PriceBasis; label: string; description: string }> = [
  {
    value: 'per_unit',
    label: 'Hind on valitud ühiku kohta',
    description: 'Näiteks 12€ / tk või 12€ / g.',
  },
  {
    value: 'per_base_unit',
    label: 'Hind on baasühiku kohta',
    description: 'Grammi puhul arvutatakse hind kilogrammi järgi, näiteks 100g 12€/kg = 1.20€.',
  },
  {
    value: 'per_min_order',
    label: 'Hind on minimaalse koguse kohta',
    description: 'Näiteks min 100g ja hind 12€ tähendab, et 100g maksab 12€.',
  },
];

export const normalizePriceBasis = (value?: string | null): PriceBasis => {
  if (value === 'per_base_unit' || value === 'per_min_order') {
    return value;
  }

  return 'per_unit';
};

const baseUnitDivisor = (unit?: string | null) => {
  const normalized = String(unit || '').trim().toLowerCase();
  return normalized === 'g' ? 1000 : 1;
};

export const getPriceBasisLabel = (product: Pick<Product, 'unit' | 'minOrderQty' | 'priceBasis'>) => {
  const unit = product.unit || 'tk';
  const basis = normalizePriceBasis(product.priceBasis);

  if (basis === 'per_base_unit') {
    return unit.toLowerCase() === 'g' ? '/ kg' : `/ ${unit}`;
  }

  if (basis === 'per_min_order') {
    return `/ min ${Math.max(1, Number(product.minOrderQty ?? 1))} ${unit}`;
  }

  return `/ ${unit}`;
};

export const calculateLineTotalCents = (
  product: Pick<Product, 'price' | 'unit' | 'minOrderQty' | 'priceBasis'>,
  quantity: number
) => {
  const priceCents = Math.max(0, Math.round(Number(product.price || 0) * 100));
  const qty = Math.max(0, Number(quantity || 0));
  const basis = normalizePriceBasis(product.priceBasis);

  if (basis === 'per_min_order') {
    const minQty = Math.max(1, Number(product.minOrderQty ?? 1));
    return Math.round((priceCents * qty) / minQty);
  }

  if (basis === 'per_base_unit') {
    return Math.round((priceCents * qty) / baseUnitDivisor(product.unit));
  }

  return Math.round(priceCents * qty);
};

export const calculateLineTotal = (
  product: Pick<Product, 'price' | 'unit' | 'minOrderQty' | 'priceBasis'>,
  quantity: number
) => calculateLineTotalCents(product, quantity) / 100;
