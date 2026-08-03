const DEFAULT_MAX_PAGES = 100;

function nextLinkFromHeader(linkHeader) {
  if (typeof linkHeader !== 'string' || !linkHeader.trim()) return null;

  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/i);
    if (!match) continue;
    const relations = match[2].split(/\s+/).map(value => value.toLowerCase());
    if (relations.includes('next')) return match[1];
  }

  return null;
}

function apiEndpointFromUrl(value, apiOrigin) {
  const url = new URL(value, apiOrigin);
  if (url.origin !== apiOrigin) throw new Error('GitHub pagination returned an unexpected origin');
  return `${url.pathname}${url.search}`;
}

async function fetchAllPages(endpoint, requestPage, options = {}) {
  const maxPages = Number.isInteger(options.maxPages) && options.maxPages > 0
    ? options.maxPages
    : DEFAULT_MAX_PAGES;
  const apiOrigin = options.apiOrigin || 'https://api.github.com';
  const items = [];
  let nextEndpoint = endpoint;
  let pageCount = 0;

  while (nextEndpoint) {
    pageCount += 1;
    if (pageCount > maxPages) {
      throw new Error(`GitHub pagination exceeded ${maxPages} pages`);
    }

    const page = await requestPage(nextEndpoint);
    if (!Array.isArray(page?.data)) return page?.data;
    items.push(...page.data);

    const nextUrl = nextLinkFromHeader(page.link);
    await options.onPage?.({
      page: pageCount,
      endpoint: nextEndpoint,
      itemCount: page.data.length,
      hasNext: Boolean(nextUrl),
      rateLimitRemaining: page.rateLimitRemaining,
      rateLimitLimit: page.rateLimitLimit,
    });
    nextEndpoint = nextUrl ? apiEndpointFromUrl(nextUrl, apiOrigin) : null;
  }

  return items;
}

module.exports = { DEFAULT_MAX_PAGES, nextLinkFromHeader, apiEndpointFromUrl, fetchAllPages };
