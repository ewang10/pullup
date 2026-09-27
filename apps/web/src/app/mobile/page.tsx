/**
 * Public "Try the mobile app" page for portfolio visitors.
 *
 * Explains how to open the Expo Go preview of the rider/driver app in three
 * steps: a QR code on desktop, an "Open in Expo Go" button on phones. The
 * optional walkthrough video and demo logins appear only when their
 * NEXT_PUBLIC_* env vars are set.
 */
import Link from 'next/link';
import ExpoQrCode from './ExpoQrCode';

// Stable link to the latest update on the EAS "preview" channel.
const EXPO_GO_URL =
  process.env.NEXT_PUBLIC_EXPO_GO_URL ||
  'exp://u.expo.dev/c7d5a204-454c-43c5-a89c-5adcb1cda834?channel-name=preview&runtime-version=exposdk:57.0.0';
const VIDEO_URL = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;

const DEMO_LOGINS = [
  {
    role: 'Rider',
    email: process.env.NEXT_PUBLIC_DEMO_RIDER_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_RIDER_PASSWORD,
  },
  {
    role: 'Driver',
    email: process.env.NEXT_PUBLIC_DEMO_DRIVER_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_DRIVER_PASSWORD,
  },
].filter((l) => l.email && l.password);

const APP_STORE_URL = 'https://apps.apple.com/app/expo-go/id982107779';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=host.exp.exponent';

function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="flex-shrink-0 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold"
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

