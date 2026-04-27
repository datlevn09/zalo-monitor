# Remote Content & Banner Ad System

This document describes the remote content system for the Zalo Monitor dashboard, allowing the app owner to push updates to landing page content and banner ads across all deployments without requiring Docker image rebuilds.

## Architecture Overview

The system consists of three main components:

1. **Remote Content Hook** (`src/lib/remote-content.ts`)
2. **Banner Component** (`src/components/RemoteBanner.tsx`)
3. **Landing Page Integration** (`src/app/page.tsx`)
4. **Dashboard Banner Integration** (`src/app/dashboard/layout.tsx`)

## How It Works

### Data Flow

```
Remote Server (datthongdong.com/api/zalo-monitor/content.json)
    ↓
useRemoteContent() Hook
    ↓
localStorage cache (zm:remote-content)
    ↓
RemoteBanner + Landing Page Components
```

### Caching Strategy

- **Fetched content** is cached in `localStorage` with key `zm:remote-content`
- **Cache TTL**: 1 hour (3,600,000 ms)
- **Fetch timeout**: 3 seconds max
- **Fallback behavior**:
  - If cache exists but is stale → return stale cache while refetching in background
  - If fetch fails and cache exists → use cache (stale is acceptable)
  - If fetch fails and no cache → return `null` (UI falls back to defaults)

## Configuration

### Environment Variables

Set `NEXT_PUBLIC_REMOTE_CONTENT_URL` to customize the remote server URL:

```bash
NEXT_PUBLIC_REMOTE_CONTENT_URL=https://your-domain.com/api/zalo-monitor
```

Default: `https://datthongdong.com/api/zalo-monitor`

### Remote Content JSON Format

Serve a `content.json` file at `${REMOTE_CONTENT_URL}/content.json`:

```json
{
  "landing": {
    "badge": "✨ Phiên bản mới 2.0",
    "headline": "Quản lý khách hàng",
    "headlineAccent": "thông minh hơn",
    "subheadline": "Theo dõi tin nhắn Zalo, phân tích hội thoại bằng AI, và chăm sóc khách hàng từ một nơi duy nhất.",
    "features": [
      {
        "icon": "💬",
        "title": "Theo dõi nhóm Zalo",
        "desc": "Nhận tin nhắn từ hàng chục nhóm Zalo vào một bảng điều khiển duy nhất."
      },
      {
        "icon": "🤖",
        "title": "AI phân tích hội thoại",
        "desc": "Tóm tắt, phân loại khách hàng và gợi ý hành động tự động."
      },
      {
        "icon": "🔔",
        "title": "Cảnh báo tức thời",
        "desc": "Nhận thông báo ngay khi có từ khoá quan trọng hoặc khách hàng cần hỗ trợ."
      }
    ]
  },
  "banner": {
    "active": true,
    "type": "promo",
    "message": "Nâng cấp lên Pro ngay hôm nay và tiết kiệm 40% trong năm đầu",
    "link": "https://datthongdong.com/pricing",
    "linkText": "Xem giá",
    "dismissible": true
  }
}
```

## TypeScript Interface

```typescript
interface RemoteContent {
  landing?: {
    badge?: string              // Badge text (e.g., "✨ Phiên bản mới 2.0")
    headline?: string           // Main headline
    headlineAccent?: string     // Accent portion of headline
    subheadline?: string        // Subheading text
    features?: Array<{          // Feature cards
      icon: string
      title: string
      desc: string
    }>
  }
  banner?: {
    active: boolean             // Whether banner is shown
    type: 'info' | 'warning' | 'promo' | 'success'  // Banner style
    message: string             // Main banner message
    link?: string               // Optional link URL
    linkText?: string           // Button text
    dismissible?: boolean       // Whether user can dismiss
  }
}
```

## Component Usage

### useRemoteContent Hook

```typescript
import { useRemoteContent } from '@/lib/remote-content'

export function MyComponent() {
  const { content, loading } = useRemoteContent()
  
  if (!content) {
    // Use defaults
  }
  
  return <div>{content?.landing?.headline}</div>
}
```

Returns:
- `content`: The fetched/cached remote content (or `null` if unavailable)
- `loading`: Whether a fetch is in progress (for loading states if needed)

### RemoteBanner Component

