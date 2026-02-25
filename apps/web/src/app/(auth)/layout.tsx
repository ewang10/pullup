/**
 * Auth layout for login and registration pages.
 * Provides a centered card layout with a dark gradient background
 * and subtle decorative elements for visual interest.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen gradient-dark flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative background circles for visual interest */}
      <div
        className="absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #6C63FF 0%, transparent 70%)' }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-5"
        style={{ background: 'radial-gradient(circle, #6C63FF 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            Pull<span className="text-primary">Up</span>
          </h1>
          <p className="text-gray-400 mt-2">Venue Dashboard</p>
        </div>
        <div className="card">
          {children}
        </div>
      </div>
    </div>
  );
}
