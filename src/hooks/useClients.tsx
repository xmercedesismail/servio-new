import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Client = {
  id: string;
  name: string;
  stripe_customer_id?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
};

type Membership = {
  id: string;
  client_id: string;
  role: "owner" | "admin" | "agent" | string;
  clients?: Client | null;
};

export function useClients() {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchMemberships() {
      if (!user) {
        setMemberships([]);
        setClients([]);
        setCurrentClient(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from<Membership>("user_memberships")
          .select("id, role, client_id, clients(id, name, stripe_customer_id, subscription_status, subscription_current_period_end)")
          .eq("user_id", user.id);

        if (error) {
          console.error("Failed to fetch memberships", error);
          setMemberships([]);
          setClients([]);
          setCurrentClient(null);
          return;
        }

        const ms = (data ?? []).map((m: any) => ({
          id: m.id,
          client_id: m.client_id,
          role: m.role,
          clients: m.clients ?? null,
        }));

        if (!mounted) return;
        setMemberships(ms);
        const cls = ms
          .map(m => m.clients)
          .filter(Boolean) as Client[];
        setClients(cls);
        setCurrentClient(prev => prev ?? cls[0] ?? null);
      } catch (err) {
        console.error("Error fetching memberships", err);
        setMemberships([]);
        setClients([]);
        setCurrentClient(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    fetchMemberships();
    return () => { mounted = false; };
  }, [user]);

  return { memberships, clients, isLoading, currentClient, setCurrentClient };
}
