/**
 * FOOTPRINT THEMES
 * 
 * A theme system that lets users customize their footprint's look.
 * Each theme defines colors, fonts, and visual effects.
 * 
 * Themes are applied via CSS custom properties (variables),
 * making it easy to switch themes without JavaScript.
 * 
 * The philosophy: opinionated but good. Not infinite customization,
 * just a handful of carefully designed themes that all look premium.
 */

export interface Theme {
  id: string
  name: string
  description: string
  preview: string  // CSS gradient or color for theme picker preview
  
  // Colors
  colors: {
    background: string
    backgroundAlt: string
    text: string
    textMuted: string
    border: string
    accent: string
    glass: string
    glassHover: string
  }
  
  // Typography
  fonts?: {
    heading?: string
    body?: string
    mono?: string
  }
  
  // Effects
  effects?: {
    noise?: boolean
    grain?: number
    blur?: number
  }
}

// ============================================
// BUILT-IN THEMES
// ============================================

export const themes: Record<string, Theme> = {
  // Default dark theme - the OG
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'The original. Dark, minimal, timeless.',
    preview: 'linear-gradient(135deg, #07080A, #0B0D10)',
    colors: {
      background: 'radial-gradient(ellipse at 50% 0%, rgba(15,10,40,1) 0%, rgba(5,5,15,1) 70%, rgba(0,0,0,1) 100%)',
      backgroundAlt: '#0B0D10',
      text: '#F5F5F5',
      textMuted: 'rgba(255,255,255,0.5)',
      border: 'rgba(255,255,255,0.12)',
      accent: '#F5F5F5',
      glass: 'rgba(255,255,255,0.08)',
      glassHover: 'rgba(255,255,255,0.12)',
    },
    effects: { noise: true, grain: 0.03 },
  },

  // Pure white - clean, bold
  paper: {
    id: 'paper',
    name: 'Paper',
    description: 'Clean white. Lets the content breathe.',
    preview: 'linear-gradient(135deg, #FFFFFF, #F5F5F5)',
    colors: {
      background: '#FFFFFF',
      backgroundAlt: '#F8F8F8',
      text: '#07080A',
      textMuted: 'rgba(0,0,0,0.5)',
      border: 'rgba(0,0,0,0.1)',
      accent: '#07080A',
      glass: 'rgba(0,0,0,0.04)',
      glassHover: 'rgba(0,0,0,0.08)',
    },
    effects: { noise: false },
  },

  // Warm cream - cozy, editorial
  cream: {
    id: 'cream',
    name: 'Cream',
    description: 'Warm and editorial. Like aged paper.',
    preview: 'linear-gradient(135deg, #FAF7F2, #F0EBE3)',
    colors: {
      background: '#FAF7F2',
      backgroundAlt: '#F0EBE3',
      text: '#2C2C2C',
      textMuted: 'rgba(44,44,44,0.5)',
      border: 'rgba(44,44,44,0.1)',
      accent: '#8B7355',
      glass: 'rgba(44,44,44,0.04)',
      glassHover: 'rgba(44,44,44,0.08)',
    },
    effects: { noise: true, grain: 0.02 },
  },

  // Deep blue - calm, trustworthy
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue depths. Calm and focused.',
    preview: 'linear-gradient(135deg, #0A1628, #0F2744)',
    colors: {
      background: '#0A1628',
      backgroundAlt: '#0F2744',
      text: '#E8F0F8',
      textMuted: 'rgba(232,240,248,0.5)',
      border: 'rgba(232,240,248,0.12)',
      accent: '#5CA4E8',
      glass: 'rgba(92,164,232,0.08)',
      glassHover: 'rgba(92,164,232,0.15)',
    },
    effects: { noise: true, grain: 0.03 },
  },

  // Warm dark - like candlelight
  ember: {
    id: 'ember',
    name: 'Ember',
    description: 'Warm darkness. Like candlelight.',
    preview: 'linear-gradient(135deg, #1A1410, #241C16)',
    colors: {
      background: '#1A1410',
      backgroundAlt: '#241C16',
      text: '#F5EDE4',
      textMuted: 'rgba(245,237,228,0.5)',
      border: 'rgba(245,237,228,0.12)',
      accent: '#E8A855',
      glass: 'rgba(232,168,85,0.08)',
      glassHover: 'rgba(232,168,85,0.15)',
    },
    effects: { noise: true, grain: 0.04 },
  },

  // Forest green - organic, natural
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Deep greens. Organic and grounded.',
    preview: 'linear-gradient(135deg, #0D1A14, #142820)',
    colors: {
      background: '#0D1A14',
      backgroundAlt: '#142820',
      text: '#E4F0E8',
      textMuted: 'rgba(228,240,232,0.5)',
      border: 'rgba(228,240,232,0.12)',
      accent: '#5DB87A',
      glass: 'rgba(93,184,122,0.08)',
      glassHover: 'rgba(93,184,122,0.15)',
    },
    effects: { noise: true, grain: 0.03 },
  },

  // Purple haze - creative, dreamy
  violet: {
    id: 'violet',
    name: 'Violet',
    description: 'Dreamy purple. Creative energy.',
    preview: 'linear-gradient(135deg, #14101A, #1E1628)',
    colors: {
      background: '#14101A',
      backgroundAlt: '#1E1628',
      text: '#F0E8F5',
      textMuted: 'rgba(240,232,245,0.5)',
      border: 'rgba(240,232,245,0.12)',
      accent: '#A87DD8',
      glass: 'rgba(168,125,216,0.08)',
      glassHover: 'rgba(168,125,216,0.15)',
    },
    effects: { noise: true, grain: 0.03 },
  },

  // Terminal green - hacker aesthetic
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    description: 'Green on black. Old school.',
    preview: 'linear-gradient(135deg, #000000, #0A0A0A)',
    colors: {
      background: '#000000',
      backgroundAlt: '#0A0A0A',
      text: '#00FF00',
      textMuted: 'rgba(0,255,0,0.5)',
      border: 'rgba(0,255,0,0.2)',
      accent: '#00FF00',
      glass: 'rgba(0,255,0,0.05)',
      glassHover: 'rgba(0,255,0,0.1)',
    },
    fonts: {
      heading: 'JetBrains Mono, monospace',
      body: 'JetBrains Mono, monospace',
      mono: 'JetBrains Mono, monospace',
    },
    effects: { noise: false },
  },
}

