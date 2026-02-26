'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import {
  CLAIM_COST_MIN,
  SPLIT_RIDE_CREDIT,
  SPLIT_DRIVER_KICKBACK,
  SPLIT_PLATFORM_FEE,
  calculateClaimCosts,
} from '@pullup/shared';

interface DealFormData {
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  cost_per_claim: number;
  daily_cap: number;
  hold_duration_minutes: number;
  is_active: boolean;
}

interface DealFormProps {
  initialData?: Partial<DealFormData> & { id?: string };
  venueId: string;
  mode: 'create' | 'edit';
}

const defaultFormData: DealFormData = {
  title: '',
  description: '',
  discount_type: 'percentage',
  discount_value: 10,
  cost_per_claim: 10,
  daily_cap: 50,
  hold_duration_minutes: 120,
  is_active: true,
};

export default function DealForm({ initialData, venueId, mode }: DealFormProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [formData, setFormData] = useState<DealFormData>({
    ...defaultFormData,
    ...initialData,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateField = (field: keyof DealFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Live preview of the cost breakdown
  const breakdown = calculateClaimCosts(formData.cost_per_claim);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.cost_per_claim < CLAIM_COST_MIN) {
      setError(`Cost per claim must be at least $${CLAIM_COST_MIN.toFixed(2)}.`);
      return;
    }

    setLoading(true);

    try {
      const { cost_per_claim, ...rest } = formData;
      const costs = calculateClaimCosts(cost_per_claim);

      const payload = {
        ...rest,
        ...costs,
        venue_id: venueId,
      };

      if (mode === 'create') {
        const { error } = await supabase.from('deals').insert(payload);
        if (error) throw error;
      } else if (initialData?.id) {
        const { error } = await supabase
          .from('deals')
          .update(payload)
          .eq('id', initialData.id);
        if (error) throw error;
      }

      router.push('/deals');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save deal';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Deal title
        </label>
        <input
          id="title"
          type="text"
          value={formData.title}
          onChange={(e) => updateField('title', e.target.value)}
          className="input-field"
          placeholder="e.g., 20% off dinner"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          className="input-field min-h-[100px]"
          placeholder="Describe the deal for riders..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="discount_type" className="block text-sm font-medium text-gray-700 mb-1">
            Discount type
          </label>
          <select
            id="discount_type"
            value={formData.discount_type}
            onChange={(e) => updateField('discount_type', e.target.value)}
            className="input-field"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed_amount">Fixed amount ($)</option>
          </select>
        </div>
        <div>
          <label htmlFor="discount_value" className="block text-sm font-medium text-gray-700 mb-1">
            Discount value
          </label>
          <input
            id="discount_value"
            type="number"
            min={0}
            step={formData.discount_type === 'percentage' ? 1 : 0.01}
            value={formData.discount_value}
            onChange={(e) => updateField('discount_value', parseFloat(e.target.value))}
            className="input-field"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="cost_per_claim" className="block text-sm font-medium text-gray-700 mb-1">
          Cost per claim ($)
        </label>
        <input
          id="cost_per_claim"
          type="number"
          min={CLAIM_COST_MIN}
          step={0.5}
          value={formData.cost_per_claim}
          onChange={(e) => updateField('cost_per_claim', parseFloat(e.target.value) || CLAIM_COST_MIN)}
          className="input-field"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Minimum ${CLAIM_COST_MIN.toFixed(2)} per claim. This is what your venue pays for each completed claim.
        </p>

        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 space-y-1">
          <p className="font-medium text-gray-700 mb-2">Cost breakdown per claim:</p>
          <div className="flex justify-between">
            <span>Rider ride credit ({(SPLIT_RIDE_CREDIT * 100).toFixed(0)}%)</span>
            <span className="font-medium">${breakdown.ride_credit_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Driver referral bonus ({(SPLIT_DRIVER_KICKBACK * 100).toFixed(0)}%)</span>
            <span className="font-medium">${breakdown.driver_kickback_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Platform fee ({(SPLIT_PLATFORM_FEE * 100).toFixed(0)}%)</span>
            <span className="font-medium">${breakdown.platform_fee_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-semibold text-gray-900">
            <span>Total</span>
            <span>${formData.cost_per_claim.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="daily_cap" className="block text-sm font-medium text-gray-700 mb-1">
            Daily cap (max claims/day)
          </label>
          <input
            id="daily_cap"
            type="number"
            min={1}
            value={formData.daily_cap}
            onChange={(e) => updateField('daily_cap', parseInt(e.target.value))}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="hold_duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">
            Hold duration (minutes)
          </label>
          <input
            id="hold_duration_minutes"
            type="number"
            min={5}
            max={120}
            value={formData.hold_duration_minutes}
            onChange={(e) => updateField('hold_duration_minutes', parseInt(e.target.value))}
            className="input-field"
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
          Active
        </label>
        <button
          type="button"
          id="is_active"
          role="switch"
          aria-checked={formData.is_active}
          onClick={() => setFormData((prev) => ({ ...prev, is_active: !prev.is_active }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            formData.is_active ? 'bg-primary' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              formData.is_active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-gray-500">
          {formData.is_active ? 'Deal is visible and claimable' : 'Deal is hidden'}
        </span>
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading
            ? 'Saving...'
            : mode === 'create'
            ? 'Create deal'
            : 'Update deal'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/deals')}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
