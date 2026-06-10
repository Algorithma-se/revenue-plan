import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// [topDotDia, lineHeight, bottomDotDia, marginTop]
// 7 columns symmetric around center — mirrors the Algorithma logo mark
const COLS: [number, number, number, number][] = [
  [2,  0,  0,  10],  // outer dot only
  [3,  5,  2,   6],
  [5,  9,  3,   2],
  [6, 13,  3,   0],  // center — tallest
  [5,  9,  3,   2],
  [3,  5,  2,   6],
  [2,  0,  0,  10],  // outer dot only
]

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32, height: 32,
          borderRadius: 7,
          background: '#1b4864',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 5,
          gap: 2,
        }}
      >
        {COLS.map(([topD, lineH, botD, mt], i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: mt,
              gap: 0,
            }}
          >
            <div style={{ width: topD, height: topD, borderRadius: topD / 2, background: 'white' }} />
            {lineH > 0 && (
              <div style={{ width: 2, height: lineH, background: 'white' }} />
            )}
            {botD > 0 && (
              <div style={{ width: botD, height: botD, borderRadius: botD / 2, background: 'white' }} />
            )}
          </div>
        ))}
      </div>
    ),
    { ...size },
  )
}
