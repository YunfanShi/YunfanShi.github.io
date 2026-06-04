'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SyllabusSubject, SyllabusUnit, StepState, StudyConfig, MockRecord } from '@/types/study';
import {
  upsertSubject,
  updateStepDone,
  deleteSubject,
  updateStudyConfig,
  addMockRecord,
} from '@/actions/study';

// ── CSS Variables ──────────────────────────────────────────────────────────────

const CSS_VARS = `
:root {
  --study-primary: #00639b;
  --study-primary-light: #cce5f6;
  --study-primary-dark: #004a73;
  --study-surface: #f8f9fa;
  --study-card-bg: #ffffff;
  --study-text: #1a1a1a;
  --study-muted: #6b7280;
  --study-border: #e5e7eb;
}
`;

// ── Default subjects ──────────────────────────────────────────────────────────

const DEFAULT_SUBJECTS = [
  {
    subject_name: 'Mathematics',
    color: '#4285f4',
    units: [
      { name: 'Chapter 1: Numbers', steps: [{ label: 'Read', done: false }, { label: 'Notes', done: false }, { label: 'Practice', done: false }, { label: 'Review', done: false }] },
      { name: 'Chapter 2: Algebra', steps: [{ label: 'Read', done: false }, { label: 'Notes', done: false }, { label: 'Practice', done: false }, { label: 'Review', done: false }] },
    ],
  },
  {
    subject_name: 'Physics',
    color: '#34a853',
    units: [
      { name: 'Chapter 1: Mechanics', steps: [{ label: 'Read', done: false }, { label: 'Notes', done: false }, { label: 'Practice', done: false }, { label: 'Review', done: false }] },
    ],
  },
  {
    subject_name: 'Chemistry',
    color: '#fbbc04',
    units: [
      { name: 'Chapter 1: Atomic Structure', steps: [{ label: 'Read', done: false }, { label: 'Notes', done: false }, { label: 'Practice', done: false }, { label: 'Review', done: false }] },
    ],
  },
  {
    subject_name: 'Biology',
    color: '#ea4335',
    units: [
      { name: 'Chapter 1: Cell Biology', steps: [{ label: 'Read', done: false }, { label: 'Notes', done: false }, { label: 'Practice', done: false }, { label: 'Review', done: false }] },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProgress(units: SyllabusUnit[]): { done: number; total: number } {
  let done = 0, total = 0;
  for (const u of units) {
    for (const s of u.steps) {
      total++;
      if (s.done) done++;
    }
  }
  return { done, total };
}

function fmt2(n: number) {
  return String(n).padStart(2, '0');
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${fmt2(m)}:${fmt2(s)}`;
}

// ── SVG Progress Ring ─────────────────────────────────────────────────────────

function ProgressRing({ progress, color }: { progress: number; color: string }) {
  const r = 10, circumference = 2 * Math.PI * r;
  const offset = circumference - progress * circumference;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r={r} fill="none" stroke="#e0e0e0" strokeWidth="3" />
      <circle
        cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 14 14)"
      />
    </svg>
  );
}

// ── Quest Card ────────────────────────────────────────────────────────────────

interface QuestCardProps {
  unit: SyllabusUnit;
  unitIndex: number;
  color: string;
  subjectName: string;
  onToggle: (unitIndex: number, stepIndex: number, done: boolean) => void;
}

function QuestCard({ unit, unitIndex, color, subjectName, onToggle }: QuestCardProps) {
  const steps = unit.steps;

  function getStepStatus(idx: number): 'done' | 'active' | 'locked' {
    const s = steps[idx];
    if (s.done) return 'done';
    const prevAllDone = steps.slice(0, idx).every((x) => x.done);
    return prevAllDone ? 'active' : 'locked';
  }

  return (
    <div style={{
      background: 'var(--study-card-bg)',
      border: '1px solid var(--study-border)',
      borderRadius: 16,
      padding: '16px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      marginBottom: 12,
    }}>
      <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--study-text)', marginBottom: 12 }}>
        {unit.name}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {steps.map((step, idx) => {
          const status = getStepStatus(idx);
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <span style={{ color: '#ccc', fontSize: 14, userSelect: 'none' }}>→</span>
              )}
              <button
                onClick={() => {
                  if (status === 'active') onToggle(unitIndex, idx, true);
                  else if (status === 'done') onToggle(unitIndex, idx, false);
                }}
                disabled={status === 'locked'}
                title={status === 'locked' ? 'Complete previous steps first' : step.label}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: status === 'active' ? `2px solid ${color}` : '2px solid transparent',
                  background: status === 'done' ? '#e8f5e9' : status === 'active' ? `${color}18` : '#f3f4f6',
                  color: status === 'done' ? '#2e7d32' : status === 'active' ? color : '#9ca3af',
                  cursor: status === 'locked' ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s',
                }}
              >
                {status === 'done' && <span>✓</span>}
                {step.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Mock Exam Timer Overlay ───────────────────────────────────────────────────

interface MockTimerProps {
  subject: string;
  onClose: () => void;
  onSave: (rec: Omit<MockRecord, 'id' | 'created_at'>) => void;
}

function MockTimerOverlay({ subject, onClose, onSave }: MockTimerProps) {
  const [duration, setDuration] = useState(60);
  const [paper, setPaper] = useState('');
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(duration * 60);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [notes, setNotes] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (started && !paused && !finished) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current!);
            setFinished(true);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [started, paused, finished]);

  function handleStart() {
    setRemaining(duration * 60);
    setStarted(true);
    setPaused(false);
    setFinished(false);
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStarted(false);
    setPaused(false);
    setFinished(false);
    setRemaining(duration * 60);
  }

  async function handleSave() {
    await onSave({
      subject,
      paper: paper || null,
      score: score ? parseInt(score) : null,
      max_score: maxScore ? parseInt(maxScore) : null,
      duration_minutes: duration,
      notes: notes || null,
    });
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff',
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 24, right: 32,
        background: 'none', border: '1px solid #444', color: '#aaa',
        borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 14,
      }}>✕ Close</button>

      <p style={{ fontSize: 18, color: '#aaa', marginBottom: 8 }}>{subject}{paper ? ` · ${paper}` : ''}</p>

      <div style={{ fontSize: '15vw', fontFamily: 'monospace', fontWeight: 700, lineHeight: 1, marginBottom: 32 }}>
        {fmtTime(remaining)}
      </div>

      {!started && !finished && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginBottom: 24, width: 280 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 14, color: '#aaa', width: 80 }}>Duration</label>
            <input type="number" min={1} max={300} value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              style={{ width: 80, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 14 }}
            />
            <span style={{ color: '#aaa', fontSize: 13 }}>min</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 14, color: '#aaa', width: 80 }}>Paper</label>
            <input type="text" placeholder="e.g. P1 Oct/Nov 2023" value={paper}
              onChange={(e) => setPaper(e.target.value)}
              style={{ width: 180, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 14 }}
            />
          </div>
        </div>
      )}

      {finished && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginBottom: 24, width: 300 }}>
          <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 18 }}>⏰ Time&apos;s up!</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 14, color: '#aaa', width: 80 }}>Score</label>
            <input type="number" value={score} onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 72" style={{ width: 80, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 14 }}
            />
            <span style={{ color: '#aaa' }}>/</span>
            <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
              placeholder="100" style={{ width: 80, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 14, color: '#aaa', width: 80 }}>Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes" style={{ width: 180, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 14 }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        {!started && !finished && (
          <button onClick={handleStart} style={{ background: '#00639b', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            ▶ Start
          </button>
        )}
        {started && !finished && (
          <>
            <button onClick={() => setPaused((p) => !p)} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 16, cursor: 'pointer' }}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button onClick={handleReset} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 16, cursor: 'pointer' }}>
              ↺ Reset
            </button>
          </>
        )}
        {finished && (
          <>
            <button onClick={handleSave} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              💾 Save Record
            </button>
            <button onClick={handleReset} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 16, cursor: 'pointer' }}>
              ↺ Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────

interface SettingsModalProps {
  config: StudyConfig;
  subjects: SyllabusSubject[];
  mockRecords: MockRecord[];
  onClose: () => void;
  onConfigSave: (c: Partial<StudyConfig>) => void;
  onAddSubject: (name: string, color: string) => void;
  onDeleteSubject: (name: string) => void;
  onImportSyllabus: (data: SyllabusSubject[]) => void;
}

function SettingsModal({
  config, subjects, mockRecords,
  onClose, onConfigSave, onAddSubject, onDeleteSubject, onImportSyllabus,
}: SettingsModalProps) {
  const [tab, setTab] = useState<'general' | 'syllabus' | 'mocks'>('general');
  const [draft, setDraft] = useState<StudyConfig>({ ...config });
  const [newSubName, setNewSubName] = useState('');
  const [newSubColor, setNewSubColor] = useState('#4285f4');

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'general', label: 'General & Emergency' },
    { key: 'syllabus', label: 'Syllabus Manager' },
    { key: 'mocks', label: 'Mock Records' },
  ];

  function handleExport() {
    const json = JSON.stringify(subjects, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'syllabus.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data)) onImportSyllabus(data as SyllabusSubject[]);
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '90%', maxWidth: 620,
        maxHeight: '85vh', overflowY: 'auto', padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>⚙ Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', border: 'none', background: 'none',
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? '#00639b' : '#6b7280',
              borderBottom: tab === t.key ? '2px solid #00639b' : '2px solid transparent',
              cursor: 'pointer', fontSize: 14,
            }}>{t.label}</button>
          ))}
        </div>

        {/* General tab */}
        {tab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'School Date', key: 'school_date' as const, type: 'date' },
              { label: 'Exam Date', key: 'exam_date' as const, type: 'date' },
              { label: 'Emergency Deadline', key: 'emergency_deadline' as const, type: 'datetime-local' },
              { label: 'Emergency Note', key: 'emergency_note' as const, type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ width: 160, fontSize: 14, color: '#374151', fontWeight: 500 }}>{label}</label>
                <input type={type} value={(draft[key] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <label style={{ width: 160, fontSize: 14, color: '#374151', fontWeight: 500, paddingTop: 8 }}>Emergency Subjects</label>
              <div style={{ flex: 1 }}>
                <input type="text" value={draft.emergency_subjects.join(', ')}
                  onChange={(e) => setDraft({ ...draft, emergency_subjects: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Math, Physics, ..."
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
                />
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Comma-separated subject names</p>
              </div>
            </div>
            <button onClick={() => onConfigSave(draft)} style={{
              marginTop: 8, alignSelf: 'flex-end',
              background: '#00639b', color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer',
            }}>Save</button>
          </div>
        )}

        {/* Syllabus tab */}
        {tab === 'syllabus' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Subject name" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
              />
              <input type="color" value={newSubColor} onChange={(e) => setNewSubColor(e.target.value)}
                style={{ width: 44, height: 38, border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', padding: 2 }}
              />
              <button onClick={() => { if (newSubName.trim()) { onAddSubject(newSubName.trim(), newSubColor); setNewSubName(''); } }}
                style={{ background: '#00639b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                + Add
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subjects.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{s.subject_name}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.units.length} unit(s)</span>
                  <button onClick={() => onDeleteSubject(s.subject_name)} style={{
                    background: 'none', border: '1px solid #fca5a5', color: '#ef4444',
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                  }}>Remove</button>
                </div>
              ))}
              {subjects.length === 0 && <p style={{ color: '#9ca3af', fontSize: 14 }}>No subjects added yet.</p>}
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
              <button onClick={handleExport} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                ⬇ Export JSON
              </button>
              <label style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                ⬆ Import JSON
                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        )}

        {/* Mock records tab */}
        {tab === 'mocks' && (
          <div>
            {mockRecords.length === 0 && <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>No mock exam records yet.</p>}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    {['Date', 'Subject', 'Paper', 'Score', 'Duration', 'Notes'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockRecords.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.subject}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{r.paper ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{r.score != null ? `${r.score}/${r.max_score ?? '?'}` : '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{r.duration_minutes ? `${r.duration_minutes} min` : '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7280', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Unit Modal ────────────────────────────────────────────────────────────

interface AddUnitModalProps {
  subjectName: string;
  onClose: () => void;
  onAdd: (unitName: string) => void;
}

function AddUnitModal({ subjectName, onClose, onAdd }: AddUnitModalProps) {
  const [name, setName] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add Unit to {subjectName}</h3>
        <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onAdd(name.trim()); onClose(); } }}
          placeholder="Unit / Chapter name"
          style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (name.trim()) { onAdd(name.trim()); onClose(); } }}
            style={{ background: '#00639b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main StudyApp ─────────────────────────────────────────────────────────────

interface StudyAppProps {
  initialSubjects: SyllabusSubject[];
  initialConfig: StudyConfig;
  initialMockRecords: MockRecord[];
}

export default function StudyApp({ initialSubjects, initialConfig, initialMockRecords }: StudyAppProps) {
  const [subjects, setSubjects] = useState<SyllabusSubject[]>(initialSubjects);
  const [config, setConfig] = useState<StudyConfig>(initialConfig);
  const [mockRecords, setMockRecords] = useState<MockRecord[]>(initialMockRecords);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mockSubject, setMockSubject] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [addUnitFor, setAddUnitFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeSubject = subjects[activeIdx] ?? null;

  // Emergency banner: within 72 h of deadline
  const showEmergency = (() => {
    if (!config.emergency_deadline) return false;
    const diff = new Date(config.emergency_deadline).getTime() - Date.now();
    return diff > 0 && diff < 72 * 3600 * 1000;
  })();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleStep = useCallback(async (unitIndex: number, stepIndex: number, done: boolean) => {
    if (!activeSubject) return;
    const updated = subjects.map((s, i) => {
      if (i !== activeIdx) return s;
      const units = s.units.map((u, ui) => {
        if (ui !== unitIndex) return u;
        const steps = u.steps.map((st, si) => si === stepIndex ? { ...st, done } : st);
        return { ...u, steps };
      });
      return { ...s, units };
    });
    setSubjects(updated);
    setSaving(true);
    try {
      await updateStepDone(activeSubject.subject_name, unitIndex, stepIndex, done);
    } catch { /* optimistic, ignore */ }
    setSaving(false);
  }, [activeSubject, activeIdx, subjects]);

  const handleSeedDefaults = async () => {
    setSaving(true);
    const created: SyllabusSubject[] = [];
    for (const d of DEFAULT_SUBJECTS) {
      await upsertSubject(d.subject_name, d.color, d.units);
      created.push({ id: d.subject_name, user_id: '', subject_name: d.subject_name, color: d.color, units: d.units });
    }
    setSubjects(created);
    setSaving(false);
  };

  const handleAddSubject = async (name: string, color: string) => {
    const units: SyllabusUnit[] = [];
    await upsertSubject(name, color, units);
    setSubjects((prev) => [...prev, { id: name, user_id: '', subject_name: name, color, units }]);
  };

  const handleDeleteSubject = async (name: string) => {
    await deleteSubject(name);
    setSubjects((prev) => prev.filter((s) => s.subject_name !== name));
    setActiveIdx(0);
  };

  const handleConfigSave = async (c: Partial<StudyConfig>) => {
    await updateStudyConfig(c);
    setConfig((prev) => ({ ...prev, ...c }));
    setShowSettings(false);
  };

  const handleImportSyllabus = async (data: SyllabusSubject[]) => {
    setSaving(true);
    for (const s of data) {
      await upsertSubject(s.subject_name, s.color, s.units);
    }
    setSubjects(data);
    setSaving(false);
  };

  const handleAddUnit = async (unitName: string) => {
    if (!activeSubject) return;
    const newUnit: SyllabusUnit = {
      name: unitName,
      steps: [
        { label: 'Read', done: false },
        { label: 'Notes', done: false },
        { label: 'Practice', done: false },
        { label: 'Review', done: false },
      ],
    };
    const updated = subjects.map((s, i) => {
      if (i !== activeIdx) return s;
      return { ...s, units: [...s.units, newUnit] };
    });
    setSubjects(updated);
    await upsertSubject(activeSubject.subject_name, activeSubject.color, updated[activeIdx].units);
  };

  const handleSaveMockRecord = async (rec: Omit<MockRecord, 'id' | 'created_at'>) => {
    await addMockRecord(rec);
    setMockRecords((prev) => [{ ...rec, id: Date.now().toString(), created_at: new Date().toISOString() }, ...prev]);
    setMockSubject(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const { done: totalDone, total: totalSteps } = activeSubject
    ? calcProgress(activeSubject.units)
    : { done: 0, total: 0 };

  return (
    <>
      <style>{CSS_VARS}</style>

      {mockSubject && (
        <MockTimerOverlay subject={mockSubject} onClose={() => setMockSubject(null)} onSave={handleSaveMockRecord} />
      )}

      {showSettings && (
        <SettingsModal
          config={config}
          subjects={subjects}
          mockRecords={mockRecords}
          onClose={() => setShowSettings(false)}
          onConfigSave={handleConfigSave}
          onAddSubject={handleAddSubject}
          onDeleteSubject={handleDeleteSubject}
          onImportSyllabus={handleImportSyllabus}
        />
      )}

      {addUnitFor && (
        <AddUnitModal subjectName={addUnitFor} onClose={() => setAddUnitFor(null)} onAdd={handleAddUnit} />
      )}

      {/* Emergency banner */}
      {showEmergency && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 10, padding: '12px 20px',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 15 }}>
            紧急任务: {config.emergency_note ?? config.emergency_subjects.join(', ')}
            {' '}— 截止: {config.emergency_deadline}
          </span>
        </div>
      )}

      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0, color: 'var(--study-text)' }}>
          📚 CAIE Dashboard
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          {saving && <span style={{ color: '#9ca3af', fontSize: 13, alignSelf: 'center' }}>Saving…</span>}
          <button onClick={() => setShowSettings(true)} style={{
            background: '#f3f4f6', border: '1px solid #e5e7eb',
            borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
          }}>⚙ Config</button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: 24, minHeight: 500 }}>
        {/* Sidebar */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {subjects.map((s, i) => {
            const { done, total } = calcProgress(s.units);
            const pct = total ? done / total : 0;
            const isActive = i === activeIdx;
            return (
              <button key={s.id} onClick={() => setActiveIdx(i)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 12, border: 'none',
                background: isActive ? `${s.color}18` : 'transparent',
                boxShadow: isActive ? `inset 3px 0 0 ${s.color}` : 'none',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}>
                <span style={{ color: s.color }}><ProgressRing progress={pct} color={s.color} /></span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ fontWeight: isActive ? 700 : 500, fontSize: 14, margin: 0, color: 'var(--study-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.subject_name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--study-muted)', margin: 0 }}>{done}/{total} steps</p>
                </div>
              </button>
            );
          })}

          {subjects.length === 0 && (
            <button onClick={handleSeedDefaults} style={{
              background: '#00639b', color: '#fff', border: 'none',
              borderRadius: 12, padding: '12px 16px', cursor: 'pointer',
              fontWeight: 600, fontSize: 14, marginTop: 8,
            }}>+ 加载默认科目</button>
          )}

          {/* Divider + Mock Exam */}
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />
          <button onClick={() => setMockSubject(activeSubject?.subject_name ?? subjects[0]?.subject_name ?? 'Unknown')}
            disabled={subjects.length === 0}
            style={{
              background: '#0f172a', color: '#fff', border: 'none',
              borderRadius: 12, padding: '10px 14px', cursor: subjects.length ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 13, opacity: subjects.length ? 1 : 0.5,
            }}>
            🎯 Mock Exam
          </button>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeSubject ? (
            <>
              {/* Subject header */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: activeSubject.color }} />
                  <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>{activeSubject.subject_name}</h2>
                </div>
                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 10, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: activeSubject.color,
                      width: `${totalSteps ? (totalDone / totalSteps) * 100 : 0}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {totalDone}/{totalSteps} steps done
                  </span>
                </div>
              </div>

              {/* Quest cards */}
              {activeSubject.units.map((unit, ui) => (
                <QuestCard
                  key={ui}
                  unit={unit}
                  unitIndex={ui}
                  color={activeSubject.color}
                  subjectName={activeSubject.subject_name}
                  onToggle={handleToggleStep}
                />
              ))}

              {/* Add unit button */}
              <button onClick={() => setAddUnitFor(activeSubject.subject_name)} style={{
                marginTop: 8, background: 'none', border: '2px dashed #e5e7eb',
                borderRadius: 16, padding: '14px 20px', cursor: 'pointer',
                color: '#9ca3af', fontWeight: 600, fontSize: 14, width: '100%',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = activeSubject.color)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
              >
                + Add Unit / Chapter
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 80, color: '#9ca3af' }}>
              <p style={{ fontSize: 18, marginBottom: 16 }}>No subjects yet.</p>
              <button onClick={handleSeedDefaults} style={{
                background: '#00639b', color: '#fff', border: 'none',
                borderRadius: 12, padding: '12px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 15,
              }}>+ 加载默认科目</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
