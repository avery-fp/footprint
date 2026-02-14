export default function APIDocsPage() {
  return (
    <div className="min-h-screen bg-[#07080A] text-[#F5F5F5] py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-light mb-4">Footprint API</h1>
        <p className="text-white/60 mb-12">
          Read-only access to public Footprint data. Build integrations, displays, and tools.
        </p>

        {/* Base URL */}
        <section className="mb-12">
          <h2 className="text-xl font-medium mb-4">Base URL</h2>
          <code className="block bg-white/5 border border-white/10 rounded-lg p-4 font-mono text-sm">
            https://footprint.onl/api/v1
          </code>
        </section>

        {/* Get Footprint */}
        <section className="mb-12">
          <h2 className="text-xl font-medium mb-4">Get Footprint</h2>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <code className="font-mono text-sm">
              <span className="text-green-400">GET</span> /footprint/{'{slug}'}
            </code>
          </div>
          
          <h3 className="font-mono text-sm text-white/50 mb-2">Parameters</h3>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 space-y-2 text-sm">
            <div><code className="text-white/80">limit</code> <span className="text-white/40">- Max content items (default: 50, max: 100)</span></div>
            <div><code className="text-white/80">embeds</code> <span className="text-white/40">- Include embed_html (default: true)</span></div>
          </div>

          <h3 className="font-mono text-sm text-white/50 mb-2">Response</h3>
          <pre className="bg-white/5 border border-white/10 rounded-lg p-4 font-mono text-xs overflow-x-auto">
{`{
  "slug": "fp-8291-x7k9",
  "url": "https://footprint.onl/fp-8291-x7k9",
  "profile": {
    "name": "Alex",
    "handle": "@alex",
    "bio": "Building things",
    "avatar_url": "https://..."
  },
  "serial_number": 8291,
  "theme": "midnight",
  "view_count": 1234,
  "content": {
    "count": 12,
    "items": [
      {
        "url": "https://youtube.com/...",
        "type": "youtube",
        "title": "My favorite video",
        "thumbnail_url": "https://...",
        "embed_html": "<iframe>..."
      }
    ]
  },
  "links": {
    "qr_code": "https://footprint.onl/api/qr?slug=...",
    "embed_script": "https://footprint.onl/api/embed?slug=...",
    "og_image": "https://footprint.onl/api/og?slug=..."
  }
}`}
          </pre>
        </section>

        {/* QR Code */}
        <section className="mb-12">
          <h2 className="text-xl font-medium mb-4">Generate QR Code</h2>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <code className="font-mono text-sm">
              <span className="text-green-400">GET</span> /qr?slug={'{slug}'}
            </code>
          </div>
          
          <h3 className="font-mono text-sm text-white/50 mb-2">Parameters</h3>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 space-y-2 text-sm">
            <div><code className="text-white/80">size</code> <span className="text-white/40">- Image size in pixels (default: 400, max: 1000)</span></div>
            <div><code className="text-white/80">format</code> <span className="text-white/40">- png or svg (default: png)</span></div>
            <div><code className="text-white/80">dark</code> <span className="text-white/40">- Dark color hex without # (default: 000000)</span></div>
            <div><code className="text-white/80">light</code> <span className="text-white/40">- Light color hex without # (default: FFFFFF)</span></div>
          </div>

          <p className="text-sm text-white/50">Returns image directly (image/png or image/svg+xml)</p>
        </section>

        {/* Embed Widget */}
        <section className="mb-12">
          <h2 className="text-xl font-medium mb-4">Embed Widget</h2>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <code className="font-mono text-sm">
              <span className="text-green-400">GET</span> /embed?slug={'{slug}'}
            </code>
          </div>
          
          <h3 className="font-mono text-sm text-white/50 mb-2">Parameters</h3>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 space-y-2 text-sm">
            <div><code className="text-white/80">style</code> <span className="text-white/40">- minimal, card, or full (default: card)</span></div>
            <div><code className="text-white/80">theme</code> <span className="text-white/40">- Theme name or auto (default: auto)</span></div>
          </div>

          <h3 className="font-mono text-sm text-white/50 mb-2">Usage</h3>
          <pre className="bg-white/5 border border-white/10 rounded-lg p-4 font-mono text-xs">
{`<div id="footprint-embed"></div>
<script src="https://footprint.onl/api/embed?slug=your-slug"></script>`}
          </pre>
        </section>

        {/* OG Image */}
        <section className="mb-12">
          <h2 className="text-xl font-medium mb-4">OG Image</h2>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <code className="font-mono text-sm">
              <span className="text-green-400">GET</span> /og?slug={'{slug}'}
            </code>
          </div>
          <p className="text-sm text-white/50">Returns a 1200x630 PNG image for social sharing previews.</p>
        </section>

        {/* Rate Limits */}
        <section className="mb-12">
          <h2 className="text-xl font-medium mb-4">Rate Limits</h2>
          <p className="text-white/60 mb-4">
            Public API endpoints are rate limited to prevent abuse.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2 text-sm">
            <div><span className="text-white/80">API requests:</span> <span className="text-white/50">100 per hour per IP</span></div>
            <div><span className="text-white/80">QR/OG generation:</span> <span className="text-white/50">Cached for 24 hours</span></div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center pt-12 border-t border-white/10">
          <p className="text-sm text-white/40">
            Questions? Tough luck. Figure it out.
          </p>
        </footer>
      </div>
    </div>
  )
}
