import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// Mirrors the Algorithma logo: 7 symmetric columns, tallest in center,
// each column is a circle-capped line. Outermost columns are dots only.
// Colors: dark navy #1b4864 on white background.
const COLS = [
  { dot: 2.5, line: 0   },
  { dot: 3,   line: 5.5 },
  { dot: 4,   line: 10  },
  { dot: 5.5, line: 14  },
  { dot: 4,   line: 10  },
  { dot: 3,   line: 5.5 },
  { dot: 2.5, line: 0   },
]
const TALLEST = COLS[3].dot * 2 + COLS[3].line + COLS[3].dot  // ~28px

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 32, height: 32, display: 'flex', background: 'white' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: Math.round((32 - TALLEST) / 2),
            gap: 2,
          }}
        >
          {COLS.map(({ dot, line }, i) => {
            const colH = dot * 2 + line + (line > 0 ? dot : 0)
            const mt = Math.round((TALLEST - colH) / 2)
            return (
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
                <div style={{ width: dot * 2, height: dot * 2, borderRadius: dot, background: '#1b4864' }} />
                {line > 0 && <div style={{ width: 2, height: line, background: '#1b4864' }} />}
                {line > 0 && <div style={{ width: dot * 2, height: dot * 2, borderRadius: dot, background: '#1b4864' }} />}
              </div>
            )
          })}
        </div>
      </div>
    ),
    { ...size },
  )
}
