'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

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
    <main className="min-h-screen bg-[url('https://storage.googleapis.com/aida-images/ce8122d2-8b43-4e8c-8515-3b95a828e833.png')] bg-cover bg-center flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white/80 p-8 shadow-lg backdrop-blur-sm">
        <div className="mb-8 text-center">
          <img alt="Auction Central" className="mx-auto mb-2 h-32" src="/images/auction-central-3d-03.jpg" />
          <p className="mt-2 text-gray-600">Sponsored by UCL</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <div>
              <label className="sr-only" htmlFor="email">Username or Email</label>
              <input id="email" type="email" placeholder="Username or Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white/80 px-4 py-3 text-gray-800 shadow-sm placeholder:text-gray-500 transition-all duration-300 ease-in-out focus:border-[#f72585] focus:ring-2 focus:ring-[#f72585]/50" />
            </div>
            {mode === 'password' && (
              <div>
                <label className="sr-only" htmlFor="password">Password</label>
                <input id="password" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white/80 px-4 py-3 text-gray-800 shadow-sm placeholder:text-gray-500 transition-all duration-300 ease-in-out focus:border-[#f72585] focus:ring-2 focus:ring-[#f72585]/50" />
              </div>
            )}
          </div>

          <div className="mt-4 text-xs">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
              Mode: {mode === 'password' ? 'Password' : 'Magic link'}
            </span>
          </div>

          <div className="mt-8 flex flex-col gap-4">
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#f72585] py-3 text-base font-semibold text-white transition-all duration-300 ease-in-out hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[#f72585] focus:ring-offset-2 disabled:opacity-50">
              {loading ? 'Please wait…' : 'Login'}
            </button>
            <button type="button" className="w-full rounded-lg bg-[#7209b7] py-3 text-base font-semibold text-white transition-all duration-300 ease-in-out hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[#7209b7] focus:ring-offset-2" onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}>
              {mode === 'password' ? 'Use Magic Link' : 'Use Password'}
            </button>
          </div>
        </form>

        {message && <div className="mt-6 text-center text-sm text-gray-700">{message}</div>}
        <div className="mt-6 text-center">
          <a className="text-sm text-gray-500 hover:text-[#f72585] hover:underline" href="#">Forgot password?</a>
        </div>
      </div>
    </main>
  );
} 