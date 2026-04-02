/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts}',
  ],
  safelist: [
    'aspect-square',
    'aspect-video',
    'aspect-[9/16]',
    'aspect-[3/4]',
    'aspect-[4/3]',
    'col-span-1',
    'col-span-2',
    'row-span-1',
    'row-span-2',
    'row-span-3',
    'md:col-span-2',
    'md:col-span-3',
    'md:col-span-4',
    'md:row-span-1',
    'md:row-span-2',
    'md:row-span-3',
    'md:row-span-4',
    // rail layout
    'flex-row',
    'overflow-x-auto',
    'snap-x',
    'snap-mandatory',
    'snap-start',
    'snap-center',
    'flex-shrink-0',
    'gap-2',
    'gap-4',
    'gap-5',
    'pb-4',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#07080A',
        ink2: '#0B0D10',
        paper: '#F5F5F5',
        glass: 'rgba(255,255,255,0.08)',
        glass2: 'rgba(255,255,255,0.12)',
        stroke: 'rgba(255,255,255,0.12)',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease forwards',
        'fade-in': 'fadeIn 0.6s ease forwards',
        'pop-in': 'popIn 0.5s ease forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
