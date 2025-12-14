import React, { useState } from "react";
import { useClients } from "@/hooks/useClients";
import { useDashboardData } from "@/hooks/useDashboardData";
import ReplyModal from "@/components/Admin/ReplyModal";
import { useAuth } from "@/hooks/useAuth";

const ClientDashboard = () => {
  const { clients, isLoading: clientsLoading, currentClient, setCurrentClient } = useClients();
  const clientId = currentClient?.id;
  const { stats, activities, tickets, isLoading, refresh } = useDashboardData(clientId);
  const [filter, setFilter] = useState<"all" | "unread" | "responded">("all");
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const { accessToken } = useAuth();

  const filteredTickets = tickets.filter(t => {
    if (filter === "all") return true;
    if (filter === "unread") return t.status !== "responded";
    if (filter === "responded") return t.status === "responded";
    return true;
  });

  async function handleDelete(id: string) {
    if (!confirm("Delete ticket?")) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(`/api/admin/submission/delete?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error(await res.text());
      refresh();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Delete failed. See console.");
    }
  }

  async function handleMarkResponded(id: string) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch("/api/admin/submission/mark-responded", {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await res.text());
      refresh();
    } catch (err) {
      console.error("Mark responded failed", err);
      alert("Mark responded failed. See console.");
    }
  }

  function openReply(ticket: any) {
    setSelectedTicket(ticket);
    setReplyOpen(true);
  }

  async function onReplySent() {
    setReplyOpen(false);
    setSelectedTicket(null);
    refresh();
  }

  async function startCheckoutForClient(clientId: string, priceEnvVar?: string) {
    const priceId =
      process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER ||
      (process.env as any).VITE_STRIPE_PRICE_STARTER ||
      process.env.STRIPE_PRICE_STARTER ||
      priceEnvVar;

    if (!priceId) {
      alert('Stripe price ID not configured. Set NEXT_PUBLIC_STRIPE_PRICE_STARTER or VITE_STRIPE_PRICE_STARTER in your environment.');
      return;
    }

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          clientId,
          success_url: `${window.location.origin}/client?session=success`,
          cancel_url: `${window.location.origin}/client?session=cancel`
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create checkout session');
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Missing checkout url from server');
      }
    } catch (err: any) {
      console.error('Checkout error', err);
      alert(err.message || 'Failed to start checkout. See console for details.');
    }
  }

  if (clientsLoading) return <div>Loading clients…</div>;
  if (!currentClient) return <div>No client selected — ask an admin to assign you to a client.</div>;

  return (
    <main className="p-6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1>{currentClient.name} Dashboard</h1>
        <div>
          <label>
            Client:
            <select
              value={currentClient?.id}
              onChange={(e) => {
                const id = e.target.value;
                const selected = clients.find(c => c.id === id) ?? null;
                setCurrentClient(selected);
              }}
              style={{ marginLeft: 8 }}
            >
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button onClick={() => startCheckoutForClient(currentClient.id)} style={{ marginLeft: 12, background: '#16a34a', color: 'white', padding: '8px 12px', borderRadius: 6 }}>Subscribe / Upgrade</button>
        </div>
      </div>

      <section style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <div>Emails Processed</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.emailsProcessed}</div>
        </div>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <div>Avg Response Time</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.avgResponseTime}m</div>
        </div>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <div>Active Tickets</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.activeTickets}</div>
        </div>
      </section>

      <section>
        <div style={{ marginBottom: 12 }}>
          <label>Filter: </label>
          <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ marginLeft: 8 }}>
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="responded">Responded</option>
          </select>
          <button onClick={() => refresh()} style={{ marginLeft: 12 }}>Refresh</button>
        </div>

        {isLoading && <div>Loading tickets…</div>}
        {!isLoading && filteredTickets.length === 0 && <div>No tickets for this filter.</div>}

        {!isLoading && filteredTickets.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Message</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((t: any) => (
                <tr key={t.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{t.title}</td>
                  <td style={{ padding: 8, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</td>
                  <td style={{ padding: 8 }}>{new Date(t.createdAt).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{t.status}</td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => { setSelectedTicket(t); alert(t.description); }}>View</button>
                    <button onClick={() => openReply(t)} style={{ marginLeft: 8 }}>Reply</button>
                    <button onClick={() => handleMarkResponded(t.id)} style={{ marginLeft: 8 }}>Mark responded</button>
                    <button onClick={() => handleDelete(t.id)} style={{ marginLeft: 8 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {replyOpen && selectedTicket && (
        <ReplyModal
          submission={{
            id: selectedTicket.id,
            name: selectedTicket.title,
            email: selectedTicket.title,
            message: selectedTicket.description,
          }}
          onClose={() => setReplyOpen(false)}
          onSent={onReplySent}
        />
      )}
    </main>
  );
};

export default ClientDashboard;
