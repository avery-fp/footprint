'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Home() {
  const [nextSerial, setNextSerial] = useState(8291)
  
  // Simulate serial number incrementing (would be real-time in production)
  useEffect(() => {
    setNextSerial(8291 + Math.floor(Math.random() * 50))
  }, [])

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 p-6 bg-gradient-to-b from-ink to-transparent">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="font-mono text-sm tracking-widest uppercase text-paper/90">
            Footprint
          </Link>
          <span className="font-mono text-xs text-white/40 tracking-wide">
            #{nextSerial.toLocaleString()} available
          </span>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center px-6 py-32">
        <div className="max-w-3xl">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-light tracking-tight mb-8 opacity-0 animate-fade-up">
            Footprint
          </h1>
          
          <p className="text-xl md:text-2xl font-light text-white/60 mb-8 tracking-wide opacity-0 animate-fade-up delay-200">
            One page. Paste anything. Yours forever.
          </p>
          
          <p className="font-mono text-sm tracking-widest uppercase text-white/50 mb-12 opacity-0 animate-fade-up delay-300">
            $10 · Infinite rooms · No subscription
          </p>
          
          <Link 
            href="/checkout"
            className="btn-primary inline-block rounded-none opacity-0 animate-fade-up delay-400"
          >
            Get yours
          </Link>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-0 animate-fade-up delay-700">
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent animate-pulse" />
        </div>
      </section>

      {/* Preview Section */}
      <section className="py-32 px-6 bg-ink2 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-xs tracking-widest uppercase text-white/35 text-center mb-16">
            Your universe, one link
          </p>
          
          {/* Card Preview */}
          <div className="flex justify-center perspective-1000">
            <div className="w-full max-w-sm aspect-[3/4] glass rounded-3xl p-8 flex flex-col relative overflow-hidden transform-style-preserve-3d transition-transform duration-500 hover:rotate-y-[-5deg] hover:rotate-x-[5deg] cursor-pointer">
              {/* Shine effect */}
              <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-radial-gradient from-white/10 to-transparent pointer-events-none" />
              
              <span className="font-mono text-xs tracking-widest text-white/40 mb-auto">
                #{nextSerial.toLocaleString()}
              </span>
              
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/20 to-white/5 border-2 border-white/10 mb-6" />
              
              <h3 className="text-2xl font-normal tracking-tight mb-2">Your Name</h3>
              <span className="font-mono text-sm text-white/50 mb-6">@yourname</span>
              
              <div className="grid grid-cols-3 gap-2 mt-auto">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-square bg-white/[0.06] rounded-lg border border-white/10" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Section */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-xs tracking-widest uppercase text-white/35 text-center mb-16">
            What it is
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: '◈',
                title: 'Paste anything',
                desc: 'YouTube, Spotify, tweets, images, articles. Paste a URL. It embeds beautifully. Your taste, displayed.',
              },
              {
                icon: '∞',
                title: 'Infinite rooms',
                desc: 'One footprint for music. One for work. One for chaos. Make as many universes as you want.',
              },
              {
                icon: '#',
                title: 'Yours forever',
                desc: 'Serial number that\'s yours permanently. Can never be bought again. Timestamp as status.',
              },
            ].map((item, i) => (
              <div 
                key={i}
                className="glass glass-hover rounded-2xl p-8 transition-all card-hover"
              >
                <div className="text-3xl mb-6 opacity-80">{item.icon}</div>
                <h3 className="text-lg font-medium mb-3">{item.title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Section */}
      <section className="py-32 px-6 bg-ink2 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-xs tracking-widest uppercase text-white/35 text-center mb-16">
            How it works
          </p>
          
          <div className="flex flex-wrap justify-center gap-16 max-w-3xl mx-auto">
            {[
              { num: '01', text: 'Pay $10. Once. That\'s it.' },
              { num: '02', text: 'Get your link and serial number.' },
              { num: '03', text: 'Paste URLs. Build your universe.' },
            ].map((step, i) => (
              <div key={i} className="text-center max-w-[200px]">
                <div className="font-mono text-5xl font-light text-white/15 mb-4">{step.num}</div>
                <p className="text-white/70">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-32 px-6">
        <div className="max-w-xl mx-auto">
          <p className="font-mono text-xs tracking-widest uppercase text-white/35 text-center mb-16">
            Questions
          </p>
          
          <div className="space-y-0">
            {[
              { q: 'Do you have Instagram?', a: 'No.' },
              { q: 'How do I contact support?', a: 'You don\'t.' },
              { q: 'Can I get a refund?', a: 'No.' },
              { q: 'Is this legit?', a: 'Yeah.' },
              { q: 'Who made this?', a: 'Doesn\'t matter.' },
            ].map((faq, i) => (
              <div key={i} className="py-6 border-b border-white/10">
                <p className="font-mono text-sm text-white/50 mb-2">{faq.q}</p>
                <p className="text-paper">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 bg-ink2 text-center relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        <p className="text-3xl md:text-4xl font-light max-w-lg mx-auto mb-12 leading-relaxed">
          This isn't for everybody. <span className="text-white/40">Thankfully.</span>
        </p>
        
        <Link 
          href="/checkout"
          className="btn-primary inline-block rounded-none"
        >
          $10 · Get yours
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/10 text-center">
        <div className="flex justify-center gap-8 mb-6">
          <Link href="/terms" className="font-mono text-xs text-white/40 hover:text-white/60 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="font-mono text-xs text-white/40 hover:text-white/60 transition-colors">
            Privacy
          </Link>
          <a href="https://myspace.com" target="_blank" rel="noopener" className="font-mono text-xs text-white/40 hover:text-white/60 transition-colors">
            Follow us on MySpace
          </a>
        </div>
        <p className="font-mono text-xs text-white/25">
          No refunds. Figure it out.
        </p>
      </footer>
    </div>
  )
}
