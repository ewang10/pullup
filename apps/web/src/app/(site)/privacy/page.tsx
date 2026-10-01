import type { Metadata } from 'next';
import LegalPage from '@/components/site/LegalPage';
import { SUPPORT_EMAIL } from '@/components/site/SiteFooter';

export const metadata: Metadata = {
  title: { absolute: 'PullUp privacy policy' },
  description: 'What information PullUp collects, why, who can see it, and your choices.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="September 30, 2026">
      <section aria-labelledby="collect">
        <h2 id="collect">What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your name, email and password (stored securely by our authentication provider), and whether you&apos;re a rider, driver or venue.</li>
          <li><strong>Drivers:</strong> your mobile number, rideshare platform and rideshare driver ID, so we can verify you.</li>
          <li><strong>Visits:</strong> the deals you claim, when you check in, and the driver code you add, if any.</li>
          <li><strong>Receipt photos:</strong> ride and venue receipts you upload. These are stored privately.</li>
          <li><strong>Venues:</strong> venue details, photos you upload, deals, and the bill totals our team reads from approved venue receipts.</li>
          <li><strong>Payments:</strong> bank and identity details for payouts and billing are entered on Stripe&apos;s site and kept by Stripe. We store only a Stripe account reference and, for venues, the bank name and last four digits.</li>
        </ul>
      </section>

      <section aria-labelledby="device">
        <h2 id="device">Location and camera</h2>
        <p>
          The app asks for your location to show nearby deals and your camera to scan QR codes. Your location is used
          to search for deals and isn&apos;t saved to your account. Camera images used for scanning aren&apos;t stored.
          You can decline both and still browse.
        </p>
      </section>

      <section aria-labelledby="see">
        <h2 id="see">Who can see what</h2>
        <ul>
          <li><strong>Venues</strong> see claims for their own deals, with riders shown as first name and last initial.</li>
          <li><strong>Drivers</strong> see the riders who added their code (first name and last initial) and their visits, never emails.</li>
          <li><strong>PullUp staff</strong> see what they need to review driver applications and receipts.</li>
          <li><strong>Service providers</strong> host and process data for us: Supabase (database, authentication and storage), Vercel (website) and Stripe (payments).</li>
        </ul>
        <p className="mt-3">We don&apos;t sell personal information or use it for advertising.</p>
      </section>

      <section aria-labelledby="cookies">
        <h2 id="cookies">Cookies</h2>
        <p>
          The website uses cookies only to keep you signed in. There are no advertising or tracking cookies.
        </p>
      </section>

      <section aria-labelledby="choices">
        <h2 id="choices">Your choices</h2>
        <p>
          You can update your details in the app or dashboard. To get a copy of your data or delete your account,
          email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. PullUp is for people 18 and older; deals
          involving alcohol require you to be 21 or older.
        </p>
      </section>
    </LegalPage>
  );
}
