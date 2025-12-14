import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DashboardStats {
  emailsProcessed: number;
  avgResponseTime: number; // minutes
  satisfactionRate: number;
  activeTickets: number;
  totalTickets: number;
  resolvedTickets: number;
}

interface ActivityItem {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
}

export const useDashboardData = (clientId?: string) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    emailsProcessed: 0,
    avgResponseTime: 0,
    satisfactionRate: 0,
    activeTickets: 0,
    totalTickets: 0,
    resolvedTickets: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function computeStatsForClient(cid?: string) {
    if (!user || !cid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data: submissions, error } = await supabase
        .from("contact_submissions")
        .select("*")
        .eq("client_id", cid)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = submissions ?? [];

      const total = rows.length;
      const resolved = rows.filter((r: any) => r.status === "responded").length;
      const active = total - resolved;

      const respondedRows = rows.filter((r: any) => r.responded_at);
      let avgResponseMin = 0;
      if (respondedRows.length > 0) {
        const totalMinutes = respondedRows.reduce((sum: number, r: any) => {
          const created = new Date(r.created_at).getTime();
          const responded = new Date(r.responded_at).getTime();
          return sum + Math.max(0, (responded - created) / 1000 / 60);
        }, 0);
        avgResponseMin = totalMinutes / respondedRows.length;
      }

      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const last7 = rows.filter((r: any) => new Date(r.created_at).getTime() >= now - sevenDaysMs).length;
      const ticketsPerDay = Math.round((last7 / 7) * 10) / 10;

      setStats({
        emailsProcessed: total,
        avgResponseTime: Math.round(avgResponseMin * 10) / 10,
        satisfactionRate: 0,
        activeTickets: active,
        totalTickets: total,
        resolvedTickets: resolved,
      });

      const recent = (rows as any[]).slice(0, 20).map(r => ({
        id: r.id,
        activityType: r.status === "responded" ? "responded" : "new",
        title: r.name ?? r.email,
        description: r.message ?? null,
        createdAt: r.created_at,
      }));
      setActivities(recent);

      const ticketList = (rows as any[]).map(r => ({
        id: r.id,
        title: r.name ?? r.email,
        description: r.message ?? null,
        status: r.status ?? "unread",
        priority: "normal",
        createdAt: r.created_at,
      }));
      setTickets(ticketList);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
      setStats(s => ({ ...s }));
      setActivities([]);
      setTickets([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    computeStatsForClient(clientId);
  }, [user, clientId]);

  return { stats, activities, tickets, isLoading, refresh: () => computeStatsForClient(clientId) };
};
