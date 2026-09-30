/**
 * Venue photo shown to riders on deals. Owners upload to the public
 * venue-images bucket at <venue_id>/hero-<time>.<ext>; storage policies only
 * allow the owner to write there, and the bucket accepts JPEG/PNG/WebP up to
 * 5 MB. PullUp staff can remove inappropriate photos.
 */
'use client';

import { useEffect, useId, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

const BUCKET = 'venue-images';
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Storage path from a public URL of this bucket. */
function pathFromUrl(url: string | null): string | null {
  const m = url?.match(/\/object\/public\/venue-images\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function VenuePhotoCard({ venueId, venueName }: { venueId: string; venueName: string }) {
  const supabase = createSupabaseBrowserClient();
  const inputId = useId();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('venues')
      .select('image_url')
      .eq('id', venueId)
      .single()
      .then(({ data }) => setImageUrl(data?.image_url ?? null));
  }, [supabase, venueId]);

  const upload = async (file: File) => {
    setError(null);
    setMessage(null);
    const ext = TYPES[file.type];
    if (!ext) {
      setError('Choose a JPEG, PNG or WebP photo.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is over 5 MB. Choose a smaller one.');
      return;
    }
    setBusy(true);
    const path = `${venueId}/hero-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (uploadError) {
      setBusy(false);
      setError(uploadError.message);
      return;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const oldPath = pathFromUrl(imageUrl);
    const { error: updateError } = await supabase
      .from('venues')
      .update({ image_url: pub.publicUrl, hero_image_updated_at: new Date().toISOString() })
      .eq('id', venueId);
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([path]);
      setBusy(false);
      setError(updateError.message);
      return;
    }
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    setImageUrl(pub.publicUrl);
    setBusy(false);
    setMessage('Photo updated. Riders will see it on your deals.');
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const oldPath = pathFromUrl(imageUrl);
    const { error: updateError } = await supabase
      .from('venues')
      .update({ image_url: null, hero_image_updated_at: null })
      .eq('id', venueId);
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    setImageUrl(null);
    setBusy(false);
    setMessage('Photo removed.');
  };

  return (
    <section className="card max-w-2xl mb-6" aria-labelledby="venue-photo-heading">
      <h2 id="venue-photo-heading" className="text-lg font-semibold text-gray-900">Venue photo</h2>
      <p className="text-sm text-gray-600 mt-1">
        Shown to riders on your deals. JPEG, PNG or WebP, up to 5 MB. A wide photo of your space works best.
      </p>

      <div className="mt-4 aspect-[16/9] w-full max-w-md overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`Current photo of ${venueName}`} className="h-full w-full object-cover" />
        ) : (
          <p className="text-sm text-gray-600">No photo yet</p>
        )}
      </div>

      <div aria-live="polite">
        {message && <p className="mt-3 text-sm text-green-900">{message}</p>}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className={`btn-primary cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          {busy ? 'Saving…' : imageUrl ? 'Replace photo' : 'Upload photo'}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload(file);
          }}
        />
        {imageUrl && (
          <button type="button" onClick={remove} disabled={busy} className="btn-secondary">
            Remove photo
          </button>
        )}
      </div>
    </section>
  );
}
