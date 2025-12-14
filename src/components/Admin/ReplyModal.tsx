import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

type Props = {
  submission: {
    id: string;
    name: string;
    email: string;
    message: string;
  };
  onClose: () => void;
  onSent: () => void;
};

export default function ReplyModal({ submission, onClose, onSent }: Props) {
  const { accessToken } = useAuth();
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    if (!replyBody.trim()) {
      setError('Please enter a reply.');
      return;
    }
    setSending(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch('/api/client/reply', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submissionId: submission.id,
          to_email: submission.email,
          subject: `Re: your message to us`,
          body: replyBody,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = text;
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.error || parsed.message || text;
        } catch (_) {}
        throw new Error(errMsg || `Status ${res.status}`);
      }
      onSent();
    } catch (err: any) {
      console.error(err);
      setError(process.env.NODE_ENV === 'development' ? String(err.message || err) : 'Failed to send reply. See console for details.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reply-title" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', padding: 20, maxWidth: 800, width: '100%' }}>
        <h2 id="reply-title">Reply to {submission.name} ({submission.email})</h2>
        <p>Original message:</p>
        <blockquote>{submission.message}</blockquote>

        <label>
          Your reply
          <textarea rows={8} value={replyBody} onChange={e => setReplyBody(e.target.value)} style={{ width: '100%' }} />
        </label>

        {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

        <div style={{ marginTop: 12 }}>
          <button onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : 'Send reply'}</button>
          <button onClick={onClose} style={{ marginLeft: 8 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
