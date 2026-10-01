import Link from 'next/link';

export const SUPPORT_EMAIL = 'pullup.demo.app@gmail.com';

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-lg font-bold text-gray-900">
            Pull<span className="text-primary">Up</span>
          </p>
          <p className="mt-2 text-gray-700">
            Local deals that pay you back for the ride. A demo project; payments run in Stripe test mode.
          </p>
        </div>
        <nav aria-label="Product">
          <h2 className="font-semibold text-gray-900">Product</h2>
          <ul className="mt-2 space-y-1">
            <li><Link href="/how-it-works" className="text-gray-700 hover:text-gray-900 hover:underline">How it works</Link></li>
            <li><Link href="/mobile" className="text-gray-700 hover:text-gray-900 hover:underline">Try the app</Link></li>
            <li><Link href="/login" className="text-gray-700 hover:text-gray-900 hover:underline">Venue sign in</Link></li>
            <li><Link href="/signup" className="text-gray-700 hover:text-gray-900 hover:underline">List your venue</Link></li>
          </ul>
        </nav>
        <nav aria-label="Help and legal">
          <h2 className="font-semibold text-gray-900">Help</h2>
          <ul className="mt-2 space-y-1">
            <li><Link href="/faq" className="text-gray-700 hover:text-gray-900 hover:underline">FAQ</Link></li>
            <li><Link href="/support" className="text-gray-700 hover:text-gray-900 hover:underline">Contact support</Link></li>
            <li><Link href="/privacy" className="text-gray-700 hover:text-gray-900 hover:underline">Privacy</Link></li>
            <li><Link href="/terms" className="text-gray-700 hover:text-gray-900 hover:underline">Terms</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
