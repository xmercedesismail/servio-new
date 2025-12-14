import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getPlanByProductId, PlanDetails } from '../lib/plan-lookup';

// --- Type Definitions ---
interface SubscriptionCheckData {
    subscribed: boolean;
    product_id: string | null;
    subscription_end: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  isSubscribed: boolean;
  currentPlan: PlanDetails | null;
  subscriptionEnd: string | null;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- AuthProvider Component ---

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanDetails | null>(null); 
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const signOut = async () => {
    await supabase.auth.signOut(); 
    setUser(null);
    setSession(null);
    setIsSubscribed(false);
    setCurrentPlan(null);
    setSubscriptionEnd(null);
    setIsLoading(false); 
  };
  
  // FIX 1: Make function stable (empty dependency array) to prevent duplicates.
  // FIX 2: Accept the session as an argument instead of relying on the state closure.
  const checkSubscription = useCallback(async (currentSession: Session | null) => {
    // FIX 3: Use the session passed as argument for validity check.
    if (!currentSession || !currentSession.user) {
        setIsSubscribed(false);
        setCurrentPlan(null);
        setSubscriptionEnd(null);
        return;
    }

    try {
      // FIX 4: CRITICAL: Specify method: 'GET' and path: '/api/admin/check'
      const response = await supabase.functions.invoke<SubscriptionCheckData>("check-subscription", {
          method: 'GET',
          path: '/api/admin/check',
      });
      
      if (response.error || !response.data) {
          console.error("Error invoking check-subscription or empty response:", response.error?.message || "No data returned.");
          setIsSubscribed(false);
          setCurrentPlan(null);
          setSubscriptionEnd(null);
          return; 
      }
      
      const data = response.data;

      setIsSubscribed(data.subscribed);
      
      if (data.product_id) {
        const plan = getPlanByProductId(data.product_id);
        setCurrentPlan(plan);
      } else {
        setCurrentPlan(null);
      }
      setSubscriptionEnd(data.subscription_end);
      
    } catch (error) {
      console.error("Caught error checking subscription:", error);
      setIsSubscribed(false);
      setCurrentPlan(null);
    }
  }, []); // ✅ FIX: Empty dependency array ensures stability.

  // 1. Initial Load and Auth Listener Setup
  useEffect(() => {
    let sub: { unsubscribe: () => void; } | null = null;
    let initialLoadComplete = false;

    const handleSessionChange = (currentSession: Session | null) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
      
      if (currentSession?.user) {
        // ✅ Call with current session to check subscription
        checkSubscription(currentSession); 
      } else {
        // ✅ Call with null to clear state on SIGNED_OUT
        checkSubscription(null); 
      }
    };

    // Set up real-time listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
           handleSessionChange(session);
        }
      }
    );
    sub = subscription;

    // Then, fetch the current session status for the initial state
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
        if (!initialLoadComplete) {
            handleSessionChange(initialSession);
            initialLoadComplete = true; 
        }
    }).catch(err => {
        console.error("Error fetching initial session:", err);
        setIsLoading(false);
    });

    // CRITICAL CLEANUP: Unsubscribe the listener when the component unmounts
    return () => {
        if (sub) {
             sub.unsubscribe();
        }
    };
  }, []); // ✅ FIX: Empty dependency array ensures this setup runs only once.

  // 2. Polling for Subscription Status
  useEffect(() => {
    // Now depends on local session state, which is updated by the effect above
    if (!session || !session.user) return;
    
    // Pass the session state to the stable checkSubscription function for execution
    const interval = setInterval(() => checkSubscription(session), 60000); 
    
    return () => clearInterval(interval);
  }, [session, checkSubscription]); // Still needs checkSubscription in dependencies, but it's now stable

  // --- Provider Value (No Change) ---
  const value = { 
    user, 
    session, 
    accessToken: session?.access_token ?? null, 
    isLoading, 
    isSubscribed, 
    currentPlan, 
    subscriptionEnd,
    signOut, 
    // This exposed checkSubscription is now stable as well
    checkSubscription: () => checkSubscription(session) 
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Hook Consumer (No Change) ---

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};