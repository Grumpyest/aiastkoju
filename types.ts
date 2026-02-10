
export enum UserRole {
  BUYER = 'BUYER',
  GARDENER = 'GARDENER',
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  NEW = 'NEW',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  ARCHIVED = 'ARCHIVED'
}

export enum Language {
  ET = 'ET',
  EN = 'EN',
  RU = 'RU'
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  location?: string;
  avatar?: string;
  bankDetails?: {
    cardNumber: string;
    expiry: string;
    cvv: string;
  };
}

export interface Product {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerLocation?: string;
  title: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  stockQty: number;
  minOrderQty: number;
  image: string; // Peamine pilt
  images?: string[]; // Lisapildid
  isActive: boolean;
  status?: ProductStatus;
  rating: number;
  reviewsCount: number;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  sellerId: string;
  sellerLocation?: string;
  status: OrderStatus;
  total: number;
  items: {
    productId: string;
    title: string;
    qty: number;
    price: number;
  }[];
  createdAt: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
}

export interface ReviewReply {
  id: string;
  userId: string;
  userName: string;
  text: string;
  role: UserRole;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  reviewerName: string;
  targetType: 'product' | 'seller';
  targetId: string;
  stars: number;
  comment: string;
  replies?: ReviewReply[];
  createdAt: string;
}

export interface TranslationSchema {
  nav: {
    home: string;
    catalog: string;
    orders: string;
    dashboard: string;
    admin: string;
    login: string;
    register: string;
    logout: string;
  };
  hero: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
  };
  categories: Record<string, string>;
  common: {
    price: string;
    unit: string;
    add_to_cart: string;
    buy: string;
    view_details: string;
    location: string;
    stock: string;
    empty_cart: string;
    checkout: string;
    confirm: string;
    cancel: string;
  };
}
