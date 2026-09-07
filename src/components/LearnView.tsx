import React from "react";
import { CURRICULUM } from "../lib/curriculum";
import type { CurriculumDay } from "../lib/curriculum";

// ─── LearnView + DailyLesson ──────────────────────────────────────────────────

interface LearnViewProps {
  capital: number;
  aiKey: string;
}

interface GlossaryTerm {
  term: string;
  plain: string;
}

// Shape of the JSON body returned by POST /api/lesson (see api/lesson.js).
interface Lesson {
  what?: string;
  analogy?: string;
  todayExample?: string;
  whyItMatters?: string;
  mistakeToAvoid?: string;
  watchTomorrow?: string;
  jargon?: GlossaryTerm[];
  topic?: string;
  dayNumber?: number;
}

export function LearnView({ capital, aiKey }: LearnViewProps) {
  const [dayNumber, setDayNumber]   = React.useState(() => {
    return parseInt(localStorage.getItem("pv_lesson_day") ?? "0", 10);
  });
  const [lesson, setLesson]         = React.useState<Lesson | null>(null);
  const [loading, setLoading]       = React.useState(false);
  const [error, setError]           = React.useState<string | null>(null);
  const [glossary, setGlossary]     = React.useState<GlossaryTerm[]>(() => {
    try { return JSON.parse(localStorage.getItem("pv_glossary") ?? "[]"); }
    catch { return []; }
  });

  const topic = CURRICULUM[dayNumber % CURRICULUM.length];

  React.useEffect(() => {
    const cacheKey = `pv_lesson_${dayNumber}`;
    const cached   = sessionStorage.getItem(cacheKey);
    if (cached) { setLesson(JSON.parse(cached)); return; }

    setLoading(true);
    setError(null);
    fetch("/api/lesson", {
      method:  "POST",
      headers: { "content-type": "application/json", "x-ai-key": aiKey },
      body:    JSON.stringify({ dayNumber, topicIndex: dayNumber % CURRICULUM.length }),
    })
      .then(r => {
        if (r.status === 401) throw new Error("unauthorized");
        return r.json();
      })
      .then((d: Lesson) => {
        setLesson(d);
        sessionStorage.setItem(cacheKey, JSON.stringify(d));
        // save new jargon terms to glossary
        if (d.jargon?.length) {
          setGlossary(prev => {
            const existing = new Set(prev.map(g => g.term));
            const fresh    = d.jargon!.filter(j => !existing.has(j.term));
            const next     = [...prev, ...fresh];
            localStorage.setItem("pv_glossary", JSON.stringify(next));
            return next;
          });
        }
      })
      .catch((e) => setError(
        e?.message === "unauthorized"
          ? "That access key doesn't match what's set on the server — fix it in the 🔑 AI access key settings."
          : "Could not load today's lesson. Check that ANTHROPIC_API_KEY and AI_ACCESS_KEY are set."
      ))
      .finally(() => setLoading(false));
  }, [dayNumber]);

  function markUnderstood() {
    const next = dayNumber + 1;
    setDayNumber(next);
    localStorage.setItem("pv_lesson_day", String(next));
    setLesson(null);
  }

  function regenerate() {
    const cacheKey = `pv_lesson_${dayNumber}`;
    sessionStorage.removeItem(cacheKey);
    setLesson(null);
    setError(null);
    setLoading(true);
    fetch("/api/lesson", {
      method:  "POST",
      headers: { "content-type": "application/json", "x-ai-key": aiKey },
      body:    JSON.stringify({ dayNumber, topicIndex: dayNumber % CURRICULUM.length }),
    })
      .then(r => {
        if (r.status === 401) throw new Error("unauthorized");
        return r.json();
      })
      .then((d: Lesson) => { setLesson(d); sessionStorage.setItem(cacheKey, JSON.stringify(d)); })
      .catch((e) => setError(
        e?.message === "unauthorized"
          ? "That access key doesn't match what's set on the server — fix it in the 🔑 AI access key settings."
          : "Could not regenerate lesson."
      ))
      .finally(() => setLoading(false));
  }

  const progress = dayNumber % CURRICULUM.length;
  const pct      = Math.round((progress / CURRICULUM.length) * 100);

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>
            DAILY LESSON — DAY {dayNumber + 1}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.3 }}>
            {topic.topic}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, fontStyle: "italic" }}>
            {topic.hook}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Progress</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{pct}%</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{progress}/{CURRICULUM.length} lessons</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "#e2e8f0", borderRadius: 99, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#0f172a", borderRadius: 99, transition: "width 0.5s" }} />
      </div>

      {/* Lesson card */}
      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
          <div style={{ fontSize: 14 }}>Preparing your lesson…</div>
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, color: "#dc2626", fontSize: 13 }}>
          {error}
        </div>
      )}

      {lesson && !loading && <LessonCard lesson={lesson} topic={topic} />}

      {/* Action buttons */}
      {lesson && !loading && (
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={markUnderstood}
            style={{
              background: "#0f172a", color: "#fff", border: "none", borderRadius: 8,
              padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", flex: 1,
            }}
          >
            Got it — next lesson →
          </button>
          <button
            type="button"
            onClick={regenerate}
            style={{
              background: "none", border: "1px solid #e2e8f0", borderRadius: 8,
              padding: "12px 16px", fontSize: 13, color: "#64748b", cursor: "pointer",
            }}
          >
            ↻ Regenerate
          </button>
        </div>
      )}

      {/* Glossary */}
      {glossary.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 12 }}>
            YOUR GLOSSARY — {glossary.length} TERMS LEARNED
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {glossary.map((g, i) => (
              <div key={i} title={g.plain} style={{
                background: "#f1f5f9", borderRadius: 6, padding: "4px 10px",
                fontSize: 12, color: "#334155", cursor: "help",
              }}>
                {g.term}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface LessonCardProps {
  lesson: Lesson;
  topic: CurriculumDay;
}

type LessonTextKey = "what" | "analogy" | "todayExample" | "whyItMatters" | "mistakeToAvoid" | "watchTomorrow";

export function LessonCard({ lesson, topic }: LessonCardProps) {
  const sections: Array<{ key: LessonTextKey; icon: string; label: string }> = [
    { key: "what",          icon: "💡", label: "WHAT IS IT"                     },
    { key: "analogy",       icon: "🏠", label: "REAL WORLD ANALOGY"             },
    { key: "todayExample",  icon: "📊", label: "TODAY'S REAL NUMBERS"           },
    { key: "whyItMatters",  icon: "🎯", label: "WHY IT MATTERS FOR YOUR TRADES" },
    { key: "mistakeToAvoid",icon: "⚠️", label: "COMMON MISTAKE TO AVOID"        },
    { key: "watchTomorrow", icon: "👁️", label: "WATCH TOMORROW"                 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {sections.map(({ key, icon, label }) => {
        const text = lesson[key];
        if (!text) return null;
        return (
          <div key={key} style={{
            borderLeft: "3px solid #e2e8f0",
            paddingLeft: 16,
            paddingTop: 16,
            paddingBottom: 16,
            marginBottom: 4,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: 1.5, marginBottom: 6 }}>
              {icon} {label}
            </div>
            <div style={{ fontSize: 15, color: "#1e293b", lineHeight: 1.7 }}>
              {text}
            </div>
          </div>
        );
      })}

      {/* Jargon decoder */}
      {lesson.jargon?.length ? (
        <div style={{
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
          padding: 16, marginTop: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: 1.5, marginBottom: 10 }}>
            🔤 JARGON DECODER — OFFICIAL TERMS NOW THAT YOU UNDERSTAND THEM
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lesson.jargon.map((j, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{
                  background: "#0f172a", color: "#fff", borderRadius: 4,
                  padding: "2px 6px", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>
                  {j.term}
                </span>
                <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{j.plain}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