```typescript
import { RemoteBanner } from '@/components/RemoteBanner'

// Use anywhere in your layout
export function MyLayout() {
  return (
    <div>
      <Header />
      <RemoteBanner />  {/* Shows only if banner.active === true */}
      <Content />
    </div>
  )
}
```

Features:
- **Type-based styling**: `info` (blue), `warning` (amber), `promo` (purple→blue gradient), `success` (green)
- **Optional dismiss button**: If `dismissible: true`, shows X button
- **Dismissal state**: Tracked in `sessionStorage` with key `zm:banner-dismissed-{hash}`
- **Animation**: Smooth slide-in from top with 300ms duration
- **Optional link button**: Shows if both `link` and `linkText` are provided

## Integration Locations

### Landing Page (`src/app/page.tsx`)

- Banner component placed right below the navbar
- All landing content fields (badge, headline, subheadline, features) are overridable
- Falls back to hardcoded defaults if remote content unavailable
- No layout shift or flash — shows defaults immediately, updates when remote content arrives

### Dashboard Layout (`src/app/dashboard/layout.tsx`)

- Banner component placed between header and sidebar/main content area
- Full-width bar that doesn't affect layout height (flexbox aware)
- Appears consistently across all dashboard pages

## Development & Testing

### Example Content File

A sample `remote-content.example.json` is provided in `src/lib/` for reference.

### Local Testing

1. Create a local file server serving the content.json
2. Set `NEXT_PUBLIC_REMOTE_CONTENT_URL` environment variable
3. Reload the page — banner/content should appear

### Bypass Remote (Force Defaults)

Clear localStorage:
```javascript
localStorage.removeItem('zm:remote-content')
```

Or temporarily disable remote by setting an invalid URL in the environment.

## Error Handling & Resilience

- **Network failures**: Gracefully fall back to cached or hardcoded defaults
- **Malformed JSON**: Silently ignored, defaults used
- **Timeout (3s)**: If fetch takes >3 seconds, aborts and uses cache/defaults
- **Storage quota exceeded**: Silently ignored, banner still works from memory
- **No SSR issues**: All fetches are client-side only with proper hydration checks

## Security & Privacy

- **No user data sent**: Content fetch is anonymous (no auth tokens)
- **Read-only**: Content system cannot modify or access user data
- **CORS-friendly**: Uses standard fetch API with `cache: 'no-store'`
- **XSS-safe**: All content is displayed as plain text/HTML, not evaluated as code
- **Session-scoped dismissal**: Dismiss state doesn't persist beyond browser session (unless user manually clears it)

## Performance

- **Zero impact if feature unused**: If `banner.active === false`, component returns `null` immediately
- **Cached first**: First page load shows cached content (if available) without waiting for network
- **Background refresh**: Fresh content fetched after cache returned, doesn't block UI
- **3-second timeout**: Prevents hanging on slow/unresponsive servers
- **Minimal memory**: Cache key is only 12KB even with large JSON payloads

## Troubleshooting

### Banner not appearing

1. Check `NEXT_PUBLIC_REMOTE_CONTENT_URL` is set correctly
2. Verify `content.json` is accessible at `{URL}/content.json`
3. Check `banner.active === true` in JSON
4. Clear browser cache: `localStorage.removeItem('zm:remote-content')`
5. Open DevTools → Network tab → look for the fetch request

### Content not updating

1. Server may be caching responses — add `Cache-Control: no-cache` header
2. Browser cache — set `NEXT_PUBLIC_REMOTE_CONTENT_URL` with cache-busting query param (e.g., `?v=123`)
3. localStorage TTL — wait up to 1 hour, or clear manually

### Dismissal not working

- Dismissal state uses `sessionStorage` (not persistent)
- State is keyed by message hash, so changing message resets dismissal
- Clear dismissal: `sessionStorage.removeItem('zm:banner-dismissed-...')`

## Files Created/Modified

### New Files
- `/src/lib/remote-content.ts` — Hook for fetching/caching remote content
- `/src/lib/remote-content.example.json` — Example content payload
- `/src/components/RemoteBanner.tsx` — Banner display component

### Modified Files
- `/src/app/page.tsx` — Added remote content integration to landing page
- `/src/app/dashboard/layout.tsx` — Added remote banner to dashboard