// ============================================
// THEME UTILITIES
// ============================================

/**
 * Get a theme by ID, falling back to midnight
 */
export function getTheme(id: string): Theme {
  return themes[id] || themes.midnight
}

/**
 * Generate CSS custom properties for a theme
 */
export function getThemeCSS(theme: Theme): string {
  return `
    --bg: ${theme.colors.background};
    --bg-alt: ${theme.colors.backgroundAlt};
    --text: ${theme.colors.text};
    --text-muted: ${theme.colors.textMuted};
    --border: ${theme.colors.border};
    --accent: ${theme.colors.accent};
    --glass: ${theme.colors.glass};
    --glass-hover: ${theme.colors.glassHover};
    ${theme.fonts?.heading ? `--font-heading: ${theme.fonts.heading};` : ''}
    ${theme.fonts?.body ? `--font-body: ${theme.fonts.body};` : ''}
    ${theme.fonts?.mono ? `--font-mono: ${theme.fonts.mono};` : ''}
    ${theme.effects?.grain ? `--grain: ${theme.effects.grain};` : ''}
  `.trim()
}

/**
 * Get all available themes as an array
 */
export function getAllThemes(): Theme[] {
  return Object.values(themes)
}

/**
 * Check if a theme ID is valid
 */
export function isValidTheme(id: string): boolean {
  return id in themes
}