function Video({ url }: { url: string }) {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return (
      <video controls preload="metadata" className="w-full rounded-lg bg-black" aria-label="Walkthrough of the PullUp mobile app">
        <source src={url} />
      </video>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ paddingTop: '56.25%' }}>
      <iframe
        src={url}
        title="Walkthrough of the PullUp mobile app"
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export default function TryMobilePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="gradient-dark">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <p className="text-2xl font-bold text-white">
            Pull<span className="text-primary-300">Up</span>
          </p>
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-white">Try the mobile app</h1>
          <p className="mt-3 text-lg text-gray-300 max-w-2xl">
            Riders find deals at local venues and earn ride credit for showing up. Drivers earn a bonus for
            bringing them. Open the real app on your phone in about a minute. No app store needed.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {VIDEO_URL && (
          <section className="card" aria-labelledby="video-heading">
            <h2 id="video-heading" className="text-xl font-semibold text-gray-900 mb-1">
              Watch a quick tour
            </h2>
            <p className="text-gray-600 mb-4">Don&apos;t want to install anything? Here&apos;s the app in action.</p>
            <Video url={VIDEO_URL} />
          </section>
        )}

        <section className="card" aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="text-xl font-semibold text-gray-900">
            Open it on your phone
          </h2>
          <p className="text-gray-600 mt-1">Works on iPhone and Android.</p>

          <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
            <ol className="space-y-6">
              <li className="flex gap-4">
                <StepNumber n={1} />
                <div>
                  <h3 className="font-semibold text-gray-900">Install Expo Go (free)</h3>
                  <p className="text-gray-700 mt-1">
                    Expo Go lets you run apps that are still in development, without waiting for an app store.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <a href={APP_STORE_URL} className="btn-secondary" target="_blank" rel="noopener noreferrer">
                      App Store<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <a href={PLAY_STORE_URL} className="btn-secondary" target="_blank" rel="noopener noreferrer">
                      Google Play<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <StepNumber n={2} />
                <div>
                  <h3 className="font-semibold text-gray-900">
                    <span className="hidden md:inline">Scan the code with your phone&apos;s camera</span>
                    <span className="md:hidden">Open PullUp in Expo Go</span>
                  </h3>
                  <p className="text-gray-700 mt-1 hidden md:block">
                    Point your phone&apos;s regular camera app at the code, then tap the link that pops up.
                  </p>
                  <div className="md:hidden mt-3">
                    <a href={EXPO_GO_URL} className="btn-primary inline-block">
                      Open in Expo Go
                    </a>
                    <p className="text-sm text-gray-600 mt-2">
                      On a computer instead? Scan the code on this page with your phone.
                    </p>
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <StepNumber n={3} />
                <div>
                  <h3 className="font-semibold text-gray-900">Tap &ldquo;Open&rdquo;, then sign up or sign in</h3>
                  <p className="text-gray-700 mt-1">
                    PullUp loads inside Expo Go. Create a free rider or driver account
                    {DEMO_LOGINS.length > 0 ? ', or use a demo login below' : ''}.
                  </p>
                </div>
              </li>
            </ol>

            <div className="hidden md:flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-5">
              <ExpoQrCode value={EXPO_GO_URL} />
              <p className="text-sm text-gray-700 text-center max-w-[14rem]">
                Scan with your phone&apos;s camera
              </p>
            </div>
          </div>
        </section>

        {DEMO_LOGINS.length > 0 && (
          <section className="card" aria-labelledby="logins-heading">
            <h2 id="logins-heading" className="text-xl font-semibold text-gray-900">Demo logins</h2>
            <p className="text-gray-600 mt-1">Pre-filled accounts with sample activity, so you can look around right away.</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {DEMO_LOGINS.map((l) => (
                <div key={l.role} className="rounded-lg bg-indigo-50 border border-indigo-200 p-4">
                  <dt className="font-semibold text-gray-900">{l.role}</dt>
                  <dd className="mt-1 text-sm text-gray-800 break-all">
                    <span className="text-gray-700">Email:</span> {l.email}
                    <br />
                    <span className="text-gray-700">Password:</span> {l.password}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="card" aria-labelledby="good-to-know-heading">
          <h2 id="good-to-know-heading" className="text-xl font-semibold text-gray-900">Good to know</h2>
          <ul className="mt-3 space-y-3 text-gray-700 list-disc pl-5">
            <li>
              <strong className="text-gray-900">No deals near you?</strong> You&apos;ll see PullUp Demo Café, a sample
              venue in Sacramento, so you can still explore claiming a deal.
            </li>
            <li>
              <strong className="text-gray-900">Location and camera permissions</strong> are used to show nearby deals
              and scan a venue&apos;s QR code. You can say no and still browse.
            </li>
            <li>
              <strong className="text-gray-900">Expo Go&apos;s home screen</strong> mentions development servers and
              &ldquo;npx expo start&rdquo;. That&apos;s for developers; you can ignore it.
            </li>
          </ul>

          <details className="mt-5 rounded-lg border border-gray-200 p-4">
            <summary className="cursor-pointer font-medium text-gray-900">Trouble opening the app?</summary>
            <ul className="mt-3 space-y-2 text-gray-700 list-disc pl-5">
              <li>
                <strong className="text-gray-900">&ldquo;Incompatible with this version of Expo Go&rdquo;:</strong> update
                Expo Go from the App Store or Google Play, then scan again.
              </li>
              <li>
                <strong className="text-gray-900">Nothing happens after scanning:</strong> make sure Expo Go is installed,
                then open this page on your phone and tap &ldquo;Open in Expo Go&rdquo;.
              </li>
              <li>
                <strong className="text-gray-900">Showing an old version:</strong> close Expo Go completely and open
                PullUp again from &ldquo;Recently opened&rdquo;.
              </li>
            </ul>
          </details>
        </section>

        <section className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" aria-labelledby="venue-heading">
          <div>
            <h2 id="venue-heading" className="text-xl font-semibold text-gray-900">See the venue side too</h2>
            <p className="text-gray-600 mt-1">
              Venues create deals and track visits in a web dashboard. A demo login is on the sign-in page.
            </p>
          </div>
          <Link href="/login" className="btn-primary text-center whitespace-nowrap">
            Open venue dashboard
          </Link>
        </section>
      </main>

      <footer className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 text-sm text-gray-600">
        Built with Expo (React Native), Next.js, Supabase and Stripe (test mode).
      </footer>
    </div>
  );
}
