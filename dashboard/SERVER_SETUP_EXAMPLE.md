# Remote Content Server Setup - Example

This guide shows how to set up the server side to serve remote content for the Zalo Monitor dashboard.

## Quick Start (Node.js + Express)

### 1. Create a Simple Express Server

```javascript
// server.js
const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()

// Enable CORS for all routes
app.use(cors())

// Serve static content.json
app.get('/api/zalo-monitor/content.json', (req, res) => {
  const content = {
    landing: {
      badge: '✨ Phiên bản mới 2.0',
      headline: 'Quản lý khách hàng',
      headlineAccent: 'thông minh hơn',
      subheadline: 'Theo dõi tin nhắn Zalo, phân tích hội thoại bằng AI, và chăm sóc khách hàng từ một nơi duy nhất.',
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
      message: 'Nâng cấp lên Pro ngay hôm nay và tiết kiệm 40% trong năm đầu',
      link: 'https://datthongdong.com/pricing',
      linkText: 'Xem giá',
      dismissible: true
    }
  }

  // Cache for 1 hour on client side, 5 minutes on CDN
  res.set('Cache-Control', 'public, max-age=300, s-maxage=300')
  res.json(content)
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

### 2. Run the Server

```bash
npm install express cors
node server.js
```

### 3. Update Dashboard Environment

In your Next.js dashboard deployment:

```bash
NEXT_PUBLIC_REMOTE_CONTENT_URL=http://localhost:3001/api/zalo-monitor
# Or in production:
NEXT_PUBLIC_REMOTE_CONTENT_URL=https://api.datthongdong.com/api/zalo-monitor
```

## Database-Driven Setup

### Using MongoDB

```javascript
const mongoose = require('mongoose')

// Define schema
const contentSchema = new mongoose.Schema({
  landing: {
    badge: String,
    headline: String,
    headlineAccent: String,
    subheadline: String,
    features: [{
      icon: String,
      title: String,
      desc: String
    }]
  },
  banner: {
    active: Boolean,
    type: { type: String, enum: ['info', 'warning', 'promo', 'success'] },
    message: String,
    link: String,
    linkText: String,
    dismissible: Boolean
  },
  updatedAt: { type: Date, default: Date.now }
})

const Content = mongoose.model('RemoteContent', contentSchema)

// API endpoint
app.get('/api/zalo-monitor/content.json', async (req, res) => {
  try {
    const content = await Content.findOne().sort({ updatedAt: -1 })
    
    // Return empty if no content found (client will use defaults)
    if (!content) {
      return res.json({})
    }

    // Cache headers
    res.set('Cache-Control', 'public, max-age=300')
    res.json(content.toObject())
  } catch (error) {
    console.error('Error fetching content:', error)
    res.status(500).json({})
  }
})

