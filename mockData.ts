
import { User, UserRole, Product, Order, OrderStatus, Review } from './types';

export const initialUsers: User[] = [
  { id: 'u1', name: 'Mati Mets', email: 'mati@aiast.ee', role: UserRole.GARDENER, location: 'Tartumaa' },
];

export const initialProducts: Product[] = [
  { 
    id: 'p1', 
    sellerId: 'u1', 
    sellerName: 'Mati Mets',
    sellerLocation: 'Tartumaa (Nõo)',
    title: 'Värsked mahekartulid', 
    description: 'Värskelt muldmatud kartulid minu oma aiast Nõos. Sort: Marabel. Väga hea maitsega!', 
    category: 'Köögiviljad', 
    price: 1.5, 
    unit: 'kg', 
    stockQty: 100, 
    minOrderQty: 2, 
    image: 'https://images.unsplash.com/photo-1518977676601-b53f02bad67b?auto=format&fit=crop&q=80&w=600', 
    isActive: true,
    rating: 4.8,
    reviewsCount: 12
  }
];