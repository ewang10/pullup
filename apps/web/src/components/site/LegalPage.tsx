/** Shared layout for the sample legal pages. */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-4xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-600">Last updated {updated}</p>
      <p role="note" className="mt-6 p-4 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900 text-sm">
        PullUp is a demo project. This is a sample policy written to describe how the demo works. It is not legal
        advice, and no real payments are processed (Stripe runs in test mode).
      </p>
      <div className="mt-8 space-y-8 text-gray-800 leading-relaxed [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </div>
  );
}
