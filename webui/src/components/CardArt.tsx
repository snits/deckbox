// ABOUTME: Card art for the test-draw panel — an <img> that removes itself when
// ABOUTME: the source fails to load, so the row falls back to its text caption.

import { useState } from 'react';

export interface CardArtProps {
  src: string;
  alt: string;
}

export function CardArt({ src, alt }: CardArtProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img className="testdraw-card-art" src={src} alt={alt} onError={() => setFailed(true)} />
  );
}
