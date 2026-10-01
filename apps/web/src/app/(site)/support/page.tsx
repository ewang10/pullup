import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/components/site/SiteFooter';

export const metadata: Metadata = {
  title: { absolute: 'Contact PullUp support' },
  description: 'How to reach PullUp support about claims, receipts, payouts, driver approval or venue billing.',
};

const subject = encodeURIComponent('PullUp support request');
const body = encodeURIComponent(
  'Account email:\nI use PullUp as a (rider / driver / venue):\nWhat happened:\n\n'
);

export default function SupportPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-4xl font-bold text-gray-900">Contact support</h1>
      <p className="mt-4 text-lg text-gray-700">
        Most questions are answered in the{' '}
        <Link href="/faq" className="font-medium text-primary hover:text-primary-600 underline underline-offset-2">
          FAQ
        </Link>
        . If you still need help, email us and we&apos;ll get back to you within 1–2 business days.
      </p>

      <section className="mt-8 card" aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-xl font-semibold text-gray-900">Email support</h2>
        <p className="mt-2 text-gray-800 break-all">{SUPPORT_EMAIL}</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`} className="btn-primary inline-block mt-4">
          Write an email
        </a>
        <h3 className="mt-6 font-semibold text-gray-900">To help us answer quickly, include:</h3>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-gray-700">
          <li>The email address on your PullUp account</li>
          <li>Whether you use PullUp as a rider, driver or venue</li>
          <li>The deal or venue involved and roughly when it happened</li>
          <li>For receipt or payout questions, the date of the visit</li>
        </ul>
        <p className="mt-4 text-sm text-gray-600">
          Never send passwords or full bank account numbers. We will never ask for them.
        </p>
      </section>

      <section className="mt-8 card" aria-labelledby="common-heading">
        <h2 id="common-heading" className="text-xl font-semibold text-gray-900">Common requests</h2>
        <ul className="mt-3 space-y-3 text-gray-700">
          <li>
            <span className="font-medium text-gray-900">More time to upload receipts:</span> email us before the
            deadline shown on your claim.
          </li>
          <li>
            <span className="font-medium text-gray-900">Driver application or account on hold:</span> reply with the
            correct rideshare details or a screenshot of your driver profile.
          </li>
          <li>
            <span className="font-medium text-gray-900">Venue billing:</span> most payment issues can be fixed from the
            Billing page by updating your bank account and retrying.
          </li>
        </ul>
      </section>

      <p className="mt-8 text-sm text-gray-600">
        PullUp is a demo project, so this inbox is checked occasionally.
      </p>
    </div>
  );
}
