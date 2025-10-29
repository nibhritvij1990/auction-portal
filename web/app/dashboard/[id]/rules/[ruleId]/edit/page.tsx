'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../../lib/useAuthReady';
import ManagePageLayout from '../../../../../../components/ManagePageLayout';

export default function EditRulePage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const ruleId = params?.ruleId as string;
  const { ready, session } = useAuthReady();

  const [threshold, setThreshold] = useState<string>('');
  const [increment, setIncrement] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
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
    if (isNaN(t) || isNaN(i)) return 'Both fields must be numbers.';
    if (t < 0 || i <= 0) return 'Threshold must be >= 0 and Increment must be > 0.';
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('increment_rules')
        .update({
          threshold: Number(threshold),
          increment: Number(increment)
        })
        .eq('id', ruleId);
      if (error) throw error;
      setSuccess('Saved successfully!');
      setTimeout(() => router.replace(`/dashboard/${auctionId}/rules`), 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save rule.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this rule? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('increment_rules').delete().eq('id', ruleId);
      if (error) throw error;
      router.replace(`/dashboard/${auctionId}/rules`);
    } catch (err: any) {
      alert(`Failed to delete rule: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <ManagePageLayout>
        <div className="p-6 text-gray-900">Loading rule details…</div>
      </ManagePageLayout>
    );
  }

  return (
    <ManagePageLayout>
      <div className="mx-auto max-w-screen-md">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Edit Rule</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Up To Threshold (USD)</label>
                <input type="number" step="1" min="0" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={threshold} onChange={e => setThreshold(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Increment Amount (USD)</label>
                <input type="number" step="1" min="1" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={increment} onChange={e => setIncrement(e.target.value)} required />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <div className="flex items-center justify-between pt-4">
              <button type="button" onClick={handleDelete} className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                <span className="material-symbols-outlined">delete</span>
                <span>Delete Rule</span>
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => router.back()} className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button disabled={saving} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ManagePageLayout>
  );
} 