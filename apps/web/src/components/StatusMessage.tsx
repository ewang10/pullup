/**
 * Success/error message after an action. Focus moves to the message so
 * keyboard and screen-reader users aren't left on an element that just
 * disappeared (e.g. an approved item removed from a list).
 */
'use client';

import { useEffect, useRef } from 'react';

export default function StatusMessage({ notice, error }: { notice?: string | null; error?: string | null }) {
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice && !error) noticeRef.current?.focus();
  }, [notice, error]);

  return (
    <>
      <div aria-live="polite">
        {notice && (
          <p
            ref={noticeRef}
            tabIndex={-1}
            className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {notice}
          </p>
        )}
      </div>
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {error}
        </p>
      )}
    </>
  );
}
