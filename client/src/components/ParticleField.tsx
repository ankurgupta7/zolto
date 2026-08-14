import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ParticleField — a page-wide layer of slowly drifting gold "dust", the animated
 * background half of the homepage's parallax treatment (the hero image supplies
 * the scroll-parallax; this supplies the ambient motion).
 *
 * It renders as a fixed, full-viewport canvas that sits *in front of* page
 * content (but below the sticky chrome at z-50), blended into it. In the dark
 * theme that blend is `screen`: the warm particles glow against the mahogany
 * bands (hero, closing CTA) and all but vanish over the light cream sections
 * and product photography — so the effect reads where it flatters and stays out
 * of the way where it wouldn't. The light theme has no mahogany to glow on, so
 * it inverts the pair (multiply, darker flecks) rather than leaving an empty
 * canvas; both halves live on `.particle-field` in index.css.
 * `pointer-events: none` keeps it purely decorative.
 *
 * Motion is paused when the tab is hidden, and honoured `prefers-reduced-motion`
 * renders a single static frame instead of animating.
 *
 * Canvas sizing and particle spawning are deliberately separate: mobile
 * browsers fire `resize` when their address bar hides/shows during a scroll
 * gesture, which only changes viewport *height*. Re-spawning particles on
 * every such event made the whole field visibly jump mid-scroll. Only a
 * width change (real layout change, e.g. rotation) re-spawns; a height-only
 * change just resizes the canvas and rescales existing particles in place.
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
// per-particle alpha can be composed cheaply. The fallback for --particle-rgb,
// which is what actually gets painted (see readParticleRgb).
const PARTICLE_RGB = "224, 190, 110";

/**
 * The dust's colour comes from the stylesheet, because the blend mode does.
 *
 * Screen blend makes a warm fleck glow on mahogany and vanish on cream, which
 * is exactly the behaviour this effect wants — until a light theme turns the
 * bands cream too and the whole field vanishes with them. The light palettes
 * flip `--particle-blend` to multiply and darken `--particle-rgb`, so the same
 * canvas paints settling dust instead of catching light. Reading both from CSS
 * keeps the pairing in one place; getting them out of step is what would show.
 */
function readParticleRgb(): string {
  if (typeof getComputedStyle === "undefined") return PARTICLE_RGB;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--particle-rgb")
    .trim();
  return value || PARTICLE_RGB;
}

export default function ParticleField({
  density = 9500,
  className = "",
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-read on a theme switch. Cheaper than a getComputedStyle per frame, and
  // an observer rather than a prop so the canvas — which is portalled to the
  // body, outside any theme provider — needs nothing passed down to it.
  const [rgb, setRgb] = useState(readParticleRgb);
  useEffect(() => {
    const observer = new MutationObserver(() => setRgb(readParticleRgb()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-light"],
    });
    return () => observer.disconnect();
  }, []);

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
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const spawnParticle = (): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.6 + 0.5,
      vy: Math.random() * 0.32 + 0.08,
      vx: (Math.random() - 0.5) * 0.16,
      a: Math.random() * 0.3 + 0.12,
    });

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawnAll = () => {
      const count = Math.max(10, Math.round((width * height) / density));
      particles = Array.from({ length: count }, spawnParticle);
    };

    const seed = () => {
      resizeCanvas();
      spawnAll();
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        // soft glow so each fleck reads as light rather than a flat dot
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        glow.addColorStop(0, `rgba(${rgb}, ${p.a})`);
        glow.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, p.a + 0.1)})`;
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
      // Coalesce bursts of resize events — mobile browsers dispatch several
      // in a row while their address bar animates in/out during scroll.
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        const prevWidth = width;
        resizeCanvas();
        // A real layout change (rotation, window resize) re-spawns the
        // field. A height-only change — the mobile toolbar hiding/showing
        // as the page scrolls — just resizes the canvas and keeps the
        // existing particles where they were, clamped into view.
        if (width !== prevWidth) {
          spawnAll();
        } else {
          for (const p of particles) {
            if (p.y > height) p.y = height;
            if (p.x > width) p.x = width;
          }
        }
        if (reduce) paint();
      }, 150);
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
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density, rgb]);

  if (typeof document === "undefined") return null;

  // Portalled to the body so the canvas covers the viewport no matter where it
  // is mounted. A `position: fixed` box is only viewport-relative while no
  // ancestor carries a transform (or filter, or will-change: transform) — and
  // `.page-enter` animates one, as do the parallax `motion.div`s on the
  // homepage. Call sites used to have to know that; now they don't.
  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="particle-field"
      className={`particle-field pointer-events-none fixed inset-0 z-30 ${className}`}
    />,
    document.body,
  );
}
