// ========================================================
// 🐙 مزود التخزين: GitHub (Storage Provider)
// طبقة منخفضة المستوى فقط: "ارفع ملف" أو "اعمل كوميت لعدة ملفات".
// لا تعرف شيء عن صور أو منتجات أو كتالوج - هذا مقصود، حتى لو
// تغيّر مزود التخزين لاحقاً (R2 / S3) نلمس هذا الملف فقط.
// ========================================================

import { arrayBufferToBase64 } from '../../../core/encoding.js';

const GITHUB_API = 'https://api.github.com';

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Cloudflare-Worker',
  };
}

export async function getSingleFileContent(env, path) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_DATA_REPO || env.GITHUB_REPO;
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`, {
    headers: githubHeaders(env),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`فشل قراءة الملف من GitHub (${response.status}): ${await response.text()}`);
  }

  const file = await response.json();
  if (file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error(`صيغة الملف غير مدعومة من GitHub: ${path}`);
  }

  const binary = atob(file.content.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// رفع/تحديث ملف واحد عبر Contents API (مناسب للصور)
export async function putSingleFile(env, path, base64Content, commitMessage, { createOnly = false } = {}) {
  const owner = env.GITHUB_OWNER;
  // 📦 مستودع البيانات المنفصل (إن وُجد) - لا يُربط ببناء Vercel. راجع CHANGES.md
  const repo = env.GITHUB_DATA_REPO || env.GITHUB_REPO;
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
  const headers = githubHeaders(env);

  let sha;
  if (!createOnly) {
    const existing = await fetch(url, { headers });
    if (existing.ok) {
      sha = (await existing.json()).sha;
    }
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      content: base64Content,
      sha,
    }),
  });
  if (!res.ok) throw new Error('فشل رفع الملف إلى GitHub: ' + (await res.text()));

  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${path}`;
}

// GitHub GraphQL creates one atomic commit containing all text and binary files
// via createCommitOnBranch, using the latest branch HEAD OID as expectedHeadOid.
export async function commitMultipleFiles(env, files, commitMessage, options = {}) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_DATA_REPO || env.GITHUB_REPO;
  const branchName = env.GITHUB_BRANCH || 'main';

  const additions = files.filter((file) => file.content !== undefined).map((file) => ({
    path: file.path,
    contents:
      file.encoding === 'base64'
        ? file.content
        : arrayBufferToBase64(new TextEncoder().encode(file.content).buffer),
  }));
  const deletions = files.filter((file) => file.delete).map((file) => ({ path: file.path }));

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let expectedHeadOid = options.expectedHeadOid;
    let activeBranchName = branchName;

    if (!expectedHeadOid) {
      const headResponse = await fetch(`${GITHUB_API}/graphql`, {
        method: 'POST',
        headers: {
          ...githubHeaders(env),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query GetBranchHead($owner: String!, $repo: String!, $branchRef: String!) {
            repository(owner: $owner, name: $repo) {
              ref(qualifiedName: $branchRef) {
                name
                target { oid }
              }
              defaultBranchRef {
                name
                target { oid }
              }
            }
          }`,
          variables: {
            owner,
            repo,
            branchRef: `refs/heads/${branchName}`,
          },
        }),
      });

      let headResult;
      try {
        headResult = await headResponse.json();
      } catch {
        throw new Error(`GitHub returned a non-JSON response while fetching branch head (${headResponse.status}).`);
      }

      if (!headResponse.ok || headResult?.errors?.length) {
        const errorDetails = (Array.isArray(headResult?.errors) ? headResult.errors : [])
          .map((e) => e.message)
          .join('; ');
        const requestId = headResponse.headers.get('x-github-request-id');
        const context = [
          `HTTP ${headResponse.status}`,
          requestId ? `request ${requestId}` : null,
          errorDetails || null,
        ].filter(Boolean);
        throw new Error(`فشل قراءة رأس الفرع من GitHub (${context.join(', ')})`);
      }

      const branchRef = headResult.data?.repository?.ref || headResult.data?.repository?.defaultBranchRef;
      if (!branchRef?.target?.oid) {
        throw new Error(`تعذر العثور على الفرع ${branchName} أو المستودع فارغ في ${owner}/${repo}`);
      }

      activeBranchName = branchRef.name || branchName;
      expectedHeadOid = branchRef.target.oid;
    }

    const response = await fetch(`${GITHUB_API}/graphql`, {
      method: 'POST',
      headers: {
        ...githubHeaders(env),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation CreateStoreCommit($input: CreateCommitOnBranchInput!) {
          createCommitOnBranch(input: $input) {
            commit { oid }
          }
        }`,
        variables: {
          input: {
            branch: {
              repositoryNameWithOwner: `${owner}/${repo}`,
              branchName: activeBranchName,
            },
            message: { headline: commitMessage },
            expectedHeadOid,
            fileChanges: { additions, deletions },
          },
        },
      }),
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`GitHub returned a non-JSON response while publishing files (${response.status}).`);
    }

    const commitSha = result?.data?.createCommitOnBranch?.commit?.oid;
    if (!response.ok || result?.errors?.length || !commitSha) {
      const details = (Array.isArray(result?.errors) ? result.errors : [])
        .map((error) => {
          const parts = [error.type, error.message, Array.isArray(error.path) ? error.path.join('.') : null].filter(
            Boolean
          );
          return parts.join(': ');
        })
        .filter(Boolean);
      if (details.length === 0 && typeof result?.message === 'string') {
        details.push(result.message);
      }
      const requestId = response.headers.get('x-github-request-id');
      const context = [
        `HTTP ${response.status}`,
        requestId ? `request ${requestId}` : null,
        details.length ? details.join('; ') : null,
      ].filter(Boolean);

      const errorMessage = details.join('; ');
      const isConflict = /point to|conflict|head/i.test(errorMessage);
      if (isConflict && attempt < MAX_ATTEMPTS && !options.expectedHeadOid) {
        console.warn(`[GitHub] تعارض في رأس الفرع (${expectedHeadOid})، إعادة المحاولة ${attempt}/${MAX_ATTEMPTS}...`);
        continue;
      }

      throw new Error(`فشل نشر الملفات إلى GitHub (${context.join(', ')})`);
    }

    return commitSha;
  }
}
