"use client"

/* ----------------------------------------------------------------------------
   NatureBackground - painterly, Studio-Ghibli-inspired ambient backdrop.

   Light mode  -> cherry-blossom canopy on a soft teal sky, drifting petals,
                  god-rays, depth haze.
   Dark mode   -> ethereal blue scene with volumetric light shafts and
                  floating dandelion seed-lights.

   The "painted" look comes from SVG feTurbulence + feDisplacementMap warping
   the edges of every blossom mass (so nothing is a perfect circle), layered
   gaussian blur for atmospheric depth, and a fractal-noise grain overlay that
   kills the flat vector feel. Scenes swap purely via the `.dark` CSS class
   (no JS -> no hydration flicker). pointer-events: none, honours
   prefers-reduced-motion, mounts once behind content at z-0.
   ---------------------------------------------------------------------------- */

import type { CSSProperties } from "react"

// Deterministic PRNG (stable across SSR/CSR -> no hydration mismatch)
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20260601)
const rf = (a: number, b: number) => a + rng() * (b - a)
const pick = <T,>(arr: T[]): T => arr[(rng() * arr.length) | 0]

// Blossom mass generator
type Blossom = { x: number; y: number; r: number; c: string; o: number; hl: boolean }
const PINKS = ["#f7c9da", "#f3b2cb", "#efa4c2", "#fadbe6", "#ecd2ea", "#ffe1ec", "#f6bcd6"]

function blossomMass(cx: number, cy: number, spread: number, count: number, baseR: number): Blossom[] {
  const out: Blossom[] = []
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const d = Math.pow(rng(), 0.62) * spread
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d * 0.82
    const r = baseR * (0.5 + rng() * 0.85)
    out.push({ x, y, r, c: pick(PINKS), o: 0.6 + rng() * 0.34, hl: rng() > 0.55 })
  }
  return out
}

// Canopy clusters - kept in the corners so the centre stays open for content.
const FAR = [
  ...blossomMass(150, 40, 230, 34, 30),
  ...blossomMass(1300, 70, 250, 36, 32),
  ...blossomMass(760, -40, 300, 22, 34),
]
// ---- Recursive cherry-blossom tree ------------------------------------------
// Grows fractal twigs from the corners inward, dropping clustered 5-petal
// blossoms at the tips and along the branches. Subtle, intricate, frames the
// top of the frame while leaving the centre open for content.
type Twig = { x1: number; y1: number; x2: number; y2: number; w: number }
type Bloom = { x: number; y: number; r: number; c: string; rot: number; hl: boolean }
const TWIGS: Twig[] = []
const BLOOMS: Bloom[] = []

function grow(x: number, y: number, ang: number, len: number, w: number, depth: number) {
  const x2 = x + Math.cos(ang) * len
  const y2 = y + Math.sin(ang) * len
  TWIGS.push({ x1: x, y1: y, x2, y2, w })
  if (depth <= 0) {
    // full blossom cluster at the twig tip
    const n = 2 + ((rng() * 3) | 0)
    for (let i = 0; i < n; i++) {
      BLOOMS.push({
        x: x2 + rf(-14, 14), y: y2 + rf(-12, 12),
        r: rf(5, 8.5), c: pick(PINKS), rot: rf(0, 6.28), hl: rng() > 0.5,
      })
    }
    return
  }
  // frequent blossom along the branch (keeps branches hidden behind flowers)
  if (rng() > 0.5) {
    BLOOMS.push({ x: x2 + rf(-5, 5), y: y2 + rf(-5, 5), r: rf(4, 6.5), c: pick(PINKS), rot: rf(0, 6.28), hl: rng() > 0.5 })
  }
  const nb = depth > 3 ? 2 : (rng() > 0.45 ? 2 : 3)
  for (let i = 0; i < nb; i++) {
    const base = nb === 2 ? (i === 0 ? -1 : 1) : i - 1
    const spread = rf(0.26, 0.62)
    const na = ang + base * spread + rf(-0.17, 0.17) + 0.12 // slight downward droop
    grow(x2, y2, na, len * rf(0.66, 0.8), w * 0.7, depth - 1)
  }
}
// Two main trees from the upper corners, two mediums, two small lower sprigs.
grow(-30, -25, 0.52, 170, 8.5, 5)
grow(1470, -25, Math.PI - 0.52, 170, 8.5, 5)
grow(210, -55, 0.92, 120, 5.5, 4)
grow(1230, -55, Math.PI - 0.92, 120, 5.5, 4)
grow(20, 940, -1.0, 120, 5, 3)
grow(1420, 940, -(Math.PI - 1.0), 120, 5, 3)

