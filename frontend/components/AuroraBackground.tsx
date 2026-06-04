"use client"

/* ════════════════════════════════════════════════════════════════════════════
   AuroraBackground — a calm, full-viewport ambient wash that sits behind all
   content. Soft warm-dawn + violet (Penumbra) light blobs drift and breathe,
   with a faint film grain and gentle vignette for a premium, painterly feel.

   Pure CSS-transform animation (GPU-smooth). pointer-events: none. Honours
   prefers-reduced-motion. Meant to be mounted once per page, before content,
   with a low z-index so frosted content floats above it.
   ════════════════════════════════════════════════════════════════════════════ */

// Soft, dawn-toned light blobs. Each drifts on a slow, independent loop.
const BLOBS = [
  { c: "rgba(255, 206, 170, 0.55)", size: 620, top: "-12%", left: "62%", anim: "auroraA", dur: 26 },
  { c: "rgba(206, 180, 246, 0.50)", size: 560, top: "8%",   left: "-8%", anim: "auroraB", dur: 31 },
  { c: "rgba(255, 224, 186, 0.45)", size: 460, top: "44%",  left: "78%", anim: "auroraC", dur: 28 },
  { c: "rgba(186, 222, 198, 0.40)", size: 520, top: "70%",  left: "14%", anim: "auroraB", dur: 34 },
  { c: "rgba(244, 196, 220, 0.42)", size: 400, top: "30%",  left: "38%", anim: "auroraA", dur: 24 },
]

export function AuroraBackground() {
  return (
    <>
      <style>{`
        @keyframes auroraA {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          33%     { transform: translate3d(4%,-3%,0) scale(1.08); }
          66%     { transform: translate3d(-3%,4%,0) scale(0.96); }
        }
        @keyframes auroraB {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          40%     { transform: translate3d(-5%,3%,0) scale(1.1); }
          70%     { transform: translate3d(3%,-2%,0) scale(0.97); }
        }
        @keyframes auroraC {
          0%,100% { transform: translate3d(0,0,0) scale(1.02); }
          50%     { transform: translate3d(4%,5%,0) scale(0.92); }
        }
        @keyframes grainShift {
          0%,100% { transform: translate(0,0); }
          25% { transform: translate(-6%,4%); }
          50% { transform: translate(5%,-3%); }
          75% { transform: translate(-3%,-5%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-anim * { animation: none !important; }
        }
      `}</style>

      <div className="aurora-anim fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
        {/* drifting light blobs */}
        {BLOBS.map((b, i) => (
          <div key={i} style={{
            position: "absolute", top: b.top, left: b.left,
            width: b.size, height: b.size, borderRadius: "50%",
            background: `radial-gradient(circle at 50% 50%, ${b.c} 0%, transparent 68%)`,
            filter: "blur(28px)", mixBlendMode: "screen",
            animation: `${b.anim} ${b.dur}s ease-in-out infinite`,
            willChange: "transform",
          }} />
        ))}

        {/* film grain — adds warmth and kills banding in the gradients */}
        <div style={{
          position: "absolute", inset: "-15%", opacity: 0.05, mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          animation: "grainShift 8s steps(4) infinite",
        }} />

        {/* soft vignette to settle the edges */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(120% 100% at 50% 0%, transparent 55%, rgba(60,40,90,0.06) 100%)",
        }} />
      </div>
    </>
  )
}
