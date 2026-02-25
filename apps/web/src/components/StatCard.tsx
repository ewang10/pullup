/**
 * StatCard component for displaying key metrics on the dashboard.
 * Renders a titled card with a numeric value, optional change indicator,
 * and a decorative icon. Includes WCAG-compliant ARIA attributes and
 * modern hover effects with a gradient accent border.
 */

interface StatCardProps {
  /** Label describing the metric */
  title: string;
  /** The primary metric value to display */
  value: string | number;
  /** Optional change description (e.g., "+12% from last month") */
  change?: string;
  /** Sentiment of the change for color coding */
  changeType?: 'positive' | 'negative' | 'neutral';
  /** Decorative icon rendered beside the metric */
  icon: React.ReactNode;
}

export default function StatCard({ title, value, change, changeType = 'neutral', icon }: StatCardProps) {
  const changeColors = {
    positive: 'text-green-600 bg-green-50',
    negative: 'text-red-600 bg-red-50',
    neutral: 'text-gray-600 bg-gray-50',
  };

  return (
    <div className="card card-hover" role="group" aria-label={title} style={{ borderTop: '3px solid #6C63FF' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <span
              className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${changeColors[changeType]}`}
            >
              {change}
            </span>
          )}
        </div>
        <div className="p-3 bg-primary-50 rounded-lg text-primary" aria-hidden="true">
          {icon}
        </div>
      </div>
    </div>
  );
}
