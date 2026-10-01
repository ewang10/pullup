import type { Metadata } from 'next';
import Link from 'next/link';
import { CLAIM_COST_MIN } from '@pullup/shared';

export const metadata: Metadata = {
  title: { absolute: 'How PullUp works' },
  description: 'How riders, drivers and venues use PullUp, from claiming a deal to getting paid.',
};

const SECTIONS = [
  {
    id: 'riders',
    title: 'For riders',
    steps: [
      ['Find a deal', 'Open the app to see deals at venues near you, like 20% off your bill or a free appetizer.'],
      ['Claim it', 'Claiming holds the deal for you for a set time (usually two hours) while you head over.'],
      ['Ride there', 'Take an Uber or Lyft. If your driver is on PullUp, add their driver code to your claim so they earn a bonus. Your deal stays the same.'],
      ['Check in', 'At the venue, scan its PullUp QR code. Enjoy your deal at the register.'],
      ['Upload receipts if asked', 'Some deals need your ride receipt and/or your bill. Upload them in the app within 7 days.'],
      ['Get ride credit', 'Once everything is approved, ride credit lands in your Wallet. Cash it out to your bank any time.'],
    ],
  },
  {
    id: 'drivers',
    title: 'For drivers',
    steps: [
      ['Sign up and get approved', 'Tell us which rideshare app you drive for and your driver ID. We verify it, usually within 1–2 business days.'],
      ['Show your code', 'When a passenger is heading to a PullUp deal, show them the QR code in the My code tab or tell them your 8-character code.'],
      ['Earn a bonus', 'When they complete the visit, you earn 20% of what the venue pays for it.'],
      ['Cash out', 'Set up payouts with Stripe once, then send your bonuses to your bank whenever you like.'],
    ],
  },
  {
    id: 'venues',
    title: 'For venues',
    steps: [
      ['Create your account', 'Add your venue details and link a bank account. You are only charged for completed visits.'],
      ['Publish a deal', `Choose the discount, what a completed visit is worth to you (at least $${CLAIM_COST_MIN}), a daily cap and how long riders have to arrive.`],
      ['Display your QR code', 'Print the QR code from your dashboard and keep it at the register. Riders scan it to check in.'],
      ['Choose proof of visit', 'Optionally require a ride receipt and/or the bill. Receipts also show you what PullUp customers actually spend.'],
      ['Track results', 'Your dashboard shows visits, what you spent and estimated sales, updating live.'],
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-4xl font-bold text-gray-900">How PullUp works</h1>
      <p className="mt-4 text-lg text-gray-700">
        PullUp connects three groups: riders looking for a good night out, rideshare drivers bringing them there, and
        venues that want new customers. Everyone is paid only when a visit actually happens.
      </p>
      <nav aria-label="On this page" className="mt-6">
        <ul className="flex flex-wrap gap-3">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-block px-3 py-1.5 rounded-full border border-gray-400 text-gray-900 hover:bg-gray-100">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="mt-12 scroll-mt-6" aria-labelledby={`${s.id}-heading`}>
          <h2 id={`${s.id}-heading`} className="text-2xl font-bold text-gray-900">{s.title}</h2>
          <ol className="mt-6 space-y-5">
            {s.steps.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex-shrink-0 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="mt-1 text-gray-700">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="mt-14 card" aria-labelledby="money-heading">
        <h2 id="money-heading" className="text-xl font-semibold text-gray-900">Where each visit&apos;s money goes</h2>
        <p className="mt-2 text-gray-700">
          The venue pays its chosen amount per completed visit: 50% becomes the rider&apos;s ride credit, 20% is the
          driver&apos;s bonus and 30% is PullUp&apos;s fee. No-shows, cancellations and visits whose required receipts
          aren&apos;t approved within 7 days are never charged.
        </p>
        <p className="mt-4">
          <Link href="/faq" className="font-semibold text-primary hover:text-primary-600 hover:underline underline-offset-2">
            More questions? Read the FAQ →
          </Link>
        </p>
      </section>
    </div>
  );
}
