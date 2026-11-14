"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import NightSky from "./components/NightSky";

interface Profile {
  name: string;
  situation: string;
  loops: string;
  building: string;
}

interface LogEntry {
  id: string;
  date: string;
  entry: string;
  reflection: string;
  followUp: string;
}

const FREE_LIMIT    = 5;
const PROFILE_KEY   = "anchor_profile";
const LOGS_KEY      = "anchor_logs";
const PURCHASED_KEY = "anchor_purchased";
const USED_SID_KEY  = "anchor_used_sids";
const TOKEN_KEY     = "anchor_token";   // the purchase id; sessions are counted on the server

const QUESTIONS = [
  {
    key: "name",
    label: "What's your name?",
    placeholder: "First name works",
    short: true,
    hint: "Enter to continue",
  },
  {
    key: "situation",
    label: "What's your current situation — work, life, daily structure?",
    placeholder: "What does a typical day actually look like for you?",
    short: false,
    hint: "⌘ Enter to continue",
  },
  {
    key: "loops",
    label: "What patterns do you fall into when things get hard?",
    placeholder: "Overthinking, isolating, numbing, scrolling — whatever it is",
    short: false,
    hint: "⌘ Enter to continue",
  },
  {
    key: "building",
    label: "What are you building or working toward right now?",
    placeholder: "Business, skill, relationship, a version of yourself — anything",
    short: false,
    hint: "⌘ Enter to continue",
  },
];

type Phase = "loading" | "welcome" | "onboarding" | "home" | "log" | "anchor-mode" | "insight" | "sky";
type LogPhase = "input" | "loading" | "reflected" | "fu-loading" | "done";
type AnchorPhase = "input" | "loading" | "done";

