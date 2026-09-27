/**
 * StatCard component for displaying key metrics on the dashboard.
 * Renders a titled card with a value, a plain-language description of what
 * the number means, and an optional comparison with the previous period.
 */

interface StatCardProps {
  /** Label describing the metric */
  title: string;
  /** The primary metric value to display */
  value: string | number;
  /** One line explaining what the metric counts */
  description?: string;
  /** Optional change description (e.g., "+12% vs. previous 30 days") */
  change?: string;
  /** Sentiment of the change for color coding */
  changeType?: 'positive' | 'negative' | 'neutral';
  /** Decorative icon rendered beside the metric */
  icon: React.ReactNode;
}

export default function StatCard({ title, value, description, change, changeType = 'neutral', icon }: StatCardProps) {
  // Text/background pairs meet WCAG AA (>= 4.5:1).
  const changeColors = {
    positive: 'text-green-800 bg-green-50',
    negative: 'text-red-800 bg-red-50',
    neutral: 'text-gray-700 bg-gray-100',
  };

  return (
    <section className="card card-hover border-t-4 border-t-primary" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-gray-600">{title}</h2>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
          {change && (
            <p className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${changeColors[changeType]}`}>
              {change}
            </p>
          )}
        </div>
        <div className="p-3 bg-primary-50 rounded-lg text-primary" aria-hidden="true">
          {icon}
        </div>
      </div>
    </section>
  );
}
