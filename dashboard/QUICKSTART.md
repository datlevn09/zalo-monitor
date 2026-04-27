# Remote Content System - Quick Start Guide

## 5-Minute Setup

### Step 1: Configure the Dashboard
Add to your `.env.local` (or deployment settings):

```bash
NEXT_PUBLIC_REMOTE_CONTENT_URL=https://api.datthongdong.com/api/zalo-monitor
```

Default is already set to `https://datthongdong.com/api/zalo-monitor`, so you only need this if using a different server.

### Step 2: Set Up Your Server

**Quick Option: Using Vercel (if your API is on Vercel)**

Create `pages/api/content.json.ts`:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json({
    landing: {
      badge: '✨ Phiên bản mới 2.0',
      headline: 'Quản lý khách hàng',
      headlineAccent: 'thông minh hơn',
      subheadline: 'Theo dõi tin nhắn Zalo, phân tích hội thoại bằng AI...',
      features: [
        {
          icon: '💬',
          title: 'Theo dõi nhóm Zalo',
          desc: 'Nhận tin nhắn từ hàng chục nhóm Zalo vào một bảng điều khiển duy nhất.'
        },
        {
          icon: '🤖',
          title: 'AI phân tích hội thoại',
          desc: 'Tóm tắt, phân loại khách hàng và gợi ý hành động tự động.'
        },
        {
          icon: '🔔',
          title: 'Cảnh báo tức thời',
          desc: 'Nhận thông báo ngay khi có từ khoá quan trọng hoặc khách hàng cần hỗ trợ.'
        }
      ]
    },
    banner: {
      active: true,
      type: 'promo',
      message: 'Nâng cấp lên Pro ngay hôm nay và tiết kiệm 40%',
      link: 'https://datthongdong.com/pricing',
      linkText: 'Xem giá',
      dismissible: true
    }
  })
}
```

Then deploy and use:
```bash
NEXT_PUBLIC_REMOTE_CONTENT_URL=https://your-api.vercel.app/api
```

**Alternative: Simple Node.js Server**

```bash
npm init -y
npm install express cors
```

Create `server.js`:
```javascript
const express = require('express')
const cors = require('cors')
const app = express()
app.use(cors())

app.get('/api/zalo-monitor/content.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json({
    landing: { /* ... */ },
    banner: { /* ... */ }
  })
})

app.listen(3001, () => console.log('Server on :3001'))
```

Run:
```bash
node server.js
# Then use: http://localhost:3001/api/zalo-monitor
```

### Step 3: Test It

1. **Dashboard landing page**: Content should load from remote server
2. **Banner should appear** (if `banner.active: true`)
3. **Check browser console**: No errors should appear
4. **Check DevTools Network tab**: Should see fetch to `/content.json`

## Accessing Remote Content

### In Landing Page
Content is automatically used in `src/app/page.tsx`:
- Badge text
- Headline and accent
- Subheadline
- Feature cards

### In Dashboard
Banner automatically appears in dashboard layout (`src/app/dashboard/layout.tsx`).

### In Custom Components
```typescript
import { useRemoteContent } from '@/lib/remote-content'

export function MyComponent() {
  const { content, loading } = useRemoteContent()
  
  if (!content) return <p>Using default content</p>
  if (loading) return <p>Loading...</p>
  
  return <div>{content.landing?.headline}</div>
}
```

## Updating Content

### Option 1: Edit in Code
If serving from a static file or hardcoded endpoint, just update the response object and redeploy.

### Option 2: Database-Driven
Use MongoDB/PostgreSQL to store content, then admin panel to update:

```bash
POST /api/admin/content
{ "landing": { "badge": "New text" } }
```

### Option 3: Headless CMS
Connect to Strapi, Contentful, etc. and fetch from there.

## Testing Tools

### Check if Content is Being Fetched
```bash
curl https://api.datthongdong.com/api/zalo-monitor/content.json | jq
```

### Check Browser Cache
```javascript
JSON.parse(localStorage.getItem('zm:remote-content'))
```

### Clear and Refetch
```javascript
localStorage.removeItem('zm:remote-content')
// Reload page
```

### Test Banner Dismissal
```javascript
// Check if dismissed
sessionStorage.getItem('zm:banner-dismissed-*')

