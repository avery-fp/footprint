import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/embed?slug=xxx
 * 
 * Returns a JavaScript widget that renders a Footprint on any website.
 * 
 * Usage on external site:
 * <div id="footprint-embed"></div>
 * <script src="https://footprint.link/api/embed?slug=your-slug"></script>
 * 
 * The widget:
 * 1. Fetches footprint data from our API
 * 2. Renders a beautiful mini-card or full embed
 * 3. Links back to the full footprint page
 * 4. Respects the footprint's theme
 * 
 * We serve this as JavaScript so it can self-initialize on any page.
 * The embed is lightweight and doesn't require any framework.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  const style = searchParams.get('style') || 'card' // card, minimal, full
  const theme = searchParams.get('theme') || 'auto' // auto uses footprint's theme

  // Base URL for assets and links
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.link'

  // If no slug, return helper script
  if (!slug) {
    return new NextResponse(
      `console.error('[Footprint] Missing slug parameter. Usage: /api/embed?slug=your-slug');`,
      { headers: { 'Content-Type': 'application/javascript' } }
    )
  }

  // Fetch footprint data
  const supabase = createServerSupabaseClient()
  
  const { data: footprint, error } = await supabase
    .from('footprints')
    .select(`
      slug, display_name, handle, bio, avatar_url, theme,
      users (serial_number),
      content (id, type, title, thumbnail_url)
    `)
    .eq('slug', slug)
    .eq('is_public', true)
    .single()

  if (error || !footprint) {
    return new NextResponse(
      `console.error('[Footprint] Footprint not found: ${slug}');`,
      { headers: { 'Content-Type': 'application/javascript' } }
    )
  }

  // Build the embed script
  const embedScript = generateEmbedScript({
    baseUrl,
    slug,
    style,
    theme: theme === 'auto' ? (footprint.theme || 'midnight') : theme,
    data: {
      displayName: footprint.display_name || 'Untitled',
      handle: footprint.handle || '',
      bio: footprint.bio || '',
      avatarUrl: footprint.avatar_url,
      serialNumber: footprint.users?.serial_number || 0,
      contentCount: footprint.content?.length || 0,
      contentPreview: (footprint.content || []).slice(0, 3),
    },
  })

  return new NextResponse(embedScript, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
    },
  })
}

/**
 * Generate the embed script based on style and data
 */
