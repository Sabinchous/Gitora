function repoEndpoint(owner, repo, suffix = '') {
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Invalid repository name');
  }
  return `/repos/${owner}/${repo}${suffix}`;
}

function refPath(branch) {
  if (
    typeof branch !== 'string'
    || !branch
    || branch.startsWith('/')
    || branch.endsWith('/')
    || branch.includes('..')
    || branch.includes('//')
    || !/^[A-Za-z0-9._/-]+$/.test(branch)
  ) {
    throw new Error('Invalid branch name');
  }
  return branch.split('/').map(encodeURIComponent).join('/');
}

function filePath(filePathValue) {
  if (
    typeof filePathValue !== 'string'
    || !filePathValue
    || filePathValue.startsWith('/')
    || filePathValue.endsWith('/')
    || filePathValue.includes('\\')
    || filePathValue.includes('..')
    || filePathValue.includes('//')
    || !/^[A-Za-z0-9._/-]+$/.test(filePathValue)
  ) {
    throw new Error('Invalid file path');
  }
  return filePathValue;
}

function isEmptyRepository(repository) {
  return repository?.empty === true || !repository?.default_branch;
}

async function createFirstRepositoryFile(request, { owner, repo, path, message, content, branch, repository }) {
  const repositoryInfo = repository || await request(repoEndpoint(owner, repo));
  const targetBranch = branch || repositoryInfo.default_branch || 'main';
  const blob = await request(repoEndpoint(owner, repo, '/git/blobs'), {
    method: 'POST',
    body: { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' },
  });
  const tree = await request(repoEndpoint(owner, repo, '/git/trees'), {
    method: 'POST',
    body: {
      tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
    },
  });
  const commit = await request(repoEndpoint(owner, repo, '/git/commits'), {
    method: 'POST',
    body: { message, tree: tree.sha },
  });
  const ref = await request(repoEndpoint(owner, repo, '/git/refs'), {
    method: 'POST',
    body: { ref: `refs/heads/${refPath(targetBranch)}`, sha: commit.sha },
  });
  return { content: { path, branch: targetBranch, sha: blob.sha }, commit, ref };
}

async function createRepositoryFile(request, { owner, repo, path: filePathValue, message, content, branch }) {
  const path = filePath(filePathValue);
  const repository = await request(repoEndpoint(owner, repo));
  if (isEmptyRepository(repository)) {
    return createFirstRepositoryFile(request, { owner, repo, path, message, content, branch, repository });
  }

  try {
    return await request(repoEndpoint(owner, repo, `/contents/${path.split('/').map(encodeURIComponent).join('/')}`), {
      method: 'PUT',
      body: {
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(branch ? { branch } : {}),
      },
    });
  } catch (error) {
    if ((error?.status === 404 || error?.status === 409) && /empty/i.test(error.message || '')) {
      return createFirstRepositoryFile(request, { owner, repo, path, message, content, branch, repository });
    }
    throw error;
  }
}

module.exports = { createRepositoryFile, isEmptyRepository, refPath, repoEndpoint };
