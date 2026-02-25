# PullUp Mobile App

Expo Router app for riders and drivers. Riders browse and claim deals at local venues, while drivers earn kickbacks by referring riders.

## Navigation Flow

```
Welcome
├── Sign In
│   └── Tabs (role-based)
└── Sign Up (select role: rider or driver)
    └── Tabs (role-based)

Tabs (Rider)
├── Map            # Map view of nearby venues with active deals
├── Browse         # List/search deals by category, distance, etc.
├── Claims         # Active and past claimed deals
└── Profile        # Account settings, history

Tabs (Driver)
├── Map            # Map view of nearby venues
├── Browse         # Browse available deals to share
├── Referrals      # Track referred riders and status
├── Earnings       # Kickback earnings and payout history
└── Profile        # Account settings, payout info

Deal Detail
└── Claim Deal
    └── Visit Venue
        └── Scan QR Code
            └── Upload Receipt (if required)
```

## How to Run

```bash
cd apps/mobile
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go on a physical device.

## Folder Structure

```
apps/mobile/
├── app/                 # File-based routing (Expo Router)
│   ├── (tabs)/          # Tab navigator screens
│   ├── deal/[id].tsx    # Deal detail screen
│   ├── welcome.tsx      # Welcome / onboarding
│   ├── sign-in.tsx      # Sign in
│   ├── sign-up.tsx      # Sign up with role selection
│   └── _layout.tsx      # Root layout
├── components/          # Reusable UI components
├── lib/
│   ├── auth.ts          # Auth helpers and session management
│   ├── api.ts           # Supabase query functions
│   ├── store.ts         # Zustand state stores
│   └── supabase.ts      # Supabase client initialization
├── assets/              # Images, fonts, static files
└── app.json             # Expo configuration
```

## Role-Based Navigation

The app reads the user's role from `user_metadata.role` (set during sign-up). Based on the role:

- **Riders** see: Map, Browse, Claims, Profile
- **Drivers** see: Map, Browse, Referrals, Earnings, Profile

Tab visibility is controlled in the tab layout component. Unauthorized access to role-specific screens is redirected.

## Auth Flow

Authentication is handled through Supabase Auth:

1. User signs up and selects a role (rider or driver).
2. The role is stored in `user_metadata` on the Supabase auth user.
3. A database trigger syncs the role to the `users` table.
4. On app launch, the session is restored from secure storage.
5. Protected routes redirect unauthenticated users to the welcome screen.

## Deal Claiming Flow

1. **Browse** -- Find deals on the map or in the browse list.
2. **Claim** -- Tap a deal and press "Claim." This creates a `deal_claims` record with status `claimed` and starts an expiration window.
3. **Visit venue** -- Travel to the venue within the claim window.
4. **Scan QR** -- At the venue, scan the venue's QR code to verify arrival.
5. **Upload receipt** -- If the deal requires proof of purchase, upload a photo of the receipt.
6. **Complete** -- The claim status moves to `completed` and any driver referral kickback is processed.
