'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import type { Session } from '@supabase/supabase-js';

export function useAuthReady() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setSession(session ?? null);
        setReady(true);
      }
    });
    const t = setTimeout(() => { if (mounted) setReady(true); }, 800);
    return () => { mounted = false; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  return { ready, session };
} 