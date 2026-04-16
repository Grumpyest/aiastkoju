import React, { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

interface GardenerSubscriptionCheckoutModalProps {
  clientSecret: string;
  publishableKey: string;
  onClose: () => void;
}

const GardenerSubscriptionCheckoutModal: React.FC<GardenerSubscriptionCheckoutModalProps> = ({
  clientSecret,
  publishableKey,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const mountCheckout = async () => {
      try {
        setError('');
        setIsLoading(true);

        const stripe = await loadStripe(publishableKey);

        if (!stripe) {
          throw new Error('Stripe maksevaadet ei saanud laadida.');
        }

        const stripeWithEmbeddedCheckout = stripe as any;
        const createEmbeddedCheckout =
          stripeWithEmbeddedCheckout.createEmbeddedCheckoutPage ||
          stripeWithEmbeddedCheckout.initEmbeddedCheckout;

        if (!createEmbeddedCheckout) {
          throw new Error('Stripe embedded maksevaadet ei saa selles brauseris avada.');
        }

        const checkout = await createEmbeddedCheckout.call(stripeWithEmbeddedCheckout, {
          clientSecret,
        });

        if (!isMounted) {
          checkout.destroy();
          return;
        }

        checkoutRef.current = checkout;
        checkout.mount(containerRef.current!);
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Stripe maksevaadet ei saanud avada.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    mountCheckout();

    return () => {
      isMounted = false;
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, [clientSecret, publishableKey]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-stone-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full w-full max-w-xl items-center">
        <div className="w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 p-5">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
                Aedniku kuutasu
              </p>
              <h2 className="text-xl font-black text-stone-950">Lisa uus kaart</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-500">
                Kaart salvestatakse Stripe'is ja seda kasutatakse aedniku kuutasuks.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
              aria-label="Sulge maksevaade"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          {error && (
            <div className="m-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {isLoading && !error && (
            <div className="m-5 rounded-3xl border border-stone-100 bg-stone-50 p-5 text-sm font-bold text-stone-500">
              <i className="fa-solid fa-circle-notch fa-spin mr-2 text-emerald-600"></i>
              Laeme turvalist maksevaadet...
            </div>
          )}

          <div className="max-h-[78vh] min-h-[460px] overflow-y-auto p-2 sm:p-4">
            <div ref={containerRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GardenerSubscriptionCheckoutModal;
