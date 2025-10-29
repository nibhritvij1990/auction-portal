'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
import ManagePageLayout from '../../../../components/ManagePageLayout';

type Rule = {
  id: string;
  from_amount: number;
  to_amount: number | null;
  increment: number;
};

export default function RulesPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ role: string } | null>(null);

  // New rule form state
  const [threshold, setThreshold] = useState<number | ''>('');
  const [increment, setIncrement] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }

      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (mounted && p) setProfile(p);
      
      setLoading(true);
      // The database uses a `threshold` column for the upper bound of a bid range.
      // We fetch the data and then process it to create `from_amount` and `to_amount` for rendering.
      const { data, error } = await supabase
        .from('increment_rules')
        .select('id,threshold,increment')
        .eq('auction_id', auctionId)
        .order('threshold', { ascending: true });
      if (!mounted) return;

      if (error || !data) {
        setRules([]);
      } else {
        const processedRules: Rule[] = data.map((rule: { id: string; threshold: number; increment: number }, index, allRules) => ({
          id: rule.id,
          increment: rule.increment,
          from_amount: index === 0 ? 0 : (allRules[index - 1].threshold + 1),
          to_amount: rule.threshold,
        }));
        setRules(processedRules);
      }
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [ready, session, auctionId, router]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('increment_rules')
        .insert({ auction_id: auctionId, threshold: toNum(threshold), increment: toNum(increment) });
      if (insertError) throw insertError;

      // Refresh data
      const { data, error: selectError } = await supabase
        .from('increment_rules')
        .select('id,threshold,increment')
        .eq('auction_id', auctionId)
        .order('threshold', { ascending: true });
      if (selectError) throw selectError;

      if (data) {
         const processedRules: Rule[] = data.map((rule: { id: string; threshold: number; increment: number }, index, allRules) => ({
          id: rule.id,
          increment: rule.increment,
          from_amount: index === 0 ? 0 : (allRules[index - 1].threshold + 1),
          to_amount: rule.threshold,
        }));
        setRules(processedRules);
      }
      setThreshold('');
      setIncrement('');
    } catch (err: any) {
      setError(err.message || 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = confirm('Delete this rule?');
    if (!ok) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('increment_rules').delete().eq('id', id);
      if (error) throw error;
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete rule');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ManagePageLayout>
      <div className="w-full">
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Auction Management Console</h1>
              <p className="mt-2 text-gray-500">Manage teams, players and bid rules for your auction.</p>
            </div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-pink-50 px-4 py-2 text-sm text-pink-600 bg-pink-50 hover:bg-pink-100">
              <span className="material-symbols-outlined">arrow_back</span>
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Bid Rules</h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {loading && <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Loading…</div>}
              {!loading && rules.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
                  <div>
                    <p className="font-medium text-gray-800">Increment: <span className="text-purple-600">{fmtCurrency(r.increment)}</span></p>
                    <p className="text-sm text-gray-500">Up to a bid of: {fmtCurrency(r.to_amount)}</p>
                  </div>
                  {(profile?.role === 'admin' || profile?.role === 'auctioneer') && (
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/${auctionId}/rules/${r.id}/edit`} className="p-2 rounded-full hover:bg-gray-200" title="Edit">
                        <span className="material-symbols-outlined text-gray-600">edit</span>
                      </Link>
                      <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="p-2 rounded-full hover:bg-red-100 disabled:opacity-50" title="Delete">
                        <span className="material-symbols-outlined text-red-600">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!loading && rules.length === 0 && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No rules yet.</div>
              )}
            </div>
          </div>
          {(profile?.role === 'admin' || profile?.role === 'auctioneer') && (
            <div className="lg:mt-[60px]">
              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Add New Rule</h3>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Increment Amount (USD)</label>
                    <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={increment} onChange={e => setIncrement(numOrEmpty(e.target.value))} required />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Up To Threshold (USD)</label>
                    <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={threshold} onChange={e => setThreshold(numOrEmpty(e.target.value))} required />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button disabled={saving} className="w-full rounded-lg bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add Rule'}</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </ManagePageLayout>
  );
}

function numOrEmpty(v: string) { return v === '' ? '' : Number(v); }
function toNum(v: number | '') { return v === '' ? null : v; }
function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 