// Extra blossom fill packed along the very top edge — lots of flowers, almost
// no branch — so the canopy reads as a band of blossom framing the top.
const TOP_BLOOMS: Bloom[] = []
for (let i = 0; i < 90; i++) {
  TOP_BLOOMS.push({
    x: rf(-30, 1470), y: -20 + Math.pow(rng(), 1.7) * 150,
    r: rf(5, 10), c: pick(PINKS), rot: rf(0, 6.28), hl: rng() > 0.5,
  })
}
// Shallow drift of fallen blossoms along the bottom edge (very low height).
const FALLEN: Bloom[] = []
for (let i = 0; i < 140; i++) {
  FALLEN.push({
    x: rf(-10, 1450), y: 900 - Math.pow(rng(), 1.8) * 62,
    r: rf(4, 7.5), c: pick(PINKS), rot: rf(0, 6.28), hl: rng() > 0.6,
  })
}

// Floating particles
const PETALS = Array.from({ length: 22 }, () => ({
  left: rf(0, 100), s: rf(9, 17), dur: rf(19, 34), delay: rf(-30, 0),
  sway: rf(-90, 90), c: pick(PINKS), spin: rf(300, 520),
}))
const SEEDS = Array.from({ length: 18 }, () => ({
  left: rf(0, 100), s: rf(3, 6), dur: rf(34, 58), delay: rf(-50, 0),
  sway: rf(-70, 70), glow: rf(6, 14),
}))
const SPARKS = Array.from({ length: 26 }, () => ({
  left: rf(2, 98), top: rf(4, 92), s: rf(1.5, 3.5), dur: rf(5, 10), delay: rf(0, 6),
}))
// Glowing flower figures along the very bottom of the dark scene (puffball
// dandelions + pink buds on swaying stalks). Bottom-most band only.
const FLOWERS = Array.from({ length: 11 }, (_, i) => {
  const x = 70 + i * 122 + rf(-26, 26)
  const h = rf(150, 320)
  const r = rf(15, 30)
  const kind = rng() > 0.42 ? "puff" : "bud"
  const sway = rf(7, 12)
  const delay = rf(-6, 0)
  const bend = rf(-28, 28)
  const cy = 900 - h
  const spokes = Array.from({ length: 11 }, () => {
    const a = rng() * Math.PI * 2
    const len = r * (0.85 + rng() * 0.65)
    return { x2: Math.cos(a) * len, y2: Math.sin(a) * len }
  })
  return { x, h, r, kind, sway, delay, bend, cy, spokes }
})
// God-rays that fan out from a single point above the viewport (converging
// at the top). Each ray is a thin wedge widening as it falls.
type Ray = { points: string; o: number; dur: number; delay: number }
function fanRays(
  ox: number, oy: number, count: number, startDeg: number, stepDeg: number,
  jitter: number, halfMin: number, halfMax: number, r1: number,
  oMin: number, oMax: number,
): Ray[] {
  const D = Math.PI / 180
  const pt = (a: number, r: number) =>
    `${(ox + Math.sin(a) * r).toFixed(1)},${(oy + Math.cos(a) * r).toFixed(1)}`
  return Array.from({ length: count }, (_, i) => {
    const ang = (startDeg + i * stepDeg + rf(-jitter, jitter)) * D
    const half = rf(halfMin, halfMax) * D
    const r0 = 24
    return {
      points: `${pt(ang - half, r0)} ${pt(ang + half, r0)} ${pt(ang + half, r1)} ${pt(ang - half, r1)}`,
      o: rf(oMin, oMax), dur: rf(8, 14), delay: rf(0, 5),
    }
  })
}
// Dark scene shafts — soft, low opacity, converge from upper area.
const SHAFTS = fanRays(880, -200, 7, -34, 11, 3, 3.5, 6.5, 1500, 0.03, 0.07)
// Light scene god-rays — even gentler.
const RAYS = fanRays(920, -220, 5, -26, 12, 3, 3, 5.5, 1400, 0.025, 0.05)

