import React, { useState } from 'react';
import { LoaderCircle, Mail } from 'lucide-react';

export type EmailAuthMode = 'signin' | 'signup';

interface EmailAuthFormProps {
  isSubmitting: boolean;
  infoMessage?: string | null;
  onSubmit: (mode: EmailAuthMode, email: string, password: string) => Promise<void>;
}

export const EmailAuthForm: React.FC<EmailAuthFormProps> = ({
  isSubmitting,
  infoMessage,
  onSubmit,
}) => {
  const [mode, setMode] = useState<EmailAuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isSignIn = mode === 'signin';
  const canSubmit = email.trim().length > 0 && password.length >= 6 && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(mode, email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <div className="space-y-1.5">
        <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          邮箱
        </label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          密码
        </label>
        <input
          id="auth-password"
          type="password"
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={isSignIn ? '输入密码' : '至少 6 位'}
          minLength={6}
          className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          required
        />
      </div>

      {infoMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
        >
          {infoMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full min-h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle className="w-4 h-4 animate-spin" />
            <span>{isSignIn ? '登录中…' : '注册中…'}</span>
          </>
        ) : (
          <>
            <Mail className="w-4 h-4" />
            <span>{isSignIn ? '邮箱登录' : '注册账号'}</span>
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        {isSignIn ? '还没有账号？' : '已经有账号？'}
        <button
          type="button"
          onClick={() => setMode(isSignIn ? 'signup' : 'signin')}
          className="ml-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          disabled={isSubmitting}
        >
          {isSignIn ? '注册' : '去登录'}
        </button>
      </p>
    </form>
  );
};
