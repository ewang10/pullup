import type { Metadata } from 'next';
import LegalPage from '@/components/site/LegalPage';
import { SUPPORT_EMAIL } from '@/components/site/SiteFooter';
import { CLAIM_COST_MIN } from '@pullup/shared';

export const metadata: Metadata = {
  title: { absolute: 'PullUp terms of service' },
  description: 'The rules for using PullUp as a rider, driver or venue.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="September 30, 2026">
      <section aria-labelledby="using">
        <h2 id="using">Using PullUp</h2>
        <p>
          You must be 18 or older and give accurate information. You&apos;re responsible for activity on your account,
          so keep your password private.
        </p>
      </section>

      <section aria-labelledby="riders">
        <h2 id="riders">Riders</h2>
        <ul>
          <li>A claim holds a deal for the time shown. Unused claims expire.</li>
          <li>A visit counts when you scan the venue&apos;s PullUp QR code there in person.</li>
          <li>If a deal requires receipts, upload genuine receipts for that visit within 7 days. Ride credit is added once they&apos;re approved.</li>
          <li>Only add the code of the driver who actually drove you.</li>
        </ul>
      </section>

      <section aria-labelledby="drivers">
        <h2 id="drivers">Drivers</h2>
        <ul>
          <li>Your account must be approved before your code earns bonuses. Give your real rideshare details.</li>
          <li>You earn a bonus only for riders you actually drove to the venue.</li>
          <li>We may suspend an account that breaks these terms. Bonuses earned before a suspension remain yours unless we hold them while investigating suspected fraud.</li>
        </ul>
      </section>

      <section aria-labelledby="venues">
        <h2 id="venues">Venues</h2>
        <ul>
          <li>You set what a completed visit is worth (at least ${CLAIM_COST_MIN}) and honor the deals you publish.</li>
          <li>You authorize PullUp to debit your linked bank account for completed visits. You aren&apos;t charged for no-shows, cancellations, or visits whose required receipts aren&apos;t approved within 7 days.</li>
          <li>If a payment fails, your deals are paused until the charge is paid.</li>
          <li>Photos and descriptions must be accurate and appropriate. We may remove content that isn&apos;t.</li>
        </ul>
      </section>

      <section aria-labelledby="not-allowed">
        <h2 id="not-allowed">Not allowed</h2>
        <ul>
          <li>Fake or altered receipts, or checking in without visiting</li>
          <li>Sharing driver codes for rides that didn&apos;t happen</li>
          <li>Interfering with the service or accessing other people&apos;s accounts</li>
        </ul>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes and contact</h2>
        <p>
          We may update these terms and will change the date above when we do. Questions? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
