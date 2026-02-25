'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

interface DealFormData {
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
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
  ride_credit_amount: 5,
  driver_kickback_amount: 2,
  platform_fee_amount: 1,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        ...formData,
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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="ride_credit_amount" className="block text-sm font-medium text-gray-700 mb-1">
            Ride credit ($)
          </label>
          <input
            id="ride_credit_amount"
            type="number"
            min={0}
            step={0.01}
            value={formData.ride_credit_amount}
            onChange={(e) => updateField('ride_credit_amount', parseFloat(e.target.value))}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="driver_kickback_amount" className="block text-sm font-medium text-gray-700 mb-1">
            Driver kickback ($)
          </label>
          <input
            id="driver_kickback_amount"
            type="number"
            min={0}
            step={0.01}
            value={formData.driver_kickback_amount}
            onChange={(e) => updateField('driver_kickback_amount', parseFloat(e.target.value))}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="platform_fee_amount" className="block text-sm font-medium text-gray-700 mb-1">
            Platform fee ($)
          </label>
          <input
            id="platform_fee_amount"
            type="number"
            min={0}
            step={0.01}
            value={formData.platform_fee_amount}
            onChange={(e) => updateField('platform_fee_amount', parseFloat(e.target.value))}
            className="input-field"
            required
          />
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
