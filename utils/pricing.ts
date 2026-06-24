import { Product, PriceBasis } from '../types';

export const normalizePriceBasis = (value?: string | null): PriceBasis => {
  if (value === 'per_base_unit' || value === 'per_min_order') {
    return value;
  }

  return 'per_unit';
};

export const inferPriceBasisFromUnit = (unit?: string | null): PriceBasis =>
  String(unit || '').trim().toLowerCase() === 'g' ? 'per_base_unit' : 'per_unit';

export const getAutomaticPriceHelpText = (unit?: string | null) =>
  String(unit || '').trim().toLowerCase() === 'g'
    ? 'Sisesta kilohind. Näiteks 12€/kg ja 100g tellimus arvutatakse automaatselt 1.20€.'
    : 'Sisesta hind ühe valitud ühiku kohta.';

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