function generateEmbedScript(params: {
  baseUrl: string
  slug: string
  style: string
  theme: string
  data: {
    displayName: string
    handle: string
    bio: string
    avatarUrl: string | null
    serialNumber: number
    contentCount: number
    contentPreview: any[]
  }
}) {
  const { baseUrl, slug, style, theme, data } = params
  const footprintUrl = `${baseUrl}/${slug}`
  
  // Theme colors (simplified for embed)
  const themes: Record<string, { bg: string; text: string; muted: string; border: string }> = {
    midnight: { bg: '#07080A', text: '#F5F5F5', muted: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.12)' },
    paper: { bg: '#FFFFFF', text: '#07080A', muted: 'rgba(0,0,0,0.5)', border: 'rgba(0,0,0,0.1)' },
    cream: { bg: '#FAF7F2', text: '#2C2C2C', muted: 'rgba(44,44,44,0.5)', border: 'rgba(44,44,44,0.1)' },
    ocean: { bg: '#0A1628', text: '#E8F0F8', muted: 'rgba(232,240,248,0.5)', border: 'rgba(232,240,248,0.12)' },
    ember: { bg: '#1A1410', text: '#F5EDE4', muted: 'rgba(245,237,228,0.5)', border: 'rgba(245,237,228,0.12)' },
    forest: { bg: '#0D1A14', text: '#E4F0E8', muted: 'rgba(228,240,232,0.5)', border: 'rgba(228,240,232,0.12)' },
    violet: { bg: '#14101A', text: '#F0E8F5', muted: 'rgba(240,232,245,0.5)', border: 'rgba(240,232,245,0.12)' },
    terminal: { bg: '#000000', text: '#00FF00', muted: 'rgba(0,255,0,0.5)', border: 'rgba(0,255,0,0.2)' },
  }
  
  const colors = themes[theme] || themes.midnight

  // Generate HTML based on style
  let embedHTML = ''
  
  if (style === 'minimal') {
    // Minimal: just name and link
    embedHTML = `
      <a href="${footprintUrl}" target="_blank" rel="noopener" style="
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: ${colors.bg};
        color: ${colors.text};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        text-decoration: none;
        transition: opacity 0.2s;
      " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
        ${data.avatarUrl 
          ? `<img src="${data.avatarUrl}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" />`
          : `<span style="width:24px;height:24px;border-radius:50%;background:${colors.border};display:flex;align-items:center;justify-content:center;font-size:12px;">◈</span>`
        }
        <span>${data.displayName}</span>
        <span style="color:${colors.muted};font-size:12px;">→</span>
      </a>
    `.replace(/\s+/g, ' ').trim()
  } else if (style === 'full') {
    // Full: shows content preview
    const contentPreviewHTML = data.contentPreview.map(item => `
      <div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${item.title || item.type}
      </div>
    `).join('')
    
    embedHTML = `
      <a href="${footprintUrl}" target="_blank" rel="noopener" style="
        display: block;
        max-width: 320px;
        padding: 20px;
        background: ${colors.bg};
        color: ${colors.text};
        border: 1px solid ${colors.border};
        border-radius: 16px;
        font-family: system-ui, sans-serif;
        text-decoration: none;
        transition: transform 0.2s, box-shadow 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          ${data.avatarUrl 
            ? `<img src="${data.avatarUrl}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" />`
            : `<div style="width:48px;height:48px;border-radius:50%;background:${colors.border};display:flex;align-items:center;justify-content:center;font-size:20px;">◈</div>`
          }
          <div>
            <div style="font-weight:500;margin-bottom:2px;">${data.displayName}</div>
            ${data.handle ? `<div style="font-size:12px;color:${colors.muted};">${data.handle}</div>` : ''}
          </div>
        </div>
        ${data.bio ? `<p style="font-size:13px;color:${colors.muted};margin:0 0 12px 0;line-height:1.4;">${data.bio.slice(0, 100)}${data.bio.length > 100 ? '...' : ''}</p>` : ''}
        ${contentPreviewHTML ? `<div style="display:flex;gap:6px;margin-bottom:12px;">${contentPreviewHTML}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${colors.muted};">
          <span>Footprint #${data.serialNumber.toLocaleString()}</span>
          <span>${data.contentCount} items</span>
        </div>
      </a>
    `.replace(/\s+/g, ' ').trim()
  } else {
    // Card (default): balanced view
    embedHTML = `
      <a href="${footprintUrl}" target="_blank" rel="noopener" style="
        display: block;
        max-width: 280px;
        padding: 16px;
        background: ${colors.bg};
        color: ${colors.text};
        border: 1px solid ${colors.border};
        border-radius: 12px;
        font-family: system-ui, sans-serif;
        text-decoration: none;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
        <div style="display:flex;align-items:center;gap:12px;">
          ${data.avatarUrl 
            ? `<img src="${data.avatarUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />`
            : `<div style="width:40px;height:40px;border-radius:50%;background:${colors.border};display:flex;align-items:center;justify-content:center;">◈</div>`
          }
          <div style="flex:1;min-width:0;">
            <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.displayName}</div>
            <div style="font-size:12px;color:${colors.muted};">${data.contentCount} items · #${data.serialNumber.toLocaleString()}</div>
          </div>
          <span style="color:${colors.muted};">→</span>
        </div>
      </a>
    `.replace(/\s+/g, ' ').trim()
  }

  // Return the JavaScript that injects the embed
  return `
(function() {
  // Find the container
  var container = document.getElementById('footprint-embed');
  if (!container) {
    container = document.currentScript.parentElement;
  }
  if (!container) {
    console.error('[Footprint] No container found. Add id="footprint-embed" to a div.');
    return;
  }
  
  // Inject the embed
  container.innerHTML = '${embedHTML.replace(/'/g, "\\'")}';
})();
`.trim()
}
