import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

type Props = {
  children: React.ReactElement;
  // optional fallback path when unauthorized (defaults to '/')
  fallbackPath?: string;
};

export default function AdminGuard({ children, fallbackPath = '/' }: Props) {
  const { user, isLoading, accessToken } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      setChecking(true);
      setIsAdmin(null);

      if (!user) {
        if (mounted) {
          setChecking(false);
          setIsAdmin(false);
        }
        return;
      }

      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch('/api/admin/check', { method: 'GET', headers });
        if (!res.ok) {
          // treat non-OK as not admin (401/403 will be handled separately)
          if (mounted) {
            setIsAdmin(false);
            setChecking(false);
          }
          return;
        }
        const data = await res.json();
        if (mounted) setIsAdmin(Boolean(data?.isAdmin));
      } catch (err) {
        console.error('Admin check failed', err);
        if (mounted) setIsAdmin(false);
      } finally {
        if (mounted) setChecking(false);
      }
    }

    checkAdmin();
    return () => {
      mounted = false;
    };
  }, [user, accessToken]);

  if (isLoading || checking) return <div>Checking permissions…</div>;

  if (!user) {
    // Not authenticated → redirect to auth
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    // Authenticated but not admin → show forbidden or redirect
    return (
      <div style={{ padding: 24 }}>
        <h2>Access denied</h2>
        <p>You do not have permission to view this page.</p>
        <p>
          <a href={fallbackPath}>Return to home</a>
        </p>
      </div>
    );
  }

  // Allowed
  return children;
}