import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #020617 0%, #0e7490 100%)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #67e8f9 0%, #1fd5f9 45%, transparent 70%)',
            boxShadow: '0 0 16px #1fd5f9',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
