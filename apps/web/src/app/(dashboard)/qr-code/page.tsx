'use client';

import { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

export default function QRCodePage() {
  const supabase = createSupabaseBrowserClient();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchVenue() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: venue } = await supabase
        .from('venues')
        .select('id, name')
        .eq('owner_user_id', user.id)
        .single();

      if (venue) {
        setVenueId(venue.id);
        setVenueName(venue.name);
      }
      setLoading(false);
    }

    fetchVenue();
  }, [supabase]);

  const qrValue = venueId ? `pullup://venue/${venueId}/verify` : '';

  const handleDownload = () => {
    if (!qrRef.current) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `pullup-qr-${venueName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = pngUrl;
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !qrRef.current) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>PullUp QR Code - ${venueName}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: system-ui, sans-serif;
            }
            h1 { color: #1A1A2E; margin-bottom: 8px; }
            p { color: #6b7280; margin-top: 0; }
            .qr-container { margin: 24px 0; }
            .footer { color: #9ca3af; font-size: 14px; margin-top: 24px; }
          </style>
        </head>
        <body>
          <h1>${venueName}</h1>
          <p>Scan to verify your visit</p>
          <div class="qr-container">${svgData}</div>
          <p class="footer">Powered by PullUp</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!venueId) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">No venue found. Please complete your venue setup.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Venue QR Code</h1>

      <div className="max-w-lg mx-auto">
        <div className="card text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{venueName}</h2>
          <p className="text-gray-500 mb-6">
            Display this QR code at your venue for riders to scan and verify their visit.
          </p>

          <div ref={qrRef} className="inline-block p-6 bg-white rounded-xl border-2 border-gray-100 mb-6">
            <QRCodeSVG
              value={qrValue}
              size={256}
              bgColor="#ffffff"
              fgColor="#1A1A2E"
              level="H"
              includeMargin={false}
            />
          </div>

          <p className="text-xs text-gray-400 font-mono mb-6 break-all">{qrValue}</p>

          <div className="flex gap-3 justify-center">
            <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PNG
            </button>
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>

        <div className="card mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">How it works</h3>
          <ol className="space-y-3 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-50 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <span>Print and display the QR code at your entrance or checkout area.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-50 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <span>Riders who claimed a deal scan the QR code with the PullUp app.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-50 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <span>The deal is automatically verified and the discount is applied.</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
