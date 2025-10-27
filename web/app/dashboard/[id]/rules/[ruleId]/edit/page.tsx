'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../../lib/useAuthReady';

export default function EditRulePage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const ruleId = params?.ruleId as string;
  const { ready, session } = useAuthReady();

  const [role, setRole] = useState<string>('User');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [threshold, setThreshold] = useState<string>('');
  const [increment, setIncrement] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p && mounted) setRole(p.role || 'User');
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/rules`);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('increment_rules')
        .select('threshold, increment')
        .eq('id', ruleId)
        .single();
      if (!mounted) return;
      if (error || !data) {
        setError(error?.message || 'Rule not found');
      } else {
        setThreshold(String(data.threshold ?? ''));
        setIncrement(String(data.increment ?? ''));
      }
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [ready, session, auctionId, ruleId, router]);

  function validate(): string | null {
    const t = Number(threshold);
    const i = Number(increment);
    if (isNaN(t) || isNaN(i)) return 'Both fields must be numbers';
    if (t < 0 || i <= 0) return 'Threshold must be 0 and increment > 0';
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('increment_rules')
        .update({ threshold: Number(threshold), increment: Number(increment) })
        .eq('id', ruleId);
      if (error) throw error;
      setSuccess('Saved');
      setTimeout(() => router.replace(`/dashboard/${auctionId}/rules`), 600);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = confirm('Delete this rule?');
    if (!ok) return;
    const { error } = await supabase.from('increment_rules').delete().eq('id', ruleId);
    if (error) { alert(error.message); return; }
    router.replace(`/dashboard/${auctionId}/rules`);
  }

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail ? userEmail.split('@')[0] : '';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif' }}>
      <div className="flex min-h-screen">
        <aside className="w-80 bg-white p-6 flex flex-col justify-between border-r border-gray-200">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <img className="h-10 w-10" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAWU-2H6FwslxIhIhfbWsEQdZ8bwLOKHgijNEU17x0IWNICsXe1J51Q4gffIfO5mcoUIbaqoYlJN5pcT89H3z7KeSTjoqneJjNWqK0wUzZzgozUsNu8cxbNmhAMI4X2LP3DUwHKPSiAt76VoC7Cynjk0kco2XErKnpX2BgGpHzwPnDljd3UmwfcpLo0YBGK-cbD-zydipZsN575rRl2sxTqZaHVxvSRojK9JcrFV6tSjzDT4nnI28my-3wv4b5Qd8M6Q5kr9LhmJ3g" />
              <div className="flex flex-col">
                <h1 className="text-gray-900 text-xl font-bold leading-tight">UCL Auctions</h1>
                <p className="text-sm text-gray-500">Sponsored</p>
              </div>
            </div>
            <nav className="flex flex-col gap-2" id="main-nav">
              <Link href={`/dashboard/${auctionId}/teams`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100">
                <span className="material-symbols-outlined">groups</span>
                <span className="font-medium">Teams</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/players`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100">
                <span className="material-symbols-outlined">person</span>
                <span className="font-medium">Players</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/rules`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-pink-50 text-pink-600">
                <span className="material-symbols-outlined">gavel</span>
                <span className="font-semibold">Bid Rules</span>
              </Link>
              <hr className="my-4 border-gray-200" />
              <Link href={`#`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100">
                <span className="material-symbols-outlined">live_tv</span>
                <span className="font-medium">Live Auction Console</span>
              </Link>
            </nav>
          </div>
          <div ref={profileRef} className="relative">
            <button onClick={() => setProfileOpen(s => !s)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 text-left">
              <div className="size-10 rounded-full bg-center bg-cover bg-no-repeat" style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuCkBaw0NP9vVQvXoio8OnkXr77KrzC_fbJWwzi6VZ61DM6m8HxpCjULjESPM-3SbdaLrAnKnS97J7WiQSrjXhvCTAXTm-ST0lNXRE_J5P8ZNDHHCP4UY1A6lzcsePkOLoAwP7KbxEcFul1kEXgDzmQskgxqEuJz455sHU-GB9d_3QuK82DMeaba4QA4y2IU16b7v0E6VOSqCj06cnETsGUnXZsBq7vQMiP4EAKavjeHTnTPHuNnsaC20XheVKeBqgn64ClOY8sQVs0)' }} />
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate max-w-[18ch]">{displayEmail}</p>
                <p className="text-sm text-gray-500">{role}</p>
              </div>
            </button>
            {profileOpen && (
              <div className="absolute left-full ml-2 bottom-0 w-56 rounded-md bg-white py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5 z-10">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-medium text-gray-900 truncate" title={userEmail}>{userEmail}</p>
                  <p className="text-xs text-gray-500">Role: {role}</p>
                </div>
                <button onClick={async () => { await supabase.auth.signOut(); setProfileOpen(false); router.replace('/auth/sign-in'); }} className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100">Sign out</button>
              </div>
            )}
          </div>
        </aside>
        <main className="flex-1 p-8">
          <div className="max-w-3xl mx-auto">
            <header className="mb-8">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Edit Rule</h1>
                  <p className="mt-2 text-gray-500">Update threshold and increment.</p>
                </div>
                <Link href={`/dashboard/${auctionId}/rules`} className="inline-flex items-center gap-2 rounded-lg border border-pink-50 px-4 py-2 text-sm text-pink-600 bg-pink-50 hover:bg-pink-100">
                  <span className="material-symbols-outlined">arrow_back</span>
                  <span>Back</span>
                </Link>
              </div>
            </header>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <form onSubmit={handleSave} className="space-y-6">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Increment Amount (USD)</label>
                    <input type="number" step="1" min="1" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={increment} onChange={e => setIncrement(e.target.value)} required />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Up To Threshold (USD)</label>
                    <input type="number" step="1" min="0" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={threshold} onChange={e => setThreshold(e.target.value)} required />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  {success && <p className="text-sm text-green-600">{success}</p>}
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                      <span className="material-symbols-outlined">delete</span>
                      <span>Delete</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/${auctionId}/rules`} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        <span className="material-symbols-outlined">close</span>
                        <span>Cancel</span>
                      </Link>
                      <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-6 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50">
                        <span className="material-symbols-outlined">save</span>
                        <span>{saving ? 'Saving…' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 