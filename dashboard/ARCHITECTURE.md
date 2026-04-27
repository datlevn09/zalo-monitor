# Remote Content System - Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Zalo Monitor Dashboard                      │
└─────────────────────────────────────────────────────────────────┘

                        ┌──────────────────┐
                        │   Page Renders   │
                        └────────┬─────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
            ┌───────▼────────┐        ┌──────▼───────┐
            │  landing page  │        │  dashboard   │
            └────────┬───────┘        └──────┬───────┘
                     │                       │
         ┌───────────┴──┬───────────┐ ┌──────┴────────┐
         │              │           │ │               │
    useRemote       useRemote   Remote   RemoteBanner
    Content()       Content()   Banner       hook
         │              │           │ │       │
         └──────────────┼───────────┼─┴───────┘
                        │           │
                    ┌───▼──────────▼──┐
                    │  Check Cache     │
                    │ (localStorage)   │
                    └───┬──────────┬───┘
                        │          │
            ┌───────────┘          └──────────────┐
            │ Fresh (<1hr)                         │ Stale or Missing
            │                                      │
       Return Cache              ┌────────────────┴────────┐
         Show UI                 │                         │
                            Fetch in              Return Cache
                            Background            (if exists)
                                 │                     │
                            ┌────▼─────────────┐       │
                            │ GET /content.json │       │
                            │ (3s timeout)      │       │
                            └────┬──────────┬───┘       │
                                 │          │            │
                        ┌────────┘          └─────┐     │
                        │ Success              Fail│     │
                        │                         │      │
                  ┌─────▼──────┐          ┌──────▼──┐   │
                  │ Parse JSON  │          │ Use    │   │
                  │ Update UI   │          │ Cache  │   │
                  │ Save Cache  │          └───┬────┘───┘
                  └────────────┘               │
                                          Use Defaults
                                              │
                                          Show UI
```

## Component Architecture

```
src/
├── app/
│   ├── page.tsx
│   │   ├── import useRemoteContent from '@/lib/remote-content'
│   │   ├── import RemoteBanner from '@/components/RemoteBanner'
│   │   └── Use remote landing content (badge, headline, features)
│   │
│   └── dashboard/
│       └── layout.tsx
│           ├── import RemoteBanner from '@/components/RemoteBanner'
│           └── Place banner between Header and main content
│
├── components/
│   └── RemoteBanner.tsx
│       ├── Uses useRemoteContent hook
│       ├── Renders banner if active
│       ├── Handles dismissal
│       └── Supports 4 color types
│
└── lib/
    └── remote-content.ts
        ├── useRemoteContent() hook
        ├── RemoteContent interface
        ├── Cache management (localStorage)
        ├── Fetch with timeout
        └── Error handling
```

## State Flow

```
┌─────────────────────────────────────────┐
│  useRemoteContent() Hook Initialization │
└──────────────┬──────────────────────────┘
               │
               ├─→ Check localStorage cache
               │   (key: 'zm:remote-content')
               │   TTL: 1 hour
               │
               ├─→ If fresh cache exists
               │   │
               │   └─→ Set content = cachedData
               │       Set loading = false
               │       (show cached immediately)
               │
               └─→ Start background fetch
                   │
                   ├─→ GET {URL}/content.json
                   │   Timeout: 3 seconds
                   │   Cache-Control: no-store
                   │
                   ├─→ If success
                   │   │
                   │   ├─→ Parse JSON
                   │   ├─→ Save to localStorage
                   │   ├─→ Update state
                   │   └─→ Set loading = false
                   │
                   └─→ If failure
                       │
                       └─→ Try to use stale cache
                           or return null
                           Set loading = false
```

## Cache Flow

```
Browser Storage Structure:

localStorage:
┌───────────────────────────────────────┐
│ Key: 'zm:remote-content'              │
│ Value: {                              │
│   data: RemoteContent | null,         │
│   fetchedAt: timestamp (milliseconds) │
│ }                                     │
│ Size: ~1-5KB typically                │
└───────────────────────────────────────┘

sessionStorage:
┌───────────────────────────────────────┐
│ Key: 'zm:banner-dismissed-{hash}'     │
│ Value: 'true'                         │
│ Scope: Session (cleared on close)     │
└───────────────────────────────────────┘

TTL Logic:
  now = Date.now()
  age = now - fetchedAt
  
  if age < 3600000ms (1 hour)
    → Cache is fresh, use it
  else
    → Cache is stale, refetch
```

## Request/Response Flow

```
Client Request:
  GET /api/zalo-monitor/content.json
  Headers:
    - Accept: application/json
    - Cache-Control: no-store
    - Signal: AbortSignal (3s timeout)

Server Response:
  HTTP/1.1 200 OK
  Headers:
    - Content-Type: application/json
    - Cache-Control: public, max-age=300
    - Access-Control-Allow-Origin: *
    - Content-Encoding: gzip (optional)
  
  Body:
  {
    "landing": {
      "badge": "string",
      "headline": "string",
      "headlineAccent": "string",
      "subheadline": "string",
      "features": [
        {
          "icon": "emoji/string",
          "title": "string",
          "desc": "string"
        }
      ]
    },
    "banner": {
      "active": boolean,
      "type": "info" | "warning" | "promo" | "success",
      "message": "string",
      "link": "string (optional)",
      "linkText": "string (optional)",
      "dismissible": boolean (optional)
    }
  }

Error Response:
  HTTP/1.1 404 Not Found
  → Client uses cache or defaults
  
  HTTP/1.1 500 Internal Server Error
  → Client uses cache or defaults
  
  Network Timeout (>3s)
  → Request aborted
  → Client uses cache or defaults
```

## Banner Styling Variants

```
Banner Type → CSS Classes

