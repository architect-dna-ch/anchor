"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";

const BLOCKERS = [
  { id: "sleep",     label: "Sleep",     color: "#6ba3d6" },
  { id: "movement",  label: "Movement",  color: "#6ecf8a" },
  { id: "structure", label: "Structure", color: "#c4a882" },
  { id: "silence",   label: "Silence",   color: "#a89fd4" },
  { id: "build",     label: "Build",     color: "#f0a060" },
  { id: "presence",  label: "Presence",  color: "#7dcfb0" },
];

const DOMAIN_STARS = [
  { x: 0.20, y: 0.13, domain: "Health",     insight: "Your body is the foundation. Everything else is built on it.",                size: 2.8, deps: ["sleep", "movement"]    },
  { x: 0.72, y: 0.09, domain: "Clarity",    insight: "When you stop filling silence, you start hearing yourself.",                  size: 2.2, deps: ["silence", "structure"]  },
  { x: 0.46, y: 0.19, domain: "Work",       insight: "The builder attracts what the dreamer only imagines.",                        size: 2.5, deps: ["build", "structure"]    },
  { x: 0.13, y: 0.33, domain: "Connection", insight: "People feel presence before they hear words.",                                size: 2.0, deps: ["presence", "silence"]   },
  { x: 0.84, y: 0.27, domain: "Attraction", insight: "You didn't plan that. The version training and building — that attracted it.", size: 2.3, deps: ["movement", "build"]     },
  { x: 0.58, y: 0.07, domain: "Direction",  insight: "Structure is freedom. The routine is the north star.",                        size: 1.8, deps: ["structure", "presence"]  },
];

// Fixed background stars — generated once
const BG_STARS = Array.from({ length: 320 }, () => ({
  x:       Math.random(),
  y:       Math.random() * 0.82,
  r:       Math.random() * 1.4 + 0.3,
  base:    Math.random() * 0.55 + 0.25,
  speed:   Math.random() * 0.018 + 0.004,
  offset:  Math.random() * Math.PI * 2,
}));

function todayKey() { return `anchor_sky_${new Date().toDateString()}`; }
function pastKey(daysAgo: number) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return `anchor_sky_${d.toDateString()}`;
}

interface Props { onBack: () => void; }

