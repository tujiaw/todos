export interface DashboardCopy {
  title: string;
  subtitle: string;
}

const DEFAULT_DASHBOARD_COPY: DashboardCopy = {
  title: 'Make today feel lighter.',
  subtitle: 'Choose what matters, give it a place, and let the rest wait.',
};

export function getDefaultDashboardCopy(): DashboardCopy {
  return { ...DEFAULT_DASHBOARD_COPY };
}

export function buildDashboardCopyPrompt(input: {
  currentDate: string;
  pendingTasks: number;
  completedTasks: number;
}): string {
  return [
    'Write calm, concise dashboard copy for a personal daily task app.',
    `Date: ${input.currentDate}`,
    `Pending tasks: ${input.pendingTasks}`,
    `Completed tasks: ${input.completedTasks}`,
    'Return one JSON object with exactly these string fields: title, subtitle.',
    'The title must be 3-8 English words and at most 60 characters.',
    'The subtitle must be one English sentence, 8-18 words, and at most 120 characters.',
    'Use an encouraging but restrained tone. Do not mention AI, task counts, dates, quotes, emojis, or markdown.',
    'Avoid repeating this fallback copy:',
    JSON.stringify(DEFAULT_DASHBOARD_COPY),
  ].join('\n');
}

export function validateDashboardCopy(value: unknown): DashboardCopy {
  if (!value || typeof value !== 'object') {
    throw new Error('AI returned invalid dashboard copy.');
  }
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const subtitle = typeof record.subtitle === 'string' ? record.subtitle.trim() : '';
  if (!title || title.length > 60 || !subtitle || subtitle.length > 120) {
    throw new Error('AI returned invalid dashboard copy.');
  }
  return { title, subtitle };
}