export function NatureBackground() {
  // One painterly 5-petal blossom, rendered as a single reusable <use> of the
  // #nbBlossom symbol (keeps the node count low even with hundreds of flowers).
  const flower = (b: Bloom, i: number) => (
    <use key={i} href="#nbBlossom"
      transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) scale(${(b.r / 6).toFixed(3)}) rotate(${((b.rot * 57.29578) % 72).toFixed(1)})`}
      style={{ color: b.c }} />
  )
  return (
    <>
      <style>{`
        @keyframes nbSway   { 0%,100%{transform:rotate(-1.1deg)} 50%{transform:rotate(1.3deg)} }
        @keyframes nbSway2  { 0%,100%{transform:rotate(1deg)}    50%{transform:rotate(-1.2deg)} }
        @keyframes nbShimmer { 0%,100%{opacity:calc(var(--o) * .45)} 50%{opacity:var(--o)} }
        @keyframes nbPetal {
          0%   { transform: translate3d(0,-14vh,0) rotate(0deg);            opacity: 0 }
          9%   { opacity: .92 }
          90%  { opacity: .85 }
          100% { transform: translate3d(var(--sway),114vh,0) rotate(var(--spin)); opacity: 0 }
        }
        @keyframes nbSeed {
          0%   { transform: translate3d(0,112vh,0); opacity: 0 }
          12%  { opacity: 1 }
          88%  { opacity: .9 }
          100% { transform: translate3d(var(--sway),-14vh,0); opacity: 0 }
        }
        @keyframes nbTwinkle { 0%,100%{opacity:.15;transform:scale(.7)} 50%{opacity:.9;transform:scale(1)} }
        @keyframes nbStalk  { 0%,100%{transform:rotate(-1.6deg)} 50%{transform:rotate(1.6deg)} }
        @keyframes nbBloom  { 0%,100%{opacity:.72} 50%{opacity:1} }
        @keyframes nbGrain  { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-5%,3%)} 50%{transform:translate(4%,-4%)} 75%{transform:translate(-3%,-3%)} }

        /* Scene swap - light shows blossom, dark shows the blue scene */
        .nb-blossom, .nb-petals { opacity: 1; transition: opacity .6s ease }
        .nb-blue,    .nb-seeds  { opacity: 0; transition: opacity .6s ease }
        .dark .nb-blossom, .dark .nb-petals { opacity: 0 }
        .dark .nb-blue,    .dark .nb-seeds  { opacity: 1 }

        @media (prefers-reduced-motion: reduce) {
          .nb-root * { animation: none !important }
        }
      `}</style>

      <div className="nb-root fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">

        {/* LIGHT - cherry-blossom canopy */}
        <svg className="nb-blossom" width="100%" height="100%" viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="nbSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#bfe9e4" stopOpacity="0.85" />
              <stop offset="38%" stopColor="#d7efe6" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#f4ecdd" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#f4ecdd" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="nbHaze" cx="50%" cy="92%" r="70%">
              <stop offset="0%"  stopColor="#cdeede" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#cdeede" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="nbRayG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <filter id="nbPaint" x="-25%" y="-25%" width="150%" height="150%">
              <feTurbulence type="fractalNoise" baseFrequency="0.013 0.017" numOctaves="2" seed="7" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="24" xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation="0.5" />
            </filter>
            <filter id="nbFar" x="-40%" y="-40%" width="180%" height="180%">
              <feTurbulence type="fractalNoise" baseFrequency="0.011 0.014" numOctaves="2" seed="13" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation="6.5" />
            </filter>
            <filter id="nbTree" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.02 0.024" numOctaves="2" seed="9" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation="0.35" />
            </filter>
            <linearGradient id="nbFallen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#f0bcd2" stopOpacity="0" />
              <stop offset="100%" stopColor="#eaa9c6" stopOpacity="0.45" />
            </linearGradient>
            {/* reusable blossom — 5 petals (currentColor) + warm centre + highlight */}
            <g id="nbBlossom">
              {[0, 1, 2, 3, 4].map((k) => {
                const a = k * 1.25664
                return (
                  <circle key={k} cx={+(Math.cos(a) * 3.6).toFixed(2)} cy={+(Math.sin(a) * 3.6).toFixed(2)}
                    r="3" fill="currentColor" opacity="0.9" />
                )
              })}
              <circle cx="0" cy="0" r="1.92" fill="#fff3d6" />
              <circle cx="-1.3" cy="-1.45" r="1.7" fill="#ffffff" opacity="0.4" />
            </g>
          </defs>

          {/* sky + haze */}
          <rect x="0" y="0" width="1440" height="900" fill="url(#nbSky)" />
          <rect x="0" y="0" width="1440" height="900" fill="url(#nbHaze)" />

          {/* god-rays — converge from a point above */}
          <g style={{ mixBlendMode: "screen" }}>
            {RAYS.map((r, i) => (
              <polygon key={i} points={r.points} fill="url(#nbRayG)"
                style={{ ["--o" as string]: r.o, opacity: r.o,
                         animation: `nbShimmer ${r.dur}s ease-in-out ${r.delay}s infinite` } as CSSProperties} />
            ))}
          </g>

          {/* far canopy - soft, hazy, recedes */}
          <g filter="url(#nbFar)" opacity="0.7" style={{ transformOrigin: "720px 0px", animation: "nbSway2 14s ease-in-out infinite" }}>
            {FAR.map((b, i) => (
              <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.c} opacity={b.o * 0.8} />
            ))}
          </g>

          {/* cherry-blossom canopy - faint branches, mostly flowers */}
          <g filter="url(#nbTree)" style={{ transformOrigin: "720px 0px", animation: "nbSway 13s ease-in-out infinite" }}>
            {/* faint twigs, mostly hidden behind the blossoms */}
            <g opacity="0.2">
              {TWIGS.map((t, i) => (
                <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  stroke="#8a6a5a" strokeWidth={Math.max(0.5, t.w * 0.85)} strokeLinecap="round" />
              ))}
            </g>
            {/* dense blossoms — tree tips + top-edge fill */}
            <g opacity="0.94">
              {[...BLOOMS, ...TOP_BLOOMS].map(flower)}
            </g>
          </g>

          {/* shallow drift of fallen blossoms along the bottom */}
          <g>
            <path d="M0,900 L0,860 Q360,838 720,852 Q1080,866 1440,844 L1440,900 Z"
              fill="url(#nbFallen)" filter="url(#nbFar)" opacity="0.75" />
            <g opacity="0.9">{FALLEN.map(flower)}</g>
          </g>
        </svg>

        {/* DARK - ethereal blue + light shafts */}
        <svg className="nb-blue" width="100%" height="100%" viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="nbBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#0e2a3a" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#13384a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#0a2230" stopOpacity="0.85" />
            </linearGradient>
            <radialGradient id="nbGlow" cx="50%" cy="14%" r="75%">
              <stop offset="0%"  stopColor="#6fd6e0" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#6fd6e0" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="nbShaftG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#cdeefc" stopOpacity="0.6" />
              <stop offset="55%" stopColor="#cdeefc" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#cdeefc" stopOpacity="0" />
            </linearGradient>
            <filter id="nbCloud" x="-40%" y="-40%" width="180%" height="180%">
              <feTurbulence type="fractalNoise" baseFrequency="0.009 0.012" numOctaves="2" seed="21" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <radialGradient id="nbPuff" cx="50%" cy="45%" r="55%">
              <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#d6f3ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#bfe9ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="nbBud" cx="50%" cy="40%" r="60%">
              <stop offset="0%"  stopColor="#ffe3f0" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#f4a9cf" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#e98fbf" stopOpacity="0" />
            </radialGradient>
            <filter id="nbBloomGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          <rect x="0" y="0" width="1440" height="900" fill="url(#nbBlue)" />
          <rect x="0" y="0" width="1440" height="900" fill="url(#nbGlow)" />

          {/* drifting soft cloud-forms */}
          <g filter="url(#nbCloud)" opacity="0.5">
            <ellipse cx="360" cy="540" rx="320" ry="150" fill="#1d4a5e" opacity="0.6" />
            <ellipse cx="1080" cy="640" rx="360" ry="170" fill="#173c50" opacity="0.6" />
            <ellipse cx="720" cy="800" rx="520" ry="200" fill="#10303f" opacity="0.7" />
          </g>

          {/* volumetric light shafts — converge from a point above */}
          <g style={{ mixBlendMode: "screen" }}>
            {SHAFTS.map((s, i) => (
              <polygon key={i} points={s.points} fill="url(#nbShaftG)"
                style={{ ["--o" as string]: s.o, opacity: s.o,
                         animation: `nbShimmer ${s.dur}s ease-in-out ${s.delay}s infinite` } as CSSProperties} />
            ))}
          </g>

          {/* sparkle dust */}
          <g>
            {SPARKS.map((p, i) => (
              <circle key={i} cx={(p.left / 100) * 1440} cy={(p.top / 100) * 900} r={p.s} fill="#dff4ff"
                style={{ animation: `nbTwinkle ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
            ))}
          </g>

          {/* glowing flower figures — bottom band, swaying stalks */}
          <g>
            {FLOWERS.map((f, i) => {
              const bcx = f.x + f.bend
              return (
                <g key={i} style={{ transformOrigin: `${f.x}px 900px`,
                  animation: `nbStalk ${f.sway}s ease-in-out ${f.delay}s infinite` }}>
                  <path d={`M${f.x},905 Q${(f.x + f.bend * 0.6).toFixed(1)},${(f.cy + f.h * 0.45).toFixed(1)} ${bcx.toFixed(1)},${f.cy.toFixed(1)}`}
                    fill="none" stroke="#bfeaff" strokeOpacity="0.26"
                    strokeWidth={f.kind === "puff" ? 2.2 : 2} strokeLinecap="round" />
                  <circle cx={bcx} cy={f.cy} r={f.r * 1.6}
                    fill={f.kind === "puff" ? "url(#nbPuff)" : "url(#nbBud)"}
                    filter="url(#nbBloomGlow)"
                    style={{ animation: `nbBloom ${(f.sway * 1.3).toFixed(1)}s ease-in-out ${f.delay}s infinite` }} />
                  {f.kind === "puff" ? (
                    <g stroke="#eafaff" strokeOpacity="0.5" strokeWidth="0.8">
                      {f.spokes.map((s, j) => (
                        <g key={j}>
                          <line x1={bcx} y1={f.cy} x2={bcx + s.x2} y2={f.cy + s.y2} />
                          <circle cx={bcx + s.x2} cy={f.cy + s.y2} r="1.3" fill="#ffffff" stroke="none" opacity="0.85" />
                        </g>
                      ))}
                      <circle cx={bcx} cy={f.cy} r={f.r * 0.42} fill="#ffffff" opacity="0.85" />
                    </g>
                  ) : (
                    <g>
                      <ellipse cx={bcx} cy={f.cy} rx={f.r * 0.5} ry={f.r * 0.92} fill="url(#nbBud)" />
                      <circle cx={bcx} cy={f.cy - f.r * 0.32} r={f.r * 0.28} fill="#ffd9ec" opacity="0.9" />
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* floating petals (light) */}
        <div className="nb-petals" style={{ position: "absolute", inset: 0 }}>
          {PETALS.map((p, i) => (
            <span key={i} style={{
              position: "absolute", top: 0, left: `${p.left}%`,
              width: p.s, height: p.s * 0.7,
              background: `radial-gradient(120% 100% at 30% 20%, #ffffff 0%, ${p.c} 55%, ${p.c} 100%)`,
              borderRadius: "150% 0 150% 0",
              filter: "blur(0.3px)",
              ["--sway" as string]: `${p.sway}px`,
              ["--spin" as string]: `${p.spin}deg`,
              animation: `nbPetal ${p.dur}s linear ${p.delay}s infinite`,
              willChange: "transform",
            } as CSSProperties} />
          ))}
        </div>

        {/* floating seed-lights (dark) */}
        <div className="nb-seeds" style={{ position: "absolute", inset: 0 }}>
          {SEEDS.map((s, i) => (
            <span key={i} style={{
              position: "absolute", top: 0, left: `${s.left}%`,
              width: s.s, height: s.s, borderRadius: "50%",
              background: "#eafaff",
              boxShadow: `0 0 ${s.glow}px ${s.glow / 2}px rgba(180,235,255,0.7)`,
              ["--sway" as string]: `${s.sway}px`,
              animation: `nbSeed ${s.dur}s linear ${s.delay}s infinite`,
              willChange: "transform",
            } as CSSProperties} />
          ))}
        </div>

        {/* grain - unifies everything, kills banding */}
        <div style={{
          position: "absolute", inset: "-12%", opacity: 0.055, mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")",
          animation: "nbGrain 8s steps(5) infinite",
        }} />

        {/* soft vignette */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(125% 100% at 50% 38%, transparent 58%, rgba(40,30,60,0.10) 100%)",
        }} />
      </div>
    </>
  )
}
