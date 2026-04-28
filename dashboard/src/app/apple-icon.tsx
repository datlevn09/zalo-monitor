import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          color: 'white',
          fontSize: 80,
          fontWeight: 800,
          letterSpacing: -2,
          borderRadius: 36,
        }}
      >
        ZM
      </div>
    ),
    { ...size }
  )
}
