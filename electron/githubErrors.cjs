function githubErrorMessage(status, message, endpoint = '', method = 'GET') {
  const normalizedEndpoint = String(endpoint || '');
  const normalizedMessage = String(message || '').toLowerCase();
  const isTeamEndpoint = /\/collaborators(\/|$)|\/invitations(\/|$)|\/contributors(\/|$)|\/stats\/contributors/.test(normalizedEndpoint);
  const isPullRequestEndpoint = /\/pulls(\/|$)/.test(normalizedEndpoint);
  if (status === 403 && method === 'DELETE' && endpoint.startsWith('/repos/') && !isTeamEndpoint) {
    return 'Удаление репозитория запрещено GitHub. Проверьте, что токен имеет право delete_repo и что у аккаунта есть admin-доступ к репозиторию.';
  }
  if (isPullRequestEndpoint && status === 403) {
    const permission = normalizedEndpoint.endsWith('/merge') ? 'Contents: write' : 'Pull requests: write';
    return `GitHub запретил операцию с pull request. Нужны права ${permission}.`;
  }
  if (isPullRequestEndpoint && status === 404) return 'Pull request не найден или больше недоступен.';
  if (isPullRequestEndpoint && status === 405) return 'GitHub не может объединить pull request в текущем состоянии.';
  if (isPullRequestEndpoint && status === 409) return 'Pull request изменился или содержит конфликт. Обновите его данные и проверьте изменения ещё раз.';
  if (isPullRequestEndpoint && status === 422) return 'GitHub отклонил операцию с pull request. Проверьте ветки, проверки и права доступа.';
  if (isTeamEndpoint && status === 202) return 'GitHub ещё рассчитывает статистику участников. Попробуйте обновить позже.';
  if (isTeamEndpoint && status === 404 && normalizedEndpoint.includes('/invitations/')) return 'Приглашение не найдено или уже недействительно.';
  if (isTeamEndpoint && status === 404) return 'GitHub не открыл данные Team для этого репозитория.';
  if (isTeamEndpoint && status === 422 && (normalizedMessage.includes('already a collaborator') || normalizedMessage.includes('already exists'))) {
    return 'Этот пользователь уже имеет доступ к репозиторию.';
  }
  if (isTeamEndpoint && status === 422 && normalizedMessage.includes('invite')) {
    return 'GitHub не смог создать приглашение. Проверьте имя пользователя и лимит приглашений.';
  }
  if (isTeamEndpoint && status === 422) return 'GitHub отклонил операцию с участниками. Проверьте username, роль и состояние приглашения.';
  if (isTeamEndpoint && status === 403) return 'GitHub запретил операцию с участниками. Нужны права Administration: write.';
  return message || `GitHub API: ${status}`;
}

function githubErrorCode(status, message = '', endpoint = '') {
  const normalized = String(message).toLowerCase();

  if (status === 401 || normalized.includes('bad credentials') || normalized.includes('requires authentication')) {
    return 'auth';
  }

  if (
    status === 403
    && (
      endpoint.startsWith('/user/repos')
      || /\/collaborators(\/|$)|\/invitations(\/|$)|\/pulls(\/|$)/.test(String(endpoint || ''))
      || normalized.includes('resource not accessible')
      || normalized.includes('permission')
      || normalized.includes('forbidden')
      || normalized.includes('scope')
    )
  ) {
    return 'permissions';
  }

  if (status === 408 || status === 429 || status >= 500) return 'github';
  return 'unknown';
}

function isAllowedGitHubDownloadUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:'
      && (
        url.hostname === 'github.com'
        || url.hostname === 'objects.githubusercontent.com'
        || url.hostname === 'release-assets.githubusercontent.com'
      );
  } catch {
    return false;
  }
}

function isValidIssueNumber(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

function isValidGitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function isValidGitRef(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes('..') || value.includes('//') || value.includes('@{')) return false;
  if (value.startsWith('/') || value.endsWith('/') || value.endsWith('.')) return false;
  return value.split('/').every(segment => (
    segment !== '.'
    && segment !== '..'
    && !segment.startsWith('.')
    && !segment.endsWith('.lock')
  ));
}

function isValidCommitLimit(value) {
  return Number.isInteger(value) && value >= 25 && value <= 100;
}

function isValidGitHubUsername(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)
    && value.length <= 39;
}

function isValidInvitationId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

function isValidCollaboratorPermission(value) {
  return ['pull', 'triage', 'push', 'maintain', 'admin'].includes(value);
}

function githubTeamState(status, items = []) {
  if (status === 202) return 'pending';
  if (status === 403) return 'forbidden';
  if (status === 404 || status === 422) return 'error';
  if (status === 204 || !Array.isArray(items) || items.length === 0) return 'empty';
  return 'loaded';
}

module.exports = {
  githubErrorMessage,
  githubErrorCode,
  isAllowedGitHubDownloadUrl,
  isValidIssueNumber,
  isValidGitSha,
  isValidGitRef,
  isValidCommitLimit,
  isValidGitHubUsername,
  isValidInvitationId,
  isValidCollaboratorPermission,
  githubTeamState,
};
