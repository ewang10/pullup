/**
 * ClaimsTable component for displaying recent deal claims.
 *
 * Renders a responsive table of claims with status badges, timestamps,
 * and financial breakdowns. Uses correct DB column names (reserved_at,
 * completed_at, ride_credit_amount, etc.) and WCAG-compliant markup.
 */
'use client';

interface Claim {
  id: string;
  deal_title: string;
  rider_name: string;
  status: 'reserved' | 'completed' | 'expired' | 'cancelled';
  reserved_at: string;
  completed_at: string | null;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
}

interface ClaimsTableProps {
  claims: Claim[];
}

const statusColors: Record<string, string> = {
  reserved: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function ClaimsTable({ claims }: ClaimsTableProps) {
  if (claims.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No claims yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Recent deal claims with status and financial details</caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Deal</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Rider</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Reserved</th>
            <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Completed</th>
            <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Ride Credit</th>
            <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Driver</th>
            <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Platform</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-4 font-medium text-gray-900">{claim.deal_title}</td>
              <td className="py-3 px-4 text-gray-600">{claim.rider_name}</td>
              <td className="py-3 px-4">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[claim.status]}`}>
                  {claim.status}
                </span>
              </td>
              <td className="py-3 px-4 text-gray-600">
                {new Date(claim.reserved_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="py-3 px-4 text-gray-600">
                {claim.completed_at
                  ? new Date(claim.completed_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-'}
              </td>
              <td className="py-3 px-4 text-right text-gray-900">${claim.ride_credit_amount.toFixed(2)}</td>
              <td className="py-3 px-4 text-right text-gray-900">${claim.driver_kickback_amount.toFixed(2)}</td>
              <td className="py-3 px-4 text-right text-gray-900">${claim.platform_fee_amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