export default function NightSky({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(todayKey()) ?? "{}"); } catch { return {}; }
  });

  const [hovered, setHovered] = useState<typeof DOMAIN_STARS[0] | null>(null);

  // fog 0 = clear, 1 = full — rolling 7-day window
  const fogLevels = useMemo(() => {
    return BLOCKERS.map(b => {
      if (typeof window === "undefined") return 0.85;
      let hits = 0;
      for (let i = 0; i < 7; i++) {
        try {
          const log = JSON.parse(localStorage.getItem(pastKey(i)) ?? "{}");
          if (i === 0 ? checked[b.id] : log[b.id]) hits++;
        } catch { /* */ }
      }
      return Math.max(0.04, 1 - hits / 5);
    });
  }, [checked]);

  function toggle(id: string) {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(todayKey(), JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }

  const avgFog = fogLevels.reduce((a, b) => a + b, 0) / fogLevels.length;
  const fogRef  = useRef(fogLevels);
  fogRef.current = fogLevels;

  // Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(t: number) {
      if (!canvas || !ctx) return;
      const W = canvas.width, H = canvas.height;

      // Sky gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#010306");
      bg.addColorStop(1, "#040c1a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Background stars — always visible, fog is atmospheric not a wall
      BG_STARS.forEach(s => {
        const twinkle = Math.sin(t * s.speed + s.offset) * 0.2 + 0.8;
        const a = s.base * twinkle;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,215,255,${a})`;
        ctx.fill();
      });

      // Domain stars
      const fog = fogRef.current;
      DOMAIN_STARS.forEach(star => {
        const depFog = star.deps.reduce((acc, id) => {
          const idx = BLOCKERS.findIndex(b => b.id === id);
          return acc + (idx >= 0 ? fog[idx] : 0.8);
        }, 0) / star.deps.length;

        const vis = Math.max(0.12, 1 - depFog); // always faintly hinted
        if (vis < 0.05) return;

        const twinkle = Math.sin(t * 0.012 + star.x * 8) * 0.12 + 0.88;
        const a = vis * twinkle;

        const sx = star.x * W;
        const sy = star.y * H;

        // Outer glow
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, star.size * 12);
        glow.addColorStop(0, `rgba(255,245,200,${a * 0.5})`);
        glow.addColorStop(0.4, `rgba(255,245,200,${a * 0.15})`);
        glow.addColorStop(1,  "rgba(255,245,200,0)");
        ctx.beginPath();
        ctx.arc(sx, sy, star.size * 12, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(sx, sy, star.size * twinkle, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,252,230,${Math.min(1, a * 1.6)})`;
        ctx.fill();
      });
    }

    function loop(ts: number) {
      draw(ts);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Star hover
  const handlePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const hit = DOMAIN_STARS.find(s => {
      const dx = s.x - nx, dy = s.y - ny;
      return Math.sqrt(dx * dx + dy * dy) < 0.055;
    });
    setHovered(hit ?? null);
  }, []);

  const fullyCleared = avgFog < 0.15;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#010306" }}>

      {/* Canvas sky */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHovered(null)}
      />

      {/* Animated fog layers */}
      {BLOCKERS.map((b, i) => (
        <div key={b.id} style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at ${20 + i * 14}% ${10 + i * 10}%, rgba(40,70,140,${fogLevels[i] * 0.38}) 0%, rgba(20,40,90,${fogLevels[i] * 0.18}) 45%, transparent 70%)`,
          filter: `blur(${50 + i * 8}px)`,
          animation: `fog${i % 3} ${20 + i * 5}s ease-in-out infinite alternate`,
          pointerEvents: "none",
          transition: "background 4s ease",
        }} />
      ))}

      {/* Global fog veil — light atmospheric tint only */}
      <div style={{
        position: "absolute", inset: 0,
        background: `rgba(10, 20, 50, ${avgFog * 0.18})`,
        pointerEvents: "none",
        transition: "background 4s ease",
      }} />

      {/* Star tooltip */}
      {hovered && (
        <div style={{
          position: "absolute",
          top: `calc(${hovered.y * 100}% + 20px)`,
          left: `${hovered.x * 100}%`,
          transform: "translateX(-50%)",
          background: "rgba(4, 8, 20, 0.92)",
          border: "1px solid rgba(196,168,130,0.25)",
          borderRadius: "12px",
          padding: "11px 16px",
          maxWidth: "200px",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 20,
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.18em", color: "#c4a882", textTransform: "uppercase", marginBottom: "6px" }}>
            {hovered.domain}
          </div>
          <div style={{ fontSize: "12px", color: "#e6e1d8", lineHeight: 1.65, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
            {hovered.insight}
          </div>
        </div>
      )}

      {/* Back */}
      <button onClick={onBack} style={{
        position: "absolute", top: "20px", left: "20px",
        background: "none", border: "none", color: "rgba(200,200,200,0.3)",
        fontSize: "11px", letterSpacing: "0.08em", cursor: "pointer", zIndex: 30,
        fontFamily: "system-ui, sans-serif",
      }}>← back</button>

      {/* Title */}
      <div style={{
        position: "absolute", top: "18px", left: "50%", transform: "translateX(-50%)",
        fontSize: "9px", letterSpacing: "0.25em", textTransform: "uppercase",
        color: "rgba(196,168,130,0.5)", fontFamily: "system-ui, sans-serif", zIndex: 30,
        whiteSpace: "nowrap",
      }}>Night Sky</div>

      {/* Check-in panel */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "24px 20px 36px",
        background: "linear-gradient(to top, rgba(1,3,6,0.97) 55%, transparent)",
        zIndex: 10,
      }}>
        <p style={{ textAlign: "center", fontSize: "8px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(200,200,200,0.2)", marginBottom: "14px", fontFamily: "system-ui, sans-serif" }}>
          Today — what did you do
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", maxWidth: "340px", margin: "0 auto" }}>
          {BLOCKERS.map((b, i) => {
            const done = !!checked[b.id];
            return (
              <button key={b.id} onClick={() => toggle(b.id)} style={{
                padding: "10px 6px",
                borderRadius: "12px",
                border: done ? `1px solid ${b.color}50` : "1px solid rgba(255,255,255,0.05)",
                background: done ? `${b.color}18` : "rgba(255,255,255,0.02)",
                color: done ? b.color : "rgba(200,200,200,0.3)",
                fontSize: "11px", fontWeight: done ? 700 : 400,
                cursor: "pointer", transition: "all 0.4s ease",
                letterSpacing: "0.03em", fontFamily: "system-ui, sans-serif",
              }}>
                {b.label}
              </button>
            );
          })}
        </div>
        <p style={{
          textAlign: "center", fontSize: "11px",
          color: fullyCleared ? "rgba(196,168,130,0.7)" : "rgba(255,255,255,0.07)",
          marginTop: "16px", fontFamily: "Georgia, serif", fontStyle: "italic",
          transition: "color 3s ease",
        }}>
          {fullyCleared ? "The sky doesn't lie." : "The sky doesn't lie."}
        </p>
      </div>

      <style>{`
        @keyframes fog0 { from { transform: translate(0,0) scale(1); } to { transform: translate(4%,3%) scale(1.06); } }
        @keyframes fog1 { from { transform: translate(0,0) scale(1); } to { transform: translate(-3%,4%) scale(0.95); } }
        @keyframes fog2 { from { transform: translate(0,0) scale(1.03); } to { transform: translate(2%,-3%) scale(0.97); } }
      `}</style>
    </div>
  );
}
