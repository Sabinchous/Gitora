function githubErrorMessage(status, message, endpoint = '', method = 'GET') {
  if (status === 403 && method === 'DELETE' && endpoint.startsWith('/repos/')) {
    return 'Удаление репозитория запрещено GitHub. Проверьте, что токен имеет право delete_repo и что у аккаунта есть admin-доступ к репозиторию.';
  }
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
      && (url.hostname === 'github.com' || url.hostname === 'objects.githubusercontent.com');
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

module.exports = {
  githubErrorMessage,
  githubErrorCode,
  isAllowedGitHubDownloadUrl,
  isValidIssueNumber,
  isValidGitSha,
  isValidGitRef,
  isValidCommitLimit,
};