export default function Anchor() {
  const [phase, setPhase]             = useState<Phase>("loading");
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [purchasedSessions, setPurchasedSessions] = useState(0);
  const [checkoutLoading, setCheckoutLoading]     = useState(false);

  // Onboarding
  const [obStep, setObStep]         = useState(0);
  const [obAnswers, setObAnswers]   = useState(["", "", "", ""]);
  const [obCurrent, setObCurrent]   = useState("");

  // Daily log
  const [logEntry, setLogEntry]           = useState("");
  const [reflection, setReflection]       = useState("");
  const [followUp, setFollowUp]           = useState("");
  const [fuResp, setFuResp]               = useState("");
  const [submittedFuResp, setSubmittedFuResp] = useState("");
  const [closingReflection, setClosingReflection] = useState("");
  const [logPhase, setLogPhase]           = useState<LogPhase>("input");

  // Anchor mode
  const [anchorIn, setAnchorIn]     = useState("");
  const [anchorOut, setAnchorOut]   = useState("");
  const [anchorPhase, setAnchorPhase] = useState<AnchorPhase>("input");

  const mainInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // Earlier purchases were only remembered as used ids; carry the latest over as the server-side token.
  useEffect(() => {
    if (localStorage.getItem(TOKEN_KEY)) return;
    const old: string[] = JSON.parse(localStorage.getItem(USED_SID_KEY) || "[]");
    if (old.length) localStorage.setItem(TOKEN_KEY, old[old.length - 1]);
  }, []);

  useEffect(() => {
    const p = localStorage.getItem(PROFILE_KEY);
    setPurchasedSessions(parseInt(localStorage.getItem(PURCHASED_KEY) || "0"));
    if (p) {
      setProfile(JSON.parse(p));
      const l = localStorage.getItem(LOGS_KEY);
      setLogs(l ? JSON.parse(l) : []);
      setPhase("home");
    } else {
      setPhase("welcome");
    }
  }, []);

  // Handle Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sid = params.get("session_id");
    if (payment !== "success" || !sid) return;

    // Clean URL immediately
    window.history.replaceState({}, "", "/");

    // Check if already used this session_id (prevent double-grant on refresh)
    const usedSids: string[] = JSON.parse(localStorage.getItem(USED_SID_KEY) || "[]");
    if (usedSids.includes(sid)) return;

    fetch("/api/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.granted) {
          if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
          const current = parseInt(localStorage.getItem(PURCHASED_KEY) || "0");
          localStorage.setItem(PURCHASED_KEY, String(current + data.granted));
          setPurchasedSessions((prev) => prev + data.granted);
          usedSids.push(sid);
          localStorage.setItem(USED_SID_KEY, JSON.stringify(usedSids));
        }
      })
      .catch(() => {});
  }, []);

  // ── ONBOARDING ───────────────────────────────────────────────────────────────

  function obAdvance() {
    if (!obCurrent.trim()) return;
    const next = [...obAnswers];
    next[obStep] = obCurrent.trim();
    setObAnswers(next);
    setObCurrent("");

    if (obStep < QUESTIONS.length - 1) {
      setObStep(obStep + 1);
    } else {
      const p: Profile = { name: next[0], situation: next[1], loops: next[2], building: next[3] };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      setProfile(p);
      setPhase("home");
    }
  }

  // ── DAILY LOG ────────────────────────────────────────────────────────────────

  async function submitLog() {
    if (!logEntry.trim() || logPhase !== "input") return;
    setLogPhase("loading");
    try {
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, entry: logEntry, token: localStorage.getItem(TOKEN_KEY) || undefined }),
      });
      if (res.status === 402) { setLogPhase("input"); alert("No sessions left. Get 10 more below."); return; }
      if (res.status === 429) { setLogPhase("input"); alert("Too many requests. Try again in a few minutes."); return; }
      const data = await res.json();
      setReflection(data.reflection);
      setFollowUp(data.followUp);
      setLogPhase("reflected");
    } catch {
      setLogPhase("input");
      alert("Connection issue. Try again.");
    }
  }

  async function submitFollowUp() {
    if (!fuResp.trim() || logPhase !== "reflected") return;
    setSubmittedFuResp(fuResp);
    setLogPhase("fu-loading");
    try {
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, entry: logEntry, followUpResponse: fuResp }),
      });
      const data = await res.json();
      setClosingReflection(data.reflection);
      setFollowUp("");
      saveLog();
      setLogPhase("done");
    } catch {
      setLogPhase("reflected");
    }
  }

  const saveLog = useCallback(() => {
    const entry: LogEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      entry: logEntry,
      reflection,
      followUp,
    };
    setLogs(prev => {
      const updated = [entry, ...prev];
      localStorage.setItem(LOGS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [logEntry, reflection, followUp]);

  function skipFollowUp() {
    saveLog();
    setLogPhase("done");
  }

  function resetLog() {
    setLogEntry(""); setReflection(""); setFollowUp(""); setFuResp("");
    setSubmittedFuResp(""); setClosingReflection("");
    setLogPhase("input");
    setPhase("home");
  }

  // ── ANCHOR MODE ──────────────────────────────────────────────────────────────

  async function submitAnchor() {
    if (!anchorIn.trim() || anchorPhase !== "input") return;
    setAnchorPhase("loading");
    try {
      const res = await fetch("/api/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loop: anchorIn, profile }),
      });
      const data = await res.json();
      setAnchorOut(data.anchor);
      setAnchorPhase("done");
    } catch {
      setAnchorPhase("input");
    }
  }

  function resetAnchor() {
    setAnchorIn(""); setAnchorOut(""); setAnchorPhase("input");
    setPhase("home");
  }

  const sessionCount  = logs.length;
  const totalAllowed  = FREE_LIMIT + purchasedSessions;
  const sessionsLeft  = Math.max(0, totalAllowed - sessionCount);
  const atLimit       = sessionCount >= totalAllowed;

  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setCheckoutLoading(false);
    }
  }

  // ── LOADING ──────────────────────────────────────────────────────────────────

  if (phase === "loading") return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
    </div>
  );

  // ── WELCOME: what this is, how it works, what it costs — before any question ──

  if (phase === "welcome") return (
    <main className="min-h-screen flex flex-col justify-center px-6 py-14" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-lg mx-auto fade-in">
        <p className="text-[11px] tracking-[0.22em] uppercase mb-5" style={{ color: "var(--accent)" }}>Anchor · Architect-DNA</p>
        <h1 className="serif text-4xl leading-tight mb-4">A companion that knows your actual situation.</h1>
        <p className="text-[15px] leading-relaxed mb-9" style={{ color: "#a8a297" }}>
          Not generic advice. You tell Anchor once what you&apos;re dealing with — then it checks in with you,
          spots the wins you missed, and pulls you out when your head spins.
        </p>

        <div className="grid gap-3 mb-9">
          {[
            ["1", "Set it up in a minute", "Four short questions: your name, your situation, the loops you fall into, what you're building."],
            ["2", "Log your day", "A few lines. Anchor answers like a brutally honest friend — and asks one question that counts."],
            ["3", "Anchor mode when it's too much", "One physical action, under 20 words. No analysis. Free, always."],
          ].map(([n, t, d]) => (
            <div key={n} className="flex gap-4 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span className="text-xs mt-0.5" style={{ color: "var(--accent)", fontFamily: "ui-monospace,monospace" }}>{n}</span>
              <div>
                <div className="text-[15px] mb-1">{t}</div>
                <div className="text-[13px] leading-relaxed" style={{ color: "#8a8478" }}>{d}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPhase("onboarding")}
          className="w-full py-4 rounded-xl text-[15px] font-medium mb-4"
          style={{ background: "var(--accent)", color: "#0c0c0b" }}
        >
          Start — it takes a minute
        </button>
        <p className="text-[12px] text-center leading-relaxed" style={{ color: "var(--muted)" }}>
          5 sessions free · then 10 for CHF 4.90, one-time, no subscription.<br />
          Your profile and logs stay on this device. Text is sent to the AI only when you ask for a reflection.<br />
          Not therapy. In a crisis in Switzerland: call 143 (Die Dargebotene Hand).
        </p>
      </div>
    </main>
  );

  // ── ONBOARDING ───────────────────────────────────────────────────────────────

  if (phase === "onboarding") {
    const q = QUESTIONS[obStep];
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-lg">

          {/* Progress bar */}
          <div className="flex gap-1.5 mb-14">
            {QUESTIONS.map((_, i) => (
              <div key={i} style={{
                height: "2px", flex: 1, borderRadius: "9999px",
                background: i <= obStep ? "var(--accent)" : "var(--dim)",
                transition: "background 0.4s ease",
              }} />
            ))}
          </div>

          {/* Previous answers — faded */}
          {obAnswers.slice(0, obStep).map((ans, i) =>
            ans ? (
              <div key={i} className="mb-7" style={{ opacity: 0.35 }}>
                <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>{QUESTIONS[i].label}</p>
                <p className="text-sm" style={{ color: "var(--text)" }}>{ans}</p>
              </div>
            ) : null
          )}

          {/* Current question */}
          <div className="fade-in" key={obStep}>
            <label className="block text-lg font-medium mb-5 leading-snug" style={{ color: "var(--text)" }}>
              {q.label}
            </label>

            {q.short ? (
              <input
                autoFocus
                className="w-full bg-transparent outline-none text-base py-2"
                style={{
                  color: "var(--text)",
                  borderBottom: "1px solid var(--border)",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => (e.target.style.borderBottomColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
                placeholder={q.placeholder}
                value={obCurrent}
                onChange={e => setObCurrent(e.target.value)}
                onKeyDown={e => e.key === "Enter" && obAdvance()}
              />
            ) : (
              <textarea
                autoFocus
                className="w-full bg-transparent outline-none text-base py-2 resize-none leading-relaxed"
                style={{
                  color: "var(--text)",
                  borderBottom: "1px solid var(--border)",
                  transition: "border-color 0.2s",
                  minHeight: "90px",
                }}
                onFocus={e => (e.target.style.borderBottomColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
                placeholder={q.placeholder}
                value={obCurrent}
                onChange={e => setObCurrent(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) obAdvance(); }}
              />
            )}

            <div className="flex items-center justify-between mt-4">
              <span className="text-xs" style={{ color: "var(--dim)" }}>{q.hint}</span>
              <button
                onClick={obAdvance}
                disabled={!obCurrent.trim()}
                className="text-sm font-medium transition-colors"
                style={{ color: obCurrent.trim() ? "var(--accent)" : "var(--dim)" }}
              >
                {obStep < QUESTIONS.length - 1 ? "Continue →" : "Start →"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── HOME ──────────────────────────────────────────────────────────────────────

  if (phase === "home") {
    const hour = new Date().getHours();
    const tod  = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";

    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-sm fade-in">
          <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>{tod}, {profile?.name}.</p>
          <h1 className="text-2xl font-semibold mb-10" style={{ color: "var(--text)" }}>What do you need?</h1>

          <div className="space-y-3">
            {/* Daily Log */}
            <button
              onClick={() => { setLogPhase("input"); setPhase("log"); }}
              disabled={atLimit}
              className="w-full text-left rounded-2xl p-5 transition-all group"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                opacity: atLimit ? 0.35 : 1,
                cursor: atLimit ? "not-allowed" : "pointer",
              }}
              onMouseEnter={e => !atLimit && ((e.currentTarget.style.borderColor = "#c4a88255"))}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Daily Log</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>What happened today</div>
            </button>

            {/* Anchor */}
            <button
              onClick={() => { setAnchorPhase("input"); setPhase("anchor-mode"); }}
              className="w-full text-left rounded-2xl p-5 transition-all"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#c4a88255")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Anchor</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Stuck in a loop — get out in 10 seconds</div>
            </button>

            {/* Night Sky */}
            <button
              onClick={() => setPhase("sky")}
              className="w-full text-left rounded-2xl p-5 transition-all"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#c4a88230")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Night Sky</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Your life clears as your blockers do</div>
            </button>

            {/* This Week */}
            <button
              onClick={() => setPhase("insight")}
              disabled={sessionCount < 3}
              className="w-full text-left rounded-2xl p-5 transition-all"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                opacity: sessionCount < 3 ? 0.35 : 1,
                cursor: sessionCount < 3 ? "not-allowed" : "pointer",
              }}
              onMouseEnter={e => sessionCount >= 3 && (e.currentTarget.style.borderColor = "#c4a88255")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div className="font-medium mb-1" style={{ color: "var(--text)" }}>This Week</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {sessionCount < 3
                  ? `Log ${3 - sessionCount} more time${3 - sessionCount !== 1 ? "s" : ""} to unlock`
                  : "Patterns across your recent logs"}
              </div>
            </button>
          </div>

          {atLimit ? (
            <div className="mt-10 rounded-2xl p-6 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
                {sessionCount === FREE_LIMIT ? "5 free sessions used." : "Sessions used up."}
              </p>
              <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
                10 more sessions — one-time, no subscription.
              </p>
              <button
                onClick={startCheckout}
                disabled={checkoutLoading}
                className="w-full py-3 rounded-xl text-sm font-medium transition-opacity"
                style={{
                  background: "var(--accent)",
                  color: "#0c0c0b",
                  opacity: checkoutLoading ? 0.6 : 1,
                  cursor: checkoutLoading ? "not-allowed" : "pointer",
                }}
              >
                {checkoutLoading ? "Redirecting…" : "Continue — CHF 4.90"}
              </button>
            </div>
          ) : sessionCount > 0 ? (
            <p className="text-center text-xs mt-10" style={{ color: "var(--dim)" }}>
              {sessionsLeft} session{sessionsLeft !== 1 ? "s" : ""} left
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  // ── DAILY LOG ─────────────────────────────────────────────────────────────────

  if (phase === "log") {
    return (
      <main className="min-h-screen flex flex-col px-6 py-12" style={{ background: "var(--bg)" }}>
        <div className="max-w-lg mx-auto w-full flex flex-col" style={{ minHeight: "calc(100vh - 6rem)" }}>
          <button
            onClick={resetLog}
            className="text-xs mb-10 self-start transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
          >
            ← back
          </button>

          {/* INPUT */}
          {logPhase === "input" && (
            <div className="fade-in flex flex-col flex-1">
              <label className="text-lg font-medium mb-6 block" style={{ color: "var(--text)" }}>
                What happened today?
              </label>
              <textarea
                autoFocus
                className="flex-1 bg-transparent outline-none text-base resize-none leading-relaxed"
                style={{ color: "var(--text)", minHeight: "200px" }}
                placeholder="Drop it here. Stream of consciousness is fine."
                value={logEntry}
                onChange={e => setLogEntry(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) submitLog(); }}
              />
              <div className="flex justify-between items-center mt-6 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--dim)" }}>⌘ Enter to send</span>
                <button
                  onClick={submitLog}
                  disabled={!logEntry.trim()}
                  className="text-sm font-medium transition-colors"
                  style={{ color: logEntry.trim() ? "var(--accent)" : "var(--dim)" }}
                >
                  Done →
                </button>
              </div>
            </div>
          )}

          {/* LOADING */}
          {(logPhase === "loading" || logPhase === "fu-loading") && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
            </div>
          )}

          {/* REFLECTED */}
          {(logPhase === "reflected" || logPhase === "done") && (
            <div className="fade-in flex flex-col flex-1">
              {/* Their entry */}
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--dim)" }}>You</p>
              <p className="text-sm leading-relaxed mb-10" style={{ color: "var(--muted)" }}>{logEntry}</p>

              {/* Initial reflection */}
              <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--accent)" }}>Anchor</p>
              <div className="mb-8 serif" style={{ color: "var(--text)" }}>
                {reflection.split(/\n\n+/).map((para, i) => (
                  <p key={i} className="text-base leading-relaxed mb-3">{para}</p>
                ))}
              </div>

              {/* Follow-up YOU block (done state only) */}
              {logPhase === "done" && submittedFuResp && (
                <>
                  <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--dim)" }}>You</p>
                  <p className="text-sm leading-relaxed mb-10" style={{ color: "var(--muted)" }}>{submittedFuResp}</p>
                  {closingReflection && (
                    <>
                      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--accent)" }}>Anchor</p>
                      <div className="mb-8 serif" style={{ color: "var(--text)" }}>
                        {closingReflection.split(/\n\n+/).map((para, i) => (
                          <p key={i} className="text-base leading-relaxed mb-3">{para}</p>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Follow-up question */}
              {followUp && logPhase === "reflected" && (
                <div className="mt-auto">
                  <p className="text-sm leading-relaxed mb-4 italic" style={{ color: "var(--text)" }}>{followUp}</p>
                  <textarea
                    autoFocus
                    className="w-full bg-transparent outline-none text-sm resize-none py-2 leading-relaxed"
                    style={{
                      color: "var(--text)",
                      borderBottom: "1px solid var(--border)",
                    }}
                    onFocus={e => (e.target.style.borderBottomColor = "var(--accent)")}
                    onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
                    placeholder="Answer here..."
                    rows={2}
                    value={fuResp}
                    onChange={e => setFuResp(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && e.metaKey) submitFollowUp(); }}
                  />
                  <div className="flex justify-between items-center mt-3">
                    <button
                      onClick={skipFollowUp}
                      className="text-xs"
                      style={{ color: "var(--dim)" }}
                    >
                      skip
                    </button>
                    <button
                      onClick={submitFollowUp}
                      disabled={!fuResp.trim()}
                      className="text-sm font-medium"
                      style={{ color: fuResp.trim() ? "var(--accent)" : "var(--dim)" }}
                    >
                      Send →
                    </button>
                  </div>
                </div>
              )}

              {/* Done state */}
              {logPhase === "done" && (
                <div className="mt-auto pt-6" style={{ borderTop: "1px solid var(--border)" }}>
                  <button
                    onClick={resetLog}
                    className="w-full text-center text-sm py-2 transition-colors"
                    style={{ color: "var(--muted)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
                  >
                    Done for today →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── ANCHOR MODE ───────────────────────────────────────────────────────────────

  if (phase === "anchor-mode") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-sm">
          <button
            onClick={resetAnchor}
            className="text-xs mb-10 block transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
          >
            ← back
          </button>

          {anchorPhase === "input" && (
            <div className="fade-in">
              <label className="text-lg font-medium mb-2 block leading-snug" style={{ color: "var(--text)" }}>
                What loop are you in?
              </label>
              <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>10 words or less.</p>
              <input
                autoFocus
                className="w-full bg-transparent outline-none text-lg py-2"
                style={{
                  color: "var(--text)",
                  borderBottom: "1px solid var(--border)",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => (e.target.style.borderBottomColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
                placeholder="overthinking everything..."
                value={anchorIn}
                onChange={e => setAnchorIn(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitAnchor()}
              />
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs" style={{ color: "var(--dim)" }}>Enter</span>
                <button
                  onClick={submitAnchor}
                  disabled={!anchorIn.trim()}
                  className="text-sm font-medium"
                  style={{ color: anchorIn.trim() ? "var(--accent)" : "var(--dim)" }}
                >
                  Go →
                </button>
              </div>
            </div>
          )}

          {anchorPhase === "loading" && (
            <div className="flex items-center justify-center h-32">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
            </div>
          )}

          {anchorPhase === "done" && (
            <div className="fade-in text-center">
              <p className="text-2xl font-medium leading-snug mb-14 serif" style={{ color: "var(--text)" }}>
                {anchorOut}
              </p>
              <button
                onClick={resetAnchor}
                className="text-xs transition-colors"
                style={{ color: "var(--muted)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
              >
                back to home
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── INSIGHT ───────────────────────────────────────────────────────────────────

  if (phase === "insight") {
    const recent = logs.slice(0, 7);
    return (
      <main className="min-h-screen flex flex-col px-6 py-12" style={{ background: "var(--bg)" }}>
        <div className="max-w-lg mx-auto w-full">
          <button
            onClick={() => setPhase("home")}
            className="text-xs mb-10 block transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
          >
            ← back
          </button>
          <h2 className="text-xl font-semibold mb-8" style={{ color: "var(--text)" }}>This Week</h2>

          <div className="space-y-8">
            {recent.map((log) => (
              <div key={log.id} className="pl-4" style={{ borderLeft: "1px solid var(--border)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--dim)" }}>
                  {new Date(log.date).toLocaleDateString("en-CH", { weekday: "short", day: "numeric", month: "short" })}
                </p>
                <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--muted)" }}>
                  {log.entry.length > 120 ? log.entry.slice(0, 120) + "…" : log.entry}
                </p>
                {log.reflection && (
                  <p className="text-sm leading-relaxed serif" style={{ color: "var(--text)" }}>
                    {log.reflection.length > 140 ? log.reflection.slice(0, 140) + "…" : log.reflection}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── NIGHT SKY ─────────────────────────────────────────────────────────────────

  if (phase === "sky") {
    return <NightSky onBack={() => setPhase("home")} />;
  }

  return null;
}
