import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react';

import { createLandingScene } from './scene';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

const STAGES = [
  { icon: ShoppingBag, step: '01', title: 'Order placed', body: 'Shopify orders from both brands land within two minutes, with line items, discounts and customer history.' },
  { icon: PackageCheck, step: '02', title: 'Confirmed', body: 'The confirmation desk works the WhatsApp and phone queue, so only real orders get booked.' },
  { icon: Truck, step: '03', title: 'Shipped', body: 'Every PostEx parcel is matched to its order and tracked through each scan, tier by tier.' },
  { icon: Undo2, step: '04', title: 'Delivered or returned', body: 'Returns are checked in, restocked or written off, and pushed back to Shopify automatically.' },
  { icon: CircleDollarSign, step: '05', title: 'Paid and posted', body: 'COD payouts are reconciled to the rupee and posted to a double-entry ledger.' },
];

const FEATURES = [
  { icon: RefreshCcw, title: 'Live sync', body: 'Shopify and PostEx read every two minutes, plus webhooks. No exports, no reloads.', wide: true },
  { icon: Wallet, title: 'COD reconciliation', body: 'Each payout matched to its parcels. Short-paid or missing money is flagged.' },
  { icon: Boxes, title: 'Inventory', body: 'Stock moves with every parcel, return and stock count, across every location.' },
  { icon: BookOpenCheck, title: 'Accounting', body: 'A real general ledger: COGS, courier fees, expenses and journals, ready for your accountant.', wide: true },
  { icon: Users, title: 'Partners and PR', body: 'Consignment stock with retail partners and influencer seeding, costed properly.' },
  { icon: ShieldCheck, title: 'Roles and 2FA', body: 'Owners, managers and staff each see their part, behind authenticator-app sign-in.' },
];

const STATS = [
  { value: 2, suffix: ' min', label: 'between syncs, around the clock' },
  { value: 14, suffix: '', label: 'modules, one source of truth' },
  { value: 2, suffix: '', label: 'brands, reported apart or together' },
  { value: 0, suffix: '', label: 'spreadsheets to reconcile by hand' },
];

const MARQUEE = ['Shopify', 'PostEx', 'COD payouts', 'Returns', 'Inventory', 'General ledger', 'Purchasing', 'Reconciliation', 'Influencer PR', 'Consignment'];

const YEAR = new Date().getFullYear();