// Admin endpoint to update content
app.post('/api/admin/content', authenticateAdmin, async (req, res) => {
  try {
    const content = await Content.findOneAndUpdate(
      {},
      req.body,
      { upsert: true, new: true }
    )
    res.json(content)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

## File-Based Setup

### Simple Static File

```bash
# Create the file
mkdir -p public/api/zalo-monitor
cat > public/api/zalo-monitor/content.json << 'EOF'
{
  "landing": {
    "badge": "✨ Phiên bản mới 2.0",
    "headline": "Quản lý khách hàng",
    "headlineAccent": "thông minh hơn"
  },
  "banner": {
    "active": true,
    "type": "promo",
    "message": "Nâng cấp lên Pro ngay hôm nay",
    "dismissible": true
  }
}
EOF

# Serve with any web server (nginx, Apache, Node, etc.)
```

### Python Flask Example

```python
from flask import Flask, jsonify
from flask_cors import CORS
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Load content from JSON file or database
def get_content():
    return {
        "landing": {
            "badge": "✨ Phiên bản mới 2.0",
            "headline": "Quản lý khách hàng",
            "headlineAccent": "thông minh hơn",
            "subheadline": "Theo dõi tin nhắn Zalo...",
            "features": [
                {
                    "icon": "💬",
                    "title": "Theo dõi nhóm Zalo",
                    "desc": "Nhận tin nhắn từ hàng chục nhóm Zalo..."
                }
            ]
        },
        "banner": {
            "active": True,
            "type": "promo",
            "message": "Nâng cấp lên Pro ngay hôm nay",
            "link": "https://datthongdong.com/pricing",
            "linkText": "Xem giá",
            "dismissible": True
        }
    }

@app.route('/api/zalo-monitor/content.json')
def get_remote_content():
    # Set cache headers
    response = jsonify(get_content())
    response.headers['Cache-Control'] = 'public, max-age=300'
    return response

if __name__ == '__main__':
    app.run(port=5000, debug=False)
```

### Go (Gin Framework)

```go
package main

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"net/http"
	"time"
)

type Feature struct {
	Icon  string `json:"icon"`
	Title string `json:"title"`
	Desc  string `json:"desc"`
}

type Banner struct {
	Active      bool   `json:"active"`
	Type        string `json:"type"`
	Message     string `json:"message"`
	Link        string `json:"link,omitempty"`
	LinkText    string `json:"linkText,omitempty"`
	Dismissible bool   `json:"dismissible"`
}

type RemoteContent struct {
	Landing struct {
		Badge           string     `json:"badge"`
		Headline        string     `json:"headline"`
		HeadlineAccent  string     `json:"headlineAccent"`
		Subheadline     string     `json:"subheadline"`
		Features        []Feature  `json:"features"`
	} `json:"landing"`
	Banner Banner `json:"banner"`
}

func getContent() RemoteContent {
	return RemoteContent{
		// ... populate with data
	}
}

func main() {
	r := gin.Default()
	r.Use(cors.Default())

	r.GET("/api/zalo-monitor/content.json", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=300")
		c.JSON(http.StatusOK, getContent())
	})

	r.Run(":8000")
}
```

## Deployment Options

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3001
CMD ["node", "server.js"]
```

```bash
docker build -t zalo-monitor-server .
docker run -e PORT=3001 -p 3001:3001 zalo-monitor-server
```

### Vercel (Next.js API Route)
```typescript
// pages/api/content.json.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'public, max-age=300')
  
  res.json({
    landing: {
      badge: '✨ Phiên bản mới 2.0',
      headline: 'Quản lý khách hàng',
      // ...
    },
    banner: {
      active: true,
      type: 'promo',
      message: 'Nâng cấp lên Pro ngay hôm nay',
      // ...
    }
  })
}
```

Then use: `NEXT_PUBLIC_REMOTE_CONTENT_URL=https://your-api.vercel.app/api`

### AWS Lambda + API Gateway
```javascript
exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      landing: { /* ... */ },
      banner: { /* ... */ }
    })
  }
}
```

## Admin Dashboard Example

Simple HTML interface to manage content:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Zalo Monitor Content Manager</title>
  <style>
    body { font-family: sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
    textarea { width: 100%; height: 400px; font-family: monospace; }
    button { padding: 10px 20px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Remote Content Manager</h1>
  
  <textarea id="content" placeholder="Enter JSON content..."></textarea>
  <br><br>
  
  <button onclick="saveContent()">Save Content</button>
  <button onclick="loadContent()">Load Content</button>
  <button onclick="testBanner()">Test Banner</button>
  
  <script>
    async function loadContent() {
      const res = await fetch('/api/zalo-monitor/content.json')
      const data = await res.json()
      document.getElementById('content').value = JSON.stringify(data, null, 2)
    }
    
    async function saveContent() {
      const content = JSON.parse(document.getElementById('content').value)
      const res = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content)
      })
      alert(res.ok ? 'Saved!' : 'Error')
    }
    
    async function testBanner() {
      window.open('http://localhost:3000', 'test')
    }
    
    loadContent()
  </script>
</body>
</html>
```

## Testing

### cURL
```bash
curl http://localhost:3001/api/zalo-monitor/content.json | jq

# With cache headers
curl -i http://localhost:3001/api/zalo-monitor/content.json
```

### Postman
- Method: GET
- URL: `http://localhost:3001/api/zalo-monitor/content.json`
- Expected: 200 OK with JSON body

## Important Headers

```http
Cache-Control: public, max-age=300, s-maxage=3600
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Content-Encoding: gzip
```

## Performance Tips

1. **Enable gzip compression** on your server
2. **Use CDN** to cache the JSON (Cloudflare, AWS CloudFront, etc.)
3. **Set reasonable Cache-Control** headers (300s for clients, 1h for CDN)
4. **Monitor** for errors — if endpoint returns 500, clients fall back gracefully
5. **Test timeout** — ensure endpoint responds within 3 seconds

## Security Considerations

- **No authentication needed** — content is public
- **Rate limit** if needed (optional, as it's just a static response)
- **HTTPS only** in production
- **Validate content** before storing to prevent XSS
- **Monitor requests** for unusual patterns
