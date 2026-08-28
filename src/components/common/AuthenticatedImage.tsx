import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';

interface AuthenticatedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src: string | undefined;
  fallbackSrc: string;
}

/**
 * Drop-in <img> replacement for avatars, which (like customer KYC documents
 * -- see GET /api/documents/file in server.ts) are served through an
 * authenticated proxy rather than a permanent public Storage URL. A plain
 * <img src> can't attach the Bearer auth header that proxy requires, so
 * this fetches the image as a blob via apiFetch and renders a local object
 * URL instead. A `src` that's still an ABSOLUTE URL (an avatar uploaded
 * before this change, which carries its old permanent Firebase Storage
 * signed URL) is rendered directly, unauthenticated, exactly as before --
 * no data migration was performed for already-uploaded avatars.
 */
export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({ src, fallbackSrc, alt, ...imgProps }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src && /^https?:\/\//i.test(src) ? src : fallbackSrc);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const revokePrevious = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    if (!src) {
      revokePrevious();
      setResolvedSrc(fallbackSrc);
      return;
    }

    if (/^https?:\/\//i.test(src)) {
      revokePrevious();
      setResolvedSrc(src);
      return;
    }

    // Relative URL: an authenticated-proxy path. Fetch with the auth header
    // and render as a local object URL.
    apiFetch(src)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`Failed to load image (${res.status}).`))))
      .then((blob) => {
        if (cancelled) return;
        revokePrevious();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setResolvedSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(fallbackSrc);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fallbackSrc]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return (
    <img
      {...imgProps}
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = fallbackSrc;
      }}
    />
  );
};
