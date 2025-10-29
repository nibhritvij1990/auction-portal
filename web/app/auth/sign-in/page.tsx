'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'magic' | 'password'>('password');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        router.replace('/dashboard');
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        setMessage('Magic link sent. Check your email.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Ensure loading resets even if navigation is delayed
        setLoading(false);
        router.replace('/dashboard');
        return;
      }
    } catch (err: any) {
      const msg = err?.message || 'Sign-in failed';
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#110f22] p-2">
      <div className="w-full h-[calc(100vh-1rem)] flex flex-col items-center justify-center bg-[#f9fafb] rounded-2xl">
        <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-8 text-center">
            <img alt="Auction Central" className="mx-auto mb-2 h-32" src="/images/auction-central-3d-03.jpg" />
            <p className="mt-2 text-gray-600">Sponsored by UCL</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="sr-only" htmlFor="email">Email</label>
                <input id="email" type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-500 transition-all duration-300 ease-in-out focus:border-pink-500 focus:ring-2 focus:ring-pink-500/50" />
              </div>
              {mode === 'password' && (
                <div>
                  <label className="sr-only" htmlFor="password">Password</label>
                  <input id="password" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-500 transition-all duration-300 ease-in-out focus:border-pink-500 focus:ring-2 focus:ring-pink-500/50" />
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-4">
              <button type="submit" disabled={loading} className="w-full rounded-full bg-pink-600 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50">
                {loading ? 'Please wait…' : 'Login'}
              </button>
              <button type="button" className="w-full rounded-full border border-purple-800 bg-purple-800 py-3 text-base font-medium text-white transition-all hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2" onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}>
                {mode === 'password' ? 'Use Magic Link' : 'Use Password'}
              </button>
            </div>
          </form>

          {message && <div className="mt-6 text-center text-sm font-medium text-pink-600">{message}</div>}
          
          <div className="mt-6 text-center text-sm text-gray-500">
            <Link className="hover:text-pink-600 hover:underline" href="/auth/forgot-password">Forgot password?</Link>
          </div>

          <div className="mt-4 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link className="font-semibold text-pink-600 hover:underline" href="/auth/sign-up">Sign Up</Link>
          </div>
        </main>
      </div>
    </div>
  );
} 