/**
 * ClaimsTable component for displaying recent deal claims.
 *
 * Shows who claimed which deal, a plain-language status, and what the visit
 * cost the venue. Only completed visits are charged, so other rows show "—".
 */
'use client';

import { CLAIM_STATUS, NOT_VERIFIED_STATUS, formatCurrency, type ClaimStatus } from '@/lib/claims';

export interface ClaimRow {
  id: string;
  deal_title: string;
  rider_name: string;
  status: ClaimStatus;
  reserved_at: string;
  completed_at: string | null;
  /** Venue's cost for this deal per completed visit */
  cost: number;
  /** Closed without approved receipts: not charged */
  unverified?: boolean;
}

interface ClaimsTableProps {
  claims: ClaimRow[];
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ClaimsTable({ claims }: ClaimsTableProps) {
  if (claims.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No claims yet. When riders reserve one of your deals, it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-xs text-gray-600 pb-3">
          You&apos;re charged only for completed visits. Riders shown by first name and last initial.
        </caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Deal</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Rider</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Claimed</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Visited</th>
            <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Your cost</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => {
            const status = claim.unverified ? NOT_VERIFIED_STATUS : CLAIM_STATUS[claim.status];
            return (
              <tr key={claim.id} className="border-b border-gray-100 hover:bg-gray-50">
                <th scope="row" className="text-left py-3 px-4 font-medium text-gray-900">{claim.deal_title}</th>
                <td className="py-3 px-4 text-gray-700">{claim.rider_name}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.className}`}
                    title={status.hint}
                  >
                    {status.label}
                  </span>
                  <span className="sr-only">: {status.hint}</span>
                </td>
                <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{formatDateTime(claim.reserved_at)}</td>
                <td className="py-3 px-4 text-gray-700 whitespace-nowrap">
                  {claim.completed_at ? formatDateTime(claim.completed_at) : <span aria-label="Not visited">—</span>}
                </td>
                <td className="py-3 px-4 text-right text-gray-900 whitespace-nowrap">
                  {claim.status === 'completed' && !claim.unverified ? formatCurrency(claim.cost) : <span aria-label="No charge">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