// Clear dismissal
sessionStorage.clear()
// Reload page
```

## Configuration Reference

| Setting | Where | Default | Required? |
|---------|-------|---------|-----------|
| `NEXT_PUBLIC_REMOTE_CONTENT_URL` | `.env`, deployment | `https://datthongdong.com/api/zalo-monitor` | No |
| `landing.badge` | Remote JSON | Not shown if missing | No |
| `landing.headline` | Remote JSON | Falls back to hardcoded | No |
| `banner.active` | Remote JSON | `false` (banner hidden) | No |
| Cache TTL | Hard-coded | 1 hour | N/A |

## JSON Structure (Complete Reference)

```json
{
  "landing": {
    "badge": "✨ New",
    "headline": "Main title",
    "headlineAccent": "colored part",
    "subheadline": "Description text",
    "features": [
      {
        "icon": "emoji",
        "title": "Feature title",
        "desc": "Feature description"
      }
    ]
  },
  "banner": {
    "active": true,
    "type": "info|warning|promo|success",
    "message": "Banner text",
    "link": "https://example.com",
    "linkText": "Button text",
    "dismissible": true
  }
}
```

All fields are optional — if not provided, defaults are used.

## Banner Styles

| Type | Color | Use Case |
|------|-------|----------|
| `info` | Blue | General announcements |
| `warning` | Amber | Important updates |
| `promo` | Purple→Blue gradient | Promotions |
| `success` | Green | Success messages |

## Common Issues

### Banner not showing?
- Check `banner.active === true`
- Clear cache: `localStorage.removeItem('zm:remote-content')`
- Check browser console for fetch errors

### Content not updating?
- Wait up to 1 hour (cache TTL), or clear cache
- Verify server is returning correct JSON
- Check `NEXT_PUBLIC_REMOTE_CONTENT_URL` is set

### Dismiss button not working?
- Check `banner.dismissible: true`
- Dismissal uses `sessionStorage` (cleared on browser close)
- Check for JavaScript errors in console

## Performance

- **First page load**: Shows bundled defaults instantly
- **Subsequent loads**: Shows cached content (if fresh), fetches update in background
- **No blocking**: Content fetch never delays page rendering
- **Timeout**: If server doesn't respond in 3 seconds, uses cache/defaults

## Production Checklist

- [ ] Set `NEXT_PUBLIC_REMOTE_CONTENT_URL` in deployment config
- [ ] Verify endpoint returns valid JSON within 3 seconds
- [ ] Test banner rendering on mobile/desktop
- [ ] Set proper `Cache-Control` headers (recommended: `max-age=300`)
- [ ] Enable CORS on content endpoint
- [ ] Monitor for fetch errors in analytics

## File Locations

| File | Purpose |
|------|---------|
| `src/lib/remote-content.ts` | Main hook + interface |
| `src/components/RemoteBanner.tsx` | Banner component |
| `src/app/page.tsx` | Landing page integration |
| `src/app/dashboard/layout.tsx` | Dashboard banner placement |
| `src/lib/remote-content.example.json` | Example payload |

## Documentation Files

- **`QUICKSTART.md`** (this file) — 5-minute setup
- **`REMOTE_CONTENT_SETUP.md`** — Complete configuration guide
- **`REMOTE_CONTENT_IMPLEMENTATION.md`** — Technical details
- **`SERVER_SETUP_EXAMPLE.md`** — Server implementation examples

## Need Help?

1. Check console for errors: `Ctrl+Shift+J` (Chrome/Firefox)
2. Verify endpoint: Use cURL or browser to fetch JSON directly
3. Clear cache: `localStorage.removeItem('zm:remote-content')`
4. Reload page: `Ctrl+Shift+R` (hard refresh)
5. Review `REMOTE_CONTENT_SETUP.md` for troubleshooting
