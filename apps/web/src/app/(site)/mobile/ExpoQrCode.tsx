'use client';

import { QRCodeSVG } from 'qrcode.react';

/** QR code for the Expo Go link, with a text alternative for screen readers. */
export default function ExpoQrCode({ value }: { value: string }) {
  return (
    <QRCodeSVG
      value={value}
      size={208}
      level="M"
      marginSize={2}
      role="img"
      aria-label="QR code that opens the PullUp app in Expo Go"
      title="QR code that opens the PullUp app in Expo Go"
    />
  );
}
