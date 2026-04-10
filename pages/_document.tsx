import { Head, Html, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind = {
                config: {
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
                    }
                  }
                }
              };
            `,
          }}
        />
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          html, body, #__next { min-height: 100%; }
          html, body {
            margin: 0;
            background: #080808;
            color: #F5F5F5;
            font-family: 'Space Grotesk', system-ui, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          button, input, textarea, select { font: inherit; }
          .artifact-range::-webkit-slider-runnable-track {
            height: 3px;
            background: transparent;
          }
          .artifact-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            margin-top: -5px;
            height: 12px;
            width: 12px;
            border-radius: 9999px;
            background: #f5d7b2;
            box-shadow: 0 0 0 3px rgba(245, 215, 178, 0.14);
          }
          .artifact-range::-moz-range-track {
            height: 3px;
            background: transparent;
          }
          .artifact-range::-moz-range-thumb {
            height: 12px;
            width: 12px;
            border: 0;
            border-radius: 9999px;
            background: #f5d7b2;
            box-shadow: 0 0 0 3px rgba(245, 215, 178, 0.14);
          }
        `}</style>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
