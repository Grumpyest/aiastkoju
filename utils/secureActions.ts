import { supabase } from '../supabaseClient';
import { OrderStatus, Review, ReviewReply } from '../types';
import { getFunctionErrorMessage } from './payments';

export const updateOrderStatusSecurely = async (orderId: string, status: OrderStatus) => {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; status?: OrderStatus }>(
    'orders-update-status',
    { body: { orderId, status } }
  );

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error('Tellimuse staatust ei saanud uuendada.');
  }

  return data.status || status;
};

export const createReviewSecurely = async (input: {
  orderId: string;
  productId: string;
  rating: number;
  comment: string;
}) => {
  const { data, error } = await supabase.functions.invoke<Review>('reviews-create', { body: input });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.id) {
    throw new Error('Arvustust ei saanud salvestada.');
  }

  return data;
};

export const createReviewReplySecurely = async (input: {
  reviewId: string;
  text: string;
}) => {
  const { data, error } = await supabase.functions.invoke<ReviewReply>('review-replies-create', { body: input });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.id) {
    throw new Error('Vastust ei saanud salvestada.');
  }

  return data;
};
