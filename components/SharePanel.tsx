'use client'

import { useState } from 'react'
import { toast } from 'sonner'

interface SharePanelProps {
  slug: string
  footprintId: string
}

/**
 * Share Panel Component
 * 
 * A comprehensive sharing toolkit for the editor sidebar:
 * - Direct link with copy button
 * - QR code download (PNG and SVG)
 * - Embed code generator with style options
 * - Data export button
 * 
 * The goal is to make distribution effortless. Users should be able
 * to put their Footprint anywhere - business cards, websites, emails.
 */
export default function SharePanel({ slug, footprintId }: SharePanelProps) {
  const [embedStyle, setEmbedStyle] = useState<'card' | 'minimal' | 'full'>('card')
  const [showEmbed, setShowEmbed] = useState(false)
  const [exporting, setExporting] = useState(false)

  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.link'
  
  const footprintUrl = `${baseUrl}/${slug}`
  const qrUrl = `${baseUrl}/api/qr?slug=${slug}`
  const embedUrl = `${baseUrl}/api/embed?slug=${slug}&style=${embedStyle}`

  // Copy link to clipboard
  function copyLink() {
    navigator.clipboard.writeText(footprintUrl)
    toast.success('Link copied!')
  }

  // Copy embed code to clipboard
  function copyEmbed() {
    const embedCode = `<div id="footprint-embed"></div>\n<script src="${embedUrl}"></script>`
    navigator.clipboard.writeText(embedCode)
    toast.success('Embed code copied!')
  }

  // Download QR code
  async function downloadQR(format: 'png' | 'svg') {
    const url = `${qrUrl}&format=${format}&size=800`
    
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      
      // Create download link
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `footprint-${slug}-qr.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
      
      toast.success(`QR code downloaded!`)
    } catch (error) {
      toast.error('Failed to download QR code')
    }
  }

  // Export all data
  async function exportData() {
    setExporting(true)
    
    try {
      const response = await fetch('/api/export')
      
      if (!response.ok) {
        throw new Error('Export failed')
      }
      
      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'footprint-export.json'
      
      // Create download link
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
      
      toast.success('Export downloaded!')
    } catch (error) {
      toast.error('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)]">
        Share & Export
      </div>

      {/* Direct Link */}
      <div>
        <label className="font-mono text-xs text-[var(--text-muted)] block mb-2">
          Your link
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={footprintUrl}
            readOnly
            className="flex-1 px-3 py-2 bg-[var(--glass)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--text-muted)] truncate"
          />
          <button
            onClick={copyLink}
            className="px-3 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg font-mono text-xs"
          >
            Copy
          </button>
        </div>
      </div>

      {/* QR Code */}
      <div>
        <label className="font-mono text-xs text-[var(--text-muted)] block mb-2">
          QR Code
        </label>
        <div className="flex gap-2">
          <div className="w-24 h-24 bg-white rounded-lg flex items-center justify-center">
            <img 
              src={`${qrUrl}&size=96`} 
              alt="QR Code" 
              className="w-20 h-20"
            />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <button
              onClick={() => downloadQR('png')}
              className="flex-1 px-3 py-2 bg-[var(--glass)] border border-[var(--border)] rounded-lg font-mono text-xs hover:bg-[var(--glass-hover)] transition-colors"
            >
              Download PNG
            </button>
            <button
              onClick={() => downloadQR('svg')}
              className="flex-1 px-3 py-2 bg-[var(--glass)] border border-[var(--border)] rounded-lg font-mono text-xs hover:bg-[var(--glass-hover)] transition-colors"
            >
              Download SVG
            </button>
          </div>
        </div>
      </div>

      {/* Embed Code */}
      <div>
        <button
          onClick={() => setShowEmbed(!showEmbed)}
          className="flex items-center justify-between w-full font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <span>Embed on your site</span>
          <span>{showEmbed ? '−' : '+'}</span>
        </button>
        
        {showEmbed && (
          <div className="mt-3 space-y-3">
            {/* Style selector */}
            <div className="flex gap-2">
              {(['minimal', 'card', 'full'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setEmbedStyle(style)}
                  className={`flex-1 px-3 py-2 rounded-lg font-mono text-xs transition-colors ${
                    embedStyle === style
                      ? 'bg-[var(--accent)] text-[var(--bg)]'
                      : 'bg-[var(--glass)] border border-[var(--border)] hover:bg-[var(--glass-hover)]'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            
            {/* Code preview */}
            <div className="bg-[var(--glass)] border border-[var(--border)] rounded-lg p-3">
              <pre className="font-mono text-xs text-[var(--text-muted)] whitespace-pre-wrap break-all">
{`<div id="footprint-embed"></div>
<script src="${embedUrl}"></script>`}
              </pre>
            </div>
            
            <button
              onClick={copyEmbed}
              className="w-full px-3 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg font-mono text-xs"
            >
              Copy embed code
            </button>
          </div>
        )}
      </div>

      {/* Export Data */}
      <div className="pt-4 border-t border-[var(--border)]">
        <button
          onClick={exportData}
          disabled={exporting}
          className="w-full px-3 py-3 bg-[var(--glass)] border border-[var(--border)] rounded-lg font-mono text-xs hover:bg-[var(--glass-hover)] transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export all data (JSON)'}
        </button>
        <p className="font-mono text-xs text-[var(--text-muted)] mt-2 text-center opacity-60">
          Download everything. It's your data.
        </p>
      </div>
    </div>
  )
}
