import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ReplyModal from './ReplyModal';
import { useAuth } from '@/hooks/useAuth';

type Submission = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
  status?: 'unread' | 'responded';
  responded_at?: string | null;
  responded_by?: string | null;
  client_id?: string | null;
};

export default function Inbox() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const { accessToken } = useAuth();

  async function fetchRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from<Submission>('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRows(data ?? []);
    } catch (err) {
      console.error('Failed to fetch submissions', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this submission?')) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`/api/admin/submission/delete?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Delete failed', err);
      alert('Delete failed. See console for details.');
    }
  }

  async function markResponded(id: string) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/api/admin/submission/mark-responded', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }
      await fetchRows();
    } catch (err) {
      console.error('Mark responded failed', err);
      alert('Mark responded failed. See console for details.');
    }
  }

  function openReply(row: Submission) {
    setSelected(row);
    setReplyOpen(true);
  }

  async function onReplySent() {
    setReplyOpen(false);
    setSelected(null);
    await fetchRows();
  }

  return (
    <section>
      {loading && <div>Loading…</div>}
      {!loading && rows.length === 0 && <div>No submissions yet.</div>}
      {!loading && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Message</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.status ?? 'unread'}</td>
                <td>
                  <button onClick={() => { setSelected(r); alert(r.message); }}>View</button>
                  <button onClick={() => openReply(r)}>Reply</button>
                  <button onClick={() => markResponded(r.id)}>Mark responded</button>
                  <button onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {replyOpen && selected && (
        <ReplyModal submission={selected} onClose={() => setReplyOpen(false)} onSent={onReplySent} />
      )}
    </section>
  );
}
