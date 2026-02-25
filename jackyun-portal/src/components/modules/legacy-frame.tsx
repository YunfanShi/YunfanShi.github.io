'use client';

interface LegacyFrameProps {
  src: string;
  title?: string;
}

export default function LegacyFrame({ src, title = 'Legacy Page' }: LegacyFrameProps) {
  return (
    <div style={{ margin: '-24px', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <iframe
        src={src}
        title={title}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="autoplay; clipboard-read; clipboard-write"
      />
    </div>
  );
}
