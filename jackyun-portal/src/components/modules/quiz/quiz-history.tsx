'use client';

import { useState, useEffect, useCallback } from 'react';
import { QuizSession, QuizSessionWithQuestions, QuizQuestion } from '@/types/quiz';
import { getSessionHistory, getSessionQuestions, deleteSession, getQuizStats } from '@/actions/quiz';

interface QuizHistoryProps {
  onClose: () => void;
}

export default function QuizHistory({ onClose }: QuizHistoryProps) {
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [stats, setStats] = useState<{ totalQuizzes: number; totalQuestions: number; averageAccuracy: number; totalTimeMinutes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<QuizSessionWithQuestions | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [historyResult, statsResult] = await Promise.all([
      getSessionHistory(50, 0),
      getQuizStats(),
    ]);

    if ('sessions' in historyResult) {
      setSessions(historyResult.sessions);
    } else {
      setError(historyResult.error);
    }

    if ('totalQuizzes' in statsResult) {
      setStats(statsResult);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleViewSession = async (sessionId: string) => {
    if (expandedSession?.id === sessionId) {
      setExpandedSession(null);
      return;
    }

    setExpandLoading(true);
    const result = await getSessionQuestions(sessionId);
    if ('session' in result) {
      setExpandedSession(result.session);
    }
    setExpandLoading(false);
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Delete this quiz session?')) return;
    const result = await deleteSession(sessionId);
    if ('ok' in result) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (expandedSession?.id === sessionId) setExpandedSession(null);
      // Reload stats
      const statsResult = await getQuizStats();
      if ('totalQuizzes' in statsResult) setStats(statsResult);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
          <span className="material-icons-round text-[#4285F4]">history</span>
          Quiz History
        </h2>
        <button
          onClick={() => loadData()}
          className="p-2 rounded-lg hover:bg-[var(--background)] text-[var(--muted-foreground)] transition-all"
          title="Refresh"
        >
          <span className="material-icons-round text-base">refresh</span>
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Quizzes', value: stats.totalQuizzes, icon: 'quiz' },
            { label: 'Questions', value: stats.totalQuestions, icon: 'question_answer' },
            { label: 'Avg Score', value: `${stats.averageAccuracy}%`, icon: 'trending_up' },
            { label: 'Time', value: `${stats.totalTimeMinutes}m`, icon: 'timer' },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-center">
              <span className="material-icons-round text-[#4285F4] text-sm">{item.icon}</span>
              <p className="text-sm font-bold text-[var(--foreground)]">{item.value}</p>
              <p className="text-[10px] text-[var(--muted-foreground)]">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-5 h-5 border-2 border-[#4285F4] border-t-transparent rounded-full" />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg p-3">{error}</p>
      )}

      {/* Empty */}
      {!loading && !error && sessions.length === 0 && (
        <div className="text-center py-12">
          <span className="material-icons-round text-4xl text-[var(--card-border)] mb-2">history</span>
          <p className="text-sm text-[var(--muted-foreground)]">No quiz history yet</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Start a quiz to see your history here</p>
        </div>
      )}

      {/* Sessions List */}
      {!loading && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map(session => (
            <div key={session.id} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
              <button
                onClick={() => handleViewSession(session.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--background)] transition-colors"
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  session.accuracy >= 80 ? 'bg-[#34A853]/10 text-[#34A853]' :
                  session.accuracy >= 60 ? 'bg-[#FBBC04]/10 text-[#F9A825]' :
                  'bg-[#EA4335]/10 text-[#EA4335]'
                }`}>
                  {session.accuracy}%
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {session.subject_name || 'Untitled Quiz'}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {formatDate(session.started_at)} · {session.correct_count}/{session.total_questions} correct
                    {session.duration_seconds > 0 && ` · ${formatDuration(session.duration_seconds)}`}
                  </p>
                </div>
                <span className="material-icons-round text-sm text-[var(--muted-foreground)]">
                  {expandedSession?.id === session.id ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {/* Expanded details */}
              {expandedSession?.id === session.id && (
                <div className="border-t border-[var(--card-border)] p-4 space-y-2 animate-fade-in">
                  {expandLoading && (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin w-4 h-4 border-2 border-[#4285F4] border-t-transparent rounded-full" />
                    </div>
                  )}

                  {!expandLoading && expandedSession.questions.map((q: QuizQuestion, i: number) => (
                    <div key={q.id || i} className="flex items-start gap-2 p-2 rounded-lg bg-[var(--background)]">
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        q.is_correct ? 'bg-[#34A853] text-white' : q.user_answer ? 'bg-[#EA4335] text-white' : 'bg-[var(--card-border)] text-[var(--muted-foreground)]'
                      }`}>
                        {q.is_correct ? '✓' : q.user_answer ? '✗' : '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--foreground)] truncate">
                          Q{i + 1}: {q.question_text.slice(0, 100)}{q.question_text.length > 100 ? '...' : ''}
                        </p>
                        {q.user_answer && (
                          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                            Yours: {q.user_answer.slice(0, 50)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                    className="flex items-center gap-1 text-xs text-[#EA4335] hover:underline mt-2"
                  >
                    <span className="material-icons-round text-xs">delete</span>
                    Delete this session
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}