'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      setMessage('Sign up successful! Please check your email to confirm your account.');
    } catch (err: any) {
      setError(err.message || 'Failed to sign up.');
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
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Create an Account</h2>
            <p className="mt-2 text-gray-600">Sponsored by UCL</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="sr-only" htmlFor="email">Email</label>
                <input id="email" type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-500 transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/50" />
              </div>
              <div>
                <label className="sr-only" htmlFor="password">Password</label>
                <input id="password" type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-500 transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/50" />
              </div>
              <div>
                <label className="sr-only" htmlFor="confirm-password">Confirm Password</label>
                <input id="confirm-password" type="password" placeholder="Confirm Password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-500 transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/50" />
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              <button type="submit" disabled={loading} className="w-full rounded-full bg-pink-600 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50">
                {loading ? 'Creating Account…' : 'Sign Up'}
              </button>
            </div>
          </form>

          {message && <div className="mt-6 text-center text-sm font-medium text-green-600">{message}</div>}
          {error && <div className="mt-6 text-center text-sm font-medium text-red-600">{error}</div>}
          
          <div className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link className="font-semibold text-purple-800 hover:underline" href="/auth/sign-in">Sign In</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
