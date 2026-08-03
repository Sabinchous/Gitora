export type ConnectionErrorKind =
  | 'auth'
  | 'session'
  | 'permissions'
  | 'github'
  | 'network'
  | 'unknown';

export interface ConnectionErrorInfo {
  kind: ConnectionErrorKind;
  title: string;
  description: string;
  action: string;
  actionKind: 'retry' | 'reauthorize';
}

const ERROR_COPY: Record<ConnectionErrorKind, Omit<ConnectionErrorInfo, 'kind'>> = {
  auth: {
    title: 'Не удалось войти в GitHub',
    description: 'Проверьте данные авторизации и попробуйте войти снова.',
    action: 'Войти снова',
    actionKind: 'reauthorize',
  },
  session: {
    title: 'Подключение GitHub истекло',
    description: 'Срок действия подключения закончился. Требуется повторный вход.',
    action: 'Войти снова',
    actionKind: 'reauthorize',
  },
  permissions: {
    title: 'Не хватает прав GitHub',
    description: 'Gitora не получила доступ к репозиториям. Проверьте разрешения GitHub и повторите вход.',
    action: 'Войти снова',
    actionKind: 'reauthorize',
  },
  github: {
    title: 'GitHub временно недоступен',
    description: 'Сервис GitHub или его API не ответил. Проверьте соединение и попробуйте позже.',
    action: 'Повторить',
    actionKind: 'retry',
  },
  network: {
    title: 'Нет подключения к интернету',
    description: 'Проверьте сеть. После восстановления соединения повторите запрос.',
    action: 'Проверить подключение',
    actionKind: 'retry',
  },
  unknown: {
    title: 'Не удалось подключиться к GitHub',
    description: 'Попробуйте повторить запрос. Если проблема останется, выполните повторную авторизацию.',
    action: 'Повторить',
    actionKind: 'retry',
  },
};

export function connectionError(kind?: string, fallback?: string): ConnectionErrorInfo {
  const normalized = (kind || '').trim() as ConnectionErrorKind;
  if (normalized in ERROR_COPY) return { kind: normalized, ...ERROR_COPY[normalized] };

  const message = (fallback || '').toLowerCase();
  if (message.includes('интернет') || message.includes('fetch') || message.includes('network')) {
    return { kind: 'network', ...ERROR_COPY.network };
  }
  if (message.includes('прав') || message.includes('permission') || message.includes('forbidden')) {
    return { kind: 'permissions', ...ERROR_COPY.permissions };
  }
  if (message.includes('токен') || message.includes('авторизац') || message.includes('credentials')) {
    return { kind: 'auth', ...ERROR_COPY.auth };
  }
  return { kind: 'unknown', ...ERROR_COPY.unknown };
}
