import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: '#1b4864',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2.5,
        }}
      >
        {/* Algorithma vertical-bar logo mark */}
        {[
          { height: 20, marginTop: 0 },
          { height: 14, marginTop: 3 },
          { height: 10, marginTop: 5 },
          { height: 14, marginTop: 3 },
          { height: 20, marginTop: 0 },
        ].map((bar, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: bar.height,
              borderRadius: 2,
              background: 'white',
              marginTop: bar.marginTop,
            }}
          />
        ))}
      </div>
    ),
    { ...size },
  )
}
