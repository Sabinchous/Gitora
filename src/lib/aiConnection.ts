import { AiConnectionLevel, AiDiagnosticStep } from '../types';

export function aiLevelLabel(level: AiConnectionLevel) {
  if (level === 'ready') return 'Подключено';
  if (level === 'attention') return 'Ожидает MCP-сессию — подключить сейчас';
  if (level === 'error') return 'Ошибка подключения';
  return 'Не настроено';
}

export function aiLevelTone(level: AiConnectionLevel) {
  if (level === 'ready') return 'success';
  if (level === 'attention') return 'warning';
  if (level === 'error') return 'danger';
  return 'neutral';
}

export function diagnosticsSummary(steps: AiDiagnosticStep[]) {
  return {
    success: steps.filter(step => step.status === 'success').length,
    warning: steps.filter(step => step.status === 'warning' || step.status === 'skipped').length,
    error: steps.filter(step => step.status === 'error').length,
  };
}
