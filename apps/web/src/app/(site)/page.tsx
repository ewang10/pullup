import type { Metadata } from 'next';
import Link from 'next/link';
import { calculateClaimCosts, CLAIM_COST_MIN } from '@pullup/shared';

export const metadata: Metadata = {
  title: { absolute: 'PullUp: local deals that cover your ride' },
  description:
    'PullUp gives riders ride credit for visiting local venues, pays drivers a bonus for bringing them, and charges venues only for customers who show up.',
  openGraph: {
    title: 'PullUp: local deals that cover your ride',
    description: 'Ride credit for riders, bonuses for drivers, and pay-per-visit customers for venues.',
  },
};

// Homepage example: the minimum cost per visit against a typical bill, so the
// cost reads as a share of real revenue rather than a bare fee.
const EXAMPLE_COST = CLAIM_COST_MIN;
const EXAMPLE_BILL = 60;

const AUDIENCES = [
  {
    title: 'Riders',
    lead: 'Get a deal and money back for the ride there.',
    points: [
      'Find deals at venues near you',
      'Claim one, take a rideshare there and check in',
      'Earn ride credit and cash it out to your bank',
    ],
    cta: { href: '/mobile', label: 'Try the app' },
  },
  {
    title: 'Drivers',
    lead: 'Earn a bonus for every passenger you bring.',
    points: [
      'Show riders your driver code',
      'Earn 20% of what the venue pays for each visit',
      'Cash out bonuses whenever you like',
    ],
    cta: { href: '/mobile', label: 'Try the app' },
  },
  {
    title: 'Venues',
    lead: 'Pay only for customers who actually walk in.',
    points: [
      'Publish deals in minutes',
      'Riders check in with your QR code',
      'See visits, spend and estimated sales live',
    ],
    cta: { href: '/signup', label: 'List your venue' },
  },
];

const STEPS = [
  { title: 'Claim', body: 'A rider claims a deal and has a set time to get there.' },
  { title: 'Ride', body: 'They take an Uber or Lyft. If their driver is on PullUp, they add the driver’s code.' },
  { title: 'Check in', body: 'At the venue they scan its PullUp QR code. That’s a completed visit.' },
  { title: 'Get paid', body: 'Once any receipts are approved, the rider gets ride credit and the driver gets a bonus.' },
];

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function HomePage() {
  const split = calculateClaimCosts(EXAMPLE_COST);

  return (
    <>
      <section className="gradient-dark border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h1 className="text-4xl sm:text-5xl font-bold text-white max-w-3xl leading-tight">
            Local deals that cover your ride.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-200 max-w-2xl">
            PullUp gives riders ride credit for visiting local venues, pays drivers a bonus for bringing them, and
            charges venues only for customers who show up.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/mobile" className="px-5 py-3 rounded-lg font-semibold bg-white text-gray-900 hover:bg-gray-100">
              Try the app
            </Link>
            <Link href="/login" className="px-5 py-3 rounded-lg font-semibold text-white border border-white/60 hover:bg-white/10">
              See the venue dashboard demo
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16" aria-labelledby="audiences-heading">
        <h2 id="audiences-heading" className="text-3xl font-bold text-gray-900">Built for everyone in the ride</h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <li key={a.title} className="card flex flex-col">
              <h3 className="text-xl font-semibold text-gray-900">{a.title}</h3>
              <p className="mt-1 text-gray-700">{a.lead}</p>
              <ul className="mt-4 space-y-2 text-gray-800 list-disc pl-5 flex-1">
                {a.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <Link href={a.cta.href} className="mt-6 font-semibold text-primary hover:text-primary-600 hover:underline underline-offset-2">
                {a.cta.label}
                <span className="sr-only"> ({a.title.toLowerCase()})</span> →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border-y border-gray-200" aria-labelledby="steps-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 id="steps-heading" className="text-3xl font-bold text-gray-900">How a visit works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-1 text-gray-700">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="inline-block mt-8 font-semibold text-primary hover:text-primary-600 hover:underline underline-offset-2">
            Read how it works in detail →
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid gap-10 lg:grid-cols-2 items-start" aria-labelledby="money-heading">
        <div>
          <h2 id="money-heading" className="text-3xl font-bold text-gray-900">Where the money goes</h2>
          <p className="mt-4 text-gray-700 text-lg">
            Venues choose what a completed visit is worth to them (at least {money(CLAIM_COST_MIN)}). PullUp splits it
            the same way every time. The deal itself, like 20% off, is given at the register, and the venue keeps
            everything the customer spends.
          </p>
          <p className="mt-4 text-gray-700">
            Nobody is paid for a no-show. If a deal needs receipts and they aren&apos;t approved within 7 days, the
            visit isn&apos;t charged.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-900">Example: a guest checks in and spends {money(EXAMPLE_BILL)}</h3>
          <dl className="mt-4 divide-y divide-gray-200">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-gray-800">The venue keeps the bill</dt>
              <dd className="font-semibold text-gray-900">{money(EXAMPLE_BILL)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-gray-800">
                The venue pays for the visit
                <span className="block text-sm text-gray-600">
                  About {Math.round((EXAMPLE_COST / EXAMPLE_BILL) * 100)}% of the bill, and only because they showed up
                </span>
              </dt>
              <dd className="font-semibold text-gray-900">{money(EXAMPLE_COST)}</dd>
            </div>
          </dl>
          <h4 className="mt-6 text-sm font-semibold text-gray-900">Where that {money(EXAMPLE_COST)} goes</h4>
          <dl className="mt-2 divide-y divide-gray-200">
            {[
              ['Rider’s ride credit (50%)', split.ride_credit_amount],
              ['Driver’s bonus (20%)', split.driver_kickback_amount],
              ['PullUp fee (30%)', split.platform_fee_amount],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-3">
                <dt className="text-gray-800">{label}</dt>
                <dd className="font-semibold text-gray-900">{money(value as number)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="text-3xl font-bold text-gray-900">Verified, not just promised</h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          <li className="card">
            <h3 className="font-semibold text-gray-900">Real check-ins</h3>
            <p className="mt-2 text-gray-700">A visit only counts when the rider scans the venue&apos;s own QR code.</p>
          </li>
          <li className="card">
            <h3 className="font-semibold text-gray-900">Receipts reviewed by people</h3>
            <p className="mt-2 text-gray-700">
              Deals can require a ride receipt and the bill. Our team approves them before anyone is paid.
            </p>
          </li>
          <li className="card">
            <h3 className="font-semibold text-gray-900">Approved drivers only</h3>
            <p className="mt-2 text-gray-700">
              Drivers are checked against their rideshare account before their code can earn a bonus.
            </p>
          </li>
        </ul>
      </section>

      <section className="gradient-dark" aria-labelledby="cta-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 id="cta-heading" className="text-2xl sm:text-3xl font-bold text-white">See it for yourself</h2>
            <p className="mt-2 text-gray-200">Demo logins are ready for the app and the venue dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/mobile" className="px-5 py-3 rounded-lg font-semibold bg-white text-gray-900 hover:bg-gray-100">
              Try the app
            </Link>
            <Link href="/faq" className="px-5 py-3 rounded-lg font-semibold text-white border border-white/60 hover:bg-white/10">
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
