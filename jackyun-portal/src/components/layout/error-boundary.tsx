'use client';

import { Component, ReactNode } from 'react';
import logger from '@/lib/logger';

const TAG = 'ErrorBoundary';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(TAG, 'React render error caught', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.setState({
      errorInfo: errorInfo.componentStack || '',
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-8">
          <div className="max-w-lg w-full rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#EA4335]/10 flex items-center justify-center mx-auto">
              <span className="material-icons-round text-3xl text-[#EA4335]">error_outline</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">页面出错了</h2>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                渲染组件时发生了未预期的错误。
              </p>
            </div>

            <div className="text-left rounded-[12px] border border-[#EA4335]/20 bg-[#EA4335]/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-[#EA4335] flex items-center gap-1">
                <span className="material-icons-round text-sm">bug_report</span>
                错误详情
              </p>
              <div className="space-y-1.5">
                <div>
                  <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide">消息</p>
                  <p className="text-sm text-[var(--foreground)] font-mono break-all">
                    {this.state.error?.message || 'Unknown error'}
                  </p>
                </div>
                {this.state.error?.stack && (
                  <details>
                    <summary className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]">
                      查看堆栈跟踪
                    </summary>
                    <pre className="mt-1 text-[11px] text-[var(--muted-foreground)] whitespace-pre-wrap break-all leading-relaxed max-h-[200px] overflow-y-auto bg-[var(--background)] rounded-lg p-2 border border-[var(--card-border)]">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
                {this.state.errorInfo && (
                  <details>
                    <summary className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]">
                      查看组件堆栈
                    </summary>
                    <pre className="mt-1 text-[11px] text-[var(--muted-foreground)] whitespace-pre-wrap break-all leading-relaxed max-h-[200px] overflow-y-auto bg-[var(--background)] rounded-lg p-2 border border-[var(--card-border)]">
                      {this.state.errorInfo}
                    </pre>
                  </details>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: '' });
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}