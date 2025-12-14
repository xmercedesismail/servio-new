// /src/lib/plan-lookup.ts

export interface PlanDetails {
    id: 'starter' | 'pro' | 'enterprise' | 'basic';
    name: string;
    description: string;
    price: string;
    features: string[];
}

/**
 * Maps a Stripe Price ID (Product ID) to a client-side friendly Plan object.
 * This is used by client components (like useAuth) to display plan information.
 * * @param productId The Stripe Price ID retrieved from user metadata.
 * @returns PlanDetails object or null.
 */
export function getPlanByProductId(productId: string): PlanDetails | null {
    // 💡 NOTE: Use your front-end environment variables (e.g., VITE_ or PUBLIC_ prefix)
    // to map the Stripe Price ID (e.g., price_xyz123) to a readable plan object.
    
    switch (productId) {
        case process.env.VITE_STRIPE_PRICE_STARTER:
            return { 
                id: 'starter', 
                name: 'Starter Plan', 
                description: 'Essential tools for small projects.',
                price: '$10/month',
                features: ['5 Clients', 'Basic Reporting'],
            };
            
        case process.env.VITE_STRIPE_PRICE_PRO:
            return { 
                id: 'pro', 
                name: 'Pro Plan', 
                description: 'Advanced features for growing businesses.',
                price: '$50/month',
                features: ['Unlimited Clients', 'Advanced Analytics', 'Priority Support'],
            };

        // Add more plans here as needed...

        default:
            return null;
    }
}