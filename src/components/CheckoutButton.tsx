import { loadStripe, Stripe } from "@stripe/stripe-js";
import { useState } from "react";

// Load Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:3000/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      const stripe = (await stripePromise) as Stripe; // ✅ type assertion
      if (!stripe) throw new Error("Stripe failed to load");

      // Use sessionId from backend
      const { error } = await stripe.redirectToCheckout({
        sessionId: data.id,
      });

      if (error) console.error(error.message);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="bg-green-500 text-white p-2 rounded"
    >
      {loading ? "Processing..." : "Pay $10"}
    </button>
  );
}