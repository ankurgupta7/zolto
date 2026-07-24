import { useEffect, useRef } from "react";

/**
 * ParticleField — a page-wide layer of slowly drifting gold "dust", the animated
 * background half of the homepage's parallax treatment (the hero image supplies
 * the scroll-parallax; this supplies the ambient motion).
 *
 * It renders as a fixed, full-viewport canvas that sits *in front of* page
 * content (but below the sticky chrome at z-50) with `mix-blend-mode: screen`.
 * Screen blend means the warm particles glow against the dark mahogany bands
 * (hero, closing CTA) and all but vanish over the light cream sections and
 * product photography — so the effect reads where it flatters and stays out of
 * the way where it wouldn't. `pointer-events: none` keeps it purely decorative.
 *
 * Motion is paused when the tab is hidden, and honoured `prefers-reduced-motion`
 * renders a single static frame instead of animating.
 */

interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  a: number;
}

interface ParticleFieldProps {
  /**
   * Roughly one particle per this many CSS px² of viewport. Lower = denser.
   * The default is tuned to read at a glance without distracting.
   */
  density?: number;
  className?: string;
}

// Warm gold, in the --brand-accent-light family, kept as an "r, g, b" string so
// per-particle alpha can be composed cheaply.
const PARTICLE_RGB = "224, 190, 110";

export default function ParticleField({
  density = 6500,
  className = "",
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // In jsdom (tests) and on unsupported browsers getContext is unavailable —
    // degrade to an inert, empty canvas rather than throwing.
    if (!ctx) return;

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;

    const seed = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(12, Math.round((width * height) / density));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2.2 + 0.7,
        vy: Math.random() * 0.32 + 0.08,
        vx: (Math.random() - 0.5) * 0.16,
        a: Math.random() * 0.5 + 0.28,
      }));
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        // soft glow so each fleck reads as light rather than a flat dot
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        glow.addColorStop(0, `rgba(${PARTICLE_RGB}, ${p.a})`);
        glow.addColorStop(1, `rgba(${PARTICLE_RGB}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${PARTICLE_RGB}, ${Math.min(1, p.a + 0.15)})`;
        ctx.fill();
      }
    };

    const step = () => {
      for (const p of particles) {
        p.y -= p.vy;
        p.x += p.vx;
        if (p.y < -4) {
          p.y = height + 4;
          p.x = Math.random() * width;
        }
        if (p.x < -4) p.x = width + 4;
        else if (p.x > width + 4) p.x = -4;
      }
      paint();
      if (!document.hidden) raf = requestAnimationFrame(step);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reduce) {
        paint();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const onResize = () => {
      seed();
      if (reduce) paint();
    };
    const onVisibility = () => {
      if (!document.hidden && !reduce) start();
    };

    seed();
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="particle-field"
      className={`pointer-events-none fixed inset-0 z-30 mix-blend-screen ${className}`}
    />
  );
}