'info'
  bg-blue-600 text-white
  └─ Use for: General announcements

'warning'
  bg-amber-500 text-white
  └─ Use for: Important updates

'promo'
  bg-gradient-to-r from-purple-600 to-blue-600 text-white
  └─ Use for: Promotions, sales

'success'
  bg-green-600 text-white
  └─ Use for: Success messages
```

## Feature Hierarchy

```
Remote Content System
│
├─ Landing Page Features
│  ├─ Overridable badge text
│  ├─ Overridable headline text
│  ├─ Overridable headline accent
│  ├─ Overridable subheadline
│  └─ Overridable feature cards
│     ├─ Icon (emoji)
│     ├─ Title
│     └─ Description
│
├─ Banner Features
│  ├─ Enable/disable toggle
│  ├─ Style variants (4 types)
│  ├─ Main message text
│  ├─ Optional link button
│  │  ├─ URL
│  │  └─ Button text
│  └─ Optional dismiss button
│     └─ Uses sessionStorage
│
└─ System Features
   ├─ Configurable remote URL
   ├─ 1-hour cache TTL
   ├─ 3-second fetch timeout
   ├─ Graceful error handling
   ├─ Smooth animations
   ├─ Type-safe TypeScript
   └─ Zero-overhead when inactive
```

## Timing Diagram

```
Timeline:
0ms      Page Load
│        useRemoteContent() called
│        Check localStorage
│
├─→ 10ms  Cache found and fresh
│         │ Return cached content immediately
│         │ Show UI with cached content
│         │
│         └─→ 20-100ms: Start background fetch
│
├─→ 200ms  OR Cache missing/stale
│          │ Set loading = true
│          │ Start fetch immediately
│
├─→ 250ms  Fetch in progress...
│
├─→ 1000ms Fetch completes (if <3s)
│          Update UI with fresh content
│          Save to localStorage
│          Set loading = false
│
└─→ 3000ms Timeout (if no response)
           Use cache or defaults
           Set loading = false

UI Rendering:
  ├─ 0ms    Show cached/default content
  ├─ 10ms   (if background fetch) No change yet
  ├─ 1000ms (when fetch done) Smooth update
  └─ 3000ms (if timeout) Still showing cached
```

## Error Handling Paths

```
Fetch Request
│
├─→ Network Error (offline, DNS failure, etc.)
│   └─ Caught by catch block
│       └─ Return cached (if available)
│           └─ Fallback to null
│
├─→ Timeout (>3 seconds)
│   └─ AbortController triggers
│       └─ Return cached (if available)
│           └─ Fallback to null
│
├─→ HTTP Error (500, 403, etc.)
│   └─ response.ok check fails
│       └─ Return null
│           └─ Fallback to defaults
│
├─→ Invalid JSON
│   └─ JSON.parse() throws
│       └─ Caught by catch block
│           └─ Return cached (if available)
│
└─→ Storage Error
    └─ localStorage full (quota exceeded)
        └─ Silently ignored
            └─ Content still works from memory
```

## Deployment Variants

```
SaaS Deployment
├─ Single dashboard instance
├─ All users fetch from same remote URL
├─ Instant content updates across all users
└─ No rebuilds needed

Self-Hosted Deployment (Docker)
├─ Multiple customer instances
├─ Each can point to different remote URL
├─ Via environment variable
├─ No image rebuild required
└─ Content updates immediately

Hybrid (SaaS + Self-Hosted)
├─ Default URL for SaaS
├─ Configurable URL for self-hosted
├─ Each deployment independent
└─ All benefit from system
```

## Performance Characteristics

```
Metric              Value        Notes
─────────────────────────────────────────
Time to First Paint ~0-50ms      Uses cached/default
Time to Interaction ~0-50ms      No blocking
Background Fetch    ~200-1000ms  Doesn't block UI
Fetch Timeout       3000ms       Prevents hanging
Cache Size          1-5KB        Minimal memory
Bundle Impact       ~5KB gzipped Minimal JS
Network Requests    1 per hour   Per user
Cache Hits          ~95%         In normal usage
```

## Security Boundaries

```
Zalo Monitor Dashboard
│
├─ Trusted
│  ├─ User authentication (JWT)
│  ├─ Tenant data (user's conversations)
│  └─ User settings
│
├─ Partially Trusted
│  └─ Remote Content
│      ├─ Text content (safe)
│      ├─ Emoji/strings (safe)
│      ├─ URLs (validated before use)
│      └─ Never executed as code
│
└─ Untrusted
   └─ User-generated content in messages
```

## Monitoring & Analytics

```
Events to Track (optional):
├─ Content fetch initiated
├─ Content fetch succeeded
├─ Content fetch failed
├─ Cache hit/miss ratio
├─ Banner impressions
├─ Banner dismissals
├─ Banner link clicks
└─ Performance timing

Debug Info Available:
├─ localStorage inspection
├─ sessionStorage inspection
├─ Network tab (DevTools)
├─ Console logs (if debug enabled)
└─ Component state (React DevTools)
```

## File Dependency Graph

```
src/app/page.tsx
  ├─ depends on: @/lib/remote-content (hook)
  ├─ depends on: @/components/RemoteBanner
  └─ imports: @/lib/api, ThemeToggle

src/app/dashboard/layout.tsx
  ├─ depends on: @/components/RemoteBanner
  └─ imports: @/lib/api, Header, Footer

src/components/RemoteBanner.tsx
  ├─ depends on: @/lib/remote-content (hook)
  └─ exports: RemoteBanner component

src/lib/remote-content.ts
  ├─ exports: useRemoteContent (hook)
  ├─ exports: RemoteContent (interface)
  └─ no dependencies on other src files

src/lib/remote-content.example.json
  └─ documentation only (not imported)
```
