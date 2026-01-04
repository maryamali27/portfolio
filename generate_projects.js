/**
 * generate_projects.js
 *
 * Usage:
 *   node generate_projects.js --username maryamali27 --token YOUR_GITHUB_TOKEN
 *
 * Output:
 *   - writes projects.json in the same directory containing an array of project objects:
 *     { name, repo, desc, tags, stars, forks, featured, updated_at, language, license, thumbnail, screenshots, size, open_issues_count, default_branch, created_at }
 *
 * Notes:
 *  - Node 18+ recommended (fetch available). For older Node, install node-fetch and uncomment the import.
 *  - Provide a personal access token to avoid strict rate limits when fetching many repos or README.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function argVal(key) {
  const idx = args.indexOf(key);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

const username = argVal('--username') || argVal('-u') || 'maryamali27';
const token = argVal('--token') || argVal('-t') || null;
const outFile = path.join(process.cwd(), 'projects.json');

const headers = {
  'User-Agent': 'portfolio-generator',
  Accept: 'application/vnd.github.v3+json'
};
if (token) headers.Authorization = `token ${token}`;

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { ...headers, ...extraHeaders } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return await res.json();
}

async function fetchRaw(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { ...headers, ...extraHeaders } });
  if (!res.ok) return null;
  return await res.text();
}

async function listRepos(user) {
  const perPage = 100;
  let page = 1;
  const all = [];
  while (true) {
    const url = `https://api.github.com/users/${user}/repos?per_page=${perPage}&page=${page}&sort=updated`;
    const data = await fetchJson(url);
    all.push(...data);
    if (data.length < perPage) break;
    page++;
  }
  return all;
}

function safeThumbnail(fullName) {
  // Use GitHub Open Graph image as a quick thumbnail
  return `https://opengraph.githubassets.com/1/${fullName}`;
}

function excerptMarkdown(md, maxLen = 1200) {
  if (!md) return '';
  // remove images and long code blocks
  let t = md.replace(/!\[.*?\]\(.*?\)/g, '');
  t = t.replace(/```[\s\S]*?```/g, '');
  t = t.replace(/#.+/g, ''); // remove headings roughly
  t = t.replace(/\[(.*?)\]\(.*?\)/g, '$1'); // collapse links to text
  t = t.replace(/\r\n/g, '\n');
  t = t.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 3) + '...';
}

async function getRepoReadme(fullName) {
  try {
    // request raw content
    const url = `https://api.github.com/repos/${fullName}/readme`;
    const raw = await fetchRaw(url, { Accept: 'application/vnd.github.v3.raw' });
    return raw;
  } catch (e) {
    return null;
  }
}

async function getContributors(fullName) {
  try {
    const url = `https://api.github.com/repos/${fullName}/contributors?per_page=10`;
    const data = await fetchJson(url);
    return data.map(c => ({ login: c.login, avatar: c.avatar_url, url: c.html_url, contributions: c.contributions }));
  } catch (e) {
    return [];
  }
}

(async () => {
  try {
    console.log('Listing repos for', username);
    const repos = await listRepos(username);
    console.log(`Found ${repos.length} repos. Fetching details (this may take a few seconds)...`);

    const projects = [];
    for (const r of repos) {
      const full = r.full_name; // owner/repo
      const repoObj = {
        name: r.name,
        repo: r.html_url,
        desc: r.description || '',
        tags: r.topics && r.topics.length ? r.topics : [],
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        featured: false,
        updated_at: r.updated_at,
        created_at: r.created_at,
        language: r.language || '',
        license: r.license ? (r.license.spdx_id || r.license.name) : '',
        thumbnail: safeThumbnail(full),
        screenshots: [], // placeholder — you can add local URLs
        size: r.size || 0,
        open_issues_count: r.open_issues_count || 0,
        default_branch: r.default_branch || 'main'
      };

      // Try to fetch README excerpt (best-effort)
      try {
        const readme = await getRepoReadme(full);
        if (readme) {
          repoObj.readme_excerpt = excerptMarkdown(readme, 1400);
        } else {
          repoObj.readme_excerpt = '';
        }
      } catch (e) {
        repoObj.readme_excerpt = '';
      }

      // Contributors (top)
      try {
        repoObj.contributors = await getContributors(full);
      } catch (e) {
        repoObj.contributors = [];
      }

      // Add topics - fallback to empty
      try {
        // topics are available in repo.topics if `application/vnd.github.mercy-preview+json` accepted,
        // but many endpoints now include topics if accept header set at top. We'll trust r.topics already.
      } catch {}

      projects.push(repoObj);
      process.stdout.write('.');
    }

    // mark top 3 by stars as featured
    projects.sort((a,b) => (b.stars||0)-(a.stars||0));
    projects.slice(0,3).forEach(p => p.featured = true);

    const out = { generated_at: new Date().toISOString(), projects };
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
    console.log('\nWritten', outFile, 'with', projects.length, 'projects.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();