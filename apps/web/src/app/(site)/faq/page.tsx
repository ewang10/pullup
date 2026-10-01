import type { Metadata } from 'next';
import Link from 'next/link';
import { CLAIM_COST_MIN } from '@pullup/shared';
import { SUPPORT_EMAIL } from '@/components/site/SiteFooter';

export const metadata: Metadata = {
  title: { absolute: 'PullUp FAQ' },
  description: 'Answers for riders, drivers and venues: receipts, ride credit, driver codes, payouts and billing.',
};

const GROUPS: { id: string; title: string; items: [string, string][] }[] = [
  {
    id: 'riders',
    title: 'Riders',
    items: [
      ['How much ride credit do I get?', 'Each deal shows its ride credit before you claim it. It’s half of what the venue pays for your visit.'],
      ['What if I can’t make it in time?', 'Your claim expires after its hold time and nothing happens. You can also cancel it from the claim screen. There’s no penalty.'],
      ['Which receipts do I need?', 'The deal tells you before you claim. A ride receipt is the Uber or Lyft receipt for your trip; a venue receipt is your bill. Upload them after checking in.'],
      ['How long do I have to upload receipts?', '7 days after checking in. The claim screen shows the exact date. If you need more time, contact support before the deadline.'],
      ['My receipt was rejected. What now?', 'Open the claim and tap Re-upload. Make sure the photo shows the date and total clearly.'],
      ['When can I cash out my ride credit?', 'Any time after it’s added to your Wallet. Set up payouts with Stripe once, then send it to your bank. It usually arrives in 2–3 business days.'],
      ['What is a driver code?', 'If your rideshare driver is on PullUp, adding their code to your claim gives them a bonus for bringing you. It doesn’t change your deal.'],
    ],
  },
  {
    id: 'drivers',
    title: 'Drivers',
    items: [
      ['Why do I need to be approved?', 'We check that you actively drive for a rideshare company before your code can earn bonuses. Approval usually takes 1–2 business days.'],
      ['How much do I earn?', '20% of what the venue pays for each completed visit where the rider added your code.'],
      ['When do I get paid?', 'Your bonus is added when the visit is complete and any required receipts are approved. Cash out any time after that.'],
      ['My application wasn’t approved.', 'The app shows the reason. If something was entered incorrectly, contact support with the correct details and we’ll take another look.'],
      ['My account is on hold. What about my earnings?', 'Bonuses you earned before the hold are still yours and can be cashed out, unless we’ve told you payouts are on hold while we review your account.'],
    ],
  },
  {
    id: 'venues',
    title: 'Venues',
    items: [
      ['What does PullUp cost?', `You choose what a completed visit is worth to you, at least $${CLAIM_COST_MIN}. You’re only charged when a rider checks in, and the discount itself is given at your register.`],
      ['Am I charged for no-shows?', 'No. Unused claims expire and cancelled claims are free. Visits whose required receipts aren’t approved within 7 days aren’t charged either.'],
      ['How am I charged?', 'From the bank account you link on the Billing page. Bank details are handled by Stripe; PullUp never sees your account number.'],
      ['A payment failed and my deals are paused.', 'Check your bank account (or link a different one) on the Billing page, then tap Retry on the failed charge. Your deals come back once it goes through.'],
      ['Should I require receipts?', 'A ride receipt confirms the rider took a rideshare; your bill confirms they bought something and shows you what PullUp customers spend. Requiring them adds a review step before you’re charged.'],
      ['How do riders check in?', 'They scan your venue’s PullUp QR code. Print it from the QR code page in your dashboard and keep it at the register.'],
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-4xl font-bold text-gray-900">Frequently asked questions</h1>
      <nav aria-label="Questions for" className="mt-6">
        <ul className="flex flex-wrap gap-3">
          {GROUPS.map((g) => (
            <li key={g.id}>
              <a href={`#${g.id}`} className="inline-block px-3 py-1.5 rounded-full border border-gray-400 text-gray-900 hover:bg-gray-100">
                {g.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="mt-10 scroll-mt-6" aria-labelledby={`${g.id}-heading`}>
          <h2 id={`${g.id}-heading`} className="text-2xl font-bold text-gray-900">{g.title}</h2>
          <div className="mt-4 space-y-3">
            {g.items.map(([q, a]) => (
              <details key={q} className="group card p-0">
                <summary className="cursor-pointer list-none p-4 font-medium text-gray-900 flex justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span>{q}</span>
                  <span aria-hidden="true" className="text-gray-600 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="px-4 pb-4 text-gray-700">{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-12 card" aria-labelledby="more-help-heading">
        <h2 id="more-help-heading" className="text-xl font-semibold text-gray-900">Still need help?</h2>
        <p className="mt-2 text-gray-700">
          Email us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:text-primary-600 underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>{' '}
          or see{' '}
          <Link href="/support" className="font-medium text-primary hover:text-primary-600 underline underline-offset-2">
            Contact support
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