const STATEMENT = 'Monixys turns orders, parcels and payouts into one honest number: what each sale really made.';

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Monixys — Commerce operations, reconciled';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = createLandingScene(canvasRef.current!, reduce);

    const smoother = reduce ? null : ScrollSmoother.create({ wrapper: '#lp-wrapper', content: '#lp-content', smooth: 1.2, effects: true, smoothTouch: 0.1 });

    const ctx = gsap.context(() => {
      ScrollTrigger.create({ trigger: '#lp-content', start: 'top top', end: 'bottom bottom', onUpdate: (self) => scene.setProgress(self.progress) });

      if (reduce) return;

      // Hero entrance.
      const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
      intro
        .from('[data-nav]', { y: -30, autoAlpha: 0, duration: 1.2 })
        .from('[data-hero-line] > span', { yPercent: 110, duration: 1.4, stagger: 0.12 }, 0.15)
        .from('[data-hero-fade]', { y: 24, autoAlpha: 0, duration: 1.2, stagger: 0.1 }, 0.7);

      // Hero drifts away as you scroll.
      gsap.to('[data-hero]', { yPercent: -18, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });

      // Section headings and fades.
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, { y: 60, autoAlpha: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
      });

      // The pipeline: pinned, scrolled sideways.
      const track = document.querySelector<HTMLElement>('[data-track]');
      if (track) {
        const distance = () => track.scrollWidth - window.innerWidth + 64;
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: { trigger: '[data-pipeline]', start: 'top top', end: () => `+=${distance()}`, scrub: 1, pin: true, invalidateOnRefresh: true, anticipatePin: 1 },
        });
        gsap.to('[data-progress]', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '[data-pipeline]', start: 'top top', end: () => `+=${distance()}`, scrub: true } });
      }

      // Bento cards.
      gsap.from('[data-card]', { y: 80, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: '[data-bento]', start: 'top 80%' } });

      // Counters.
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const target = Number(el.dataset.count);
        const value = { n: 0 };
        gsap.to(value, {
          n: target,
          duration: 2,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%' },
          onUpdate: () => {
            el.textContent = String(Math.round(value.n));
          },
        });
      });

      // The statement lights up word by word.
      gsap.fromTo('[data-word]', { opacity: 0.14 }, { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: '[data-statement]', start: 'top 75%', end: 'bottom 45%', scrub: true } });

      // Endless marquee.
      gsap.to('[data-marquee]', { xPercent: -50, ease: 'none', duration: 32, repeat: -1 });
    }, rootRef);

    // Cards follow the pointer with a soft light.
    const onMove = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-glow]');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      ctx.revert();
      smoother?.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      scene.dispose();
    };
  }, []);

  const scrollTo = (id: string) => {
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.scrollTo(id, true, 'top top');
    else document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div ref={rootRef} className="landing bg-brand-navy font-sans text-white antialiased selection:bg-brand-coral/40">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(10,25,47,0.55)_70%)]" aria-hidden />

      <header data-nav className="fixed inset-x-0 top-0 z-50">
        <nav className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-full border border-white/10 bg-brand-navy/50 py-2 pr-2 pl-5 backdrop-blur-xl max-sm:mx-4">
          <a href="/welcome" className="flex items-center gap-2.5" aria-label="Monixys home">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Monixys</span>
          </a>
          <div className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <button onClick={() => scrollTo('#how')} className="transition-colors hover:text-white">How it works</button>
            <button onClick={() => scrollTo('#features')} className="transition-colors hover:text-white">Features</button>
            <button onClick={() => scrollTo('#numbers')} className="transition-colors hover:text-white">Numbers</button>
          </div>
          <a href="/" className="group flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-navy transition-transform hover:scale-[1.03]">
            Sign in <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </nav>
      </header>

      <div id="lp-wrapper">
        <div id="lp-content" className="relative">
          {/* Hero */}
          <section data-hero className="relative flex min-h-svh flex-col justify-center px-4 pt-28 pb-20 sm:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <p data-hero-fade className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/70 backdrop-blur">
                <span className="size-1.5 animate-pulse rounded-full bg-brand-coral" /> Commerce operations for Shopify and PostEx
              </p>
              <h1 className="text-[clamp(2.75rem,8vw,7.5rem)] leading-[0.95] font-semibold tracking-[-0.045em]">
                <span data-hero-line className="block overflow-hidden pb-[0.06em]"><span className="block">Every order.</span></span>
                <span data-hero-line className="block overflow-hidden pb-[0.06em]"><span className="block text-white/55">Every parcel.</span></span>
                <span data-hero-line className="block overflow-hidden pb-[0.06em]">
                  <span className="block bg-gradient-to-r from-brand-coral via-brand-coral-soft to-[#ffb4a8] bg-clip-text text-transparent">Every rupee.</span>
                </span>
              </h1>
              <p data-hero-fade className="mt-8 max-w-xl text-lg leading-relaxed text-white/65 sm:text-xl">
                Monixys joins your storefront, your courier and your books into one live system, so you always know what was sold, what was delivered and what was actually earned.
              </p>
              <div data-hero-fade className="mt-10 flex flex-wrap items-center gap-3">
                <a href="/" className="group inline-flex items-center gap-2 rounded-full bg-brand-coral px-6 py-3.5 text-sm font-medium shadow-[0_10px_40px_-10px_rgba(228,73,70,0.8)] transition-transform hover:scale-[1.03]">
                  Open Monixys <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
                <button onClick={() => scrollTo('#how')} className="rounded-full border border-white/15 px-6 py-3.5 text-sm text-white/80 backdrop-blur transition-colors hover:border-white/40 hover:text-white">
                  See how it works
                </button>
              </div>
            </div>
            <div data-hero-fade className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-[11px] tracking-[0.25em] text-white/40 uppercase">
              Scroll
              <span className="relative h-10 w-px overflow-hidden bg-white/15">
                <span className="absolute inset-x-0 top-0 h-1/2 animate-[lp-drop_1.8s_ease-in-out_infinite] bg-white/70" />
              </span>
            </div>
          </section>

          {/* Marquee */}
          <div className="relative overflow-hidden border-y border-white/10 bg-brand-navy/60 py-6 backdrop-blur-md">
            <div data-marquee className="flex w-max gap-12 pr-12 text-2xl font-medium tracking-tight whitespace-nowrap text-white/35 sm:text-3xl">
              {[...MARQUEE, ...MARQUEE].map((m, i) => (
                <span key={i} className="flex items-center gap-12">
                  {m} <span className="text-brand-coral/70">✦</span>
                </span>
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <section id="how" data-pipeline className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-gradient-to-b from-brand-navy/70 to-brand-navy/90 py-24 backdrop-blur-[2px]">
            <div className="mx-auto mb-14 w-full max-w-6xl px-4 sm:px-8">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="max-w-3xl text-[clamp(2rem,5vw,4rem)] leading-[1.02] font-semibold tracking-[-0.035em]">
                From checkout to cash, <span className="text-white/45">followed at every step.</span>
              </h2>
              <div className="mt-8 h-px w-full max-w-md bg-white/10">
                <div data-progress className="h-px origin-left scale-x-0 bg-brand-coral" />
              </div>
            </div>
            <div data-track className="flex w-max gap-5 px-4 sm:px-8 lg:pl-[max(2rem,calc((100vw-72rem)/2+2rem))]">
              {STAGES.map(({ icon: Icon, step, title, body }) => (
                <article key={step} data-glow className="lp-card group relative flex h-[22rem] w-[min(80vw,24rem)] shrink-0 flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl">
                  <div className="flex items-start justify-between">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-coral/15 text-brand-coral ring-1 ring-brand-coral/30">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-mono text-sm text-white/30">{step}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
                    <p className="mt-3 leading-relaxed text-white/60">{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Features */}
          <section id="features" className="relative bg-brand-navy/90 px-4 py-32 backdrop-blur-sm sm:px-8">
            <div className="mx-auto max-w-6xl">
              <div data-reveal>
                <Eyebrow>Features</Eyebrow>
                <h2 className="max-w-3xl text-[clamp(2rem,5vw,4rem)] leading-[1.02] font-semibold tracking-[-0.035em]">
                  Everything the back office does, <span className="text-white/45">in one place.</span>
                </h2>
              </div>
              <div data-bento className="mt-16 grid gap-4 md:grid-cols-3">
                {FEATURES.map(({ icon: Icon, title, body, wide }) => (
                  <article
                    key={title}
                    data-card
                    data-glow
                    className={`lp-card group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition-colors hover:border-white/20 ${wide ? 'md:col-span-2' : ''}`}
                  >
                    <Icon className="size-6 text-brand-coral transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" />
                    <h3 className="mt-10 text-xl font-semibold tracking-tight">{title}</h3>
                    <p className="mt-2 max-w-md leading-relaxed text-white/55">{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Statement */}
          <section data-statement className="relative bg-brand-navy px-4 py-40 sm:px-8">
            <p className="mx-auto max-w-5xl text-[clamp(1.75rem,4.2vw,3.5rem)] leading-[1.15] font-semibold tracking-[-0.03em]">
              {STATEMENT.split(' ').map((w, i) => (
                <span key={i} data-word className="inline-block pr-[0.25em]">
                  {w}
                </span>
              ))}
            </p>
          </section>

          {/* Numbers */}
          <section id="numbers" className="relative bg-brand-navy px-4 pb-32 sm:px-8">
            <div className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} data-reveal className="bg-brand-navy p-8 sm:p-10">
                  <div className="text-6xl font-semibold tracking-[-0.05em] tabular-nums">
                    <span data-count={s.value}>{s.value}</span>
                    <span className="text-brand-coral">{s.suffix}</span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-white/50">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Call to action */}
          <section className="relative overflow-hidden bg-brand-navy px-4 pb-16 sm:px-8">
            <div data-reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-brand-navy-soft to-brand-navy px-8 py-20 text-center sm:px-16 sm:py-28">
              <div className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-coral/25 blur-[120px]" aria-hidden />
              <h2 className="relative text-[clamp(2.25rem,6vw,5rem)] leading-none font-semibold tracking-[-0.045em]">Know your real profit.</h2>
              <p className="relative mx-auto mt-6 max-w-lg text-lg text-white/60">Sign in to see today's orders, parcels and payouts, already reconciled.</p>
              <a href="/" className="group relative mt-10 inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-medium text-brand-navy transition-transform hover:scale-[1.03]">
                Sign in to Monixys <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
            <footer className="mx-auto mt-16 flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-white/40 sm:flex-row">
              <div className="flex items-center gap-2.5">
                <Logo /> <span className="font-medium text-white/70">Monixys</span>
              </div>
              <p>© {YEAR} Monixys · Built by Codilated</p>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="mb-5 flex items-center gap-3 text-xs font-medium tracking-[0.25em] text-brand-coral uppercase">
      <span className="h-px w-8 bg-brand-coral" /> {children}
    </p>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <defs>
        <linearGradient id="lp-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ef6c68" />
          <stop offset="1" stopColor="#e44946" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lp-logo)" />
      <path d="M8 22V10.5l8 7 8-7V22" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
