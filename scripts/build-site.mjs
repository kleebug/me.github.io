import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const articlesDir = path.join(root, "content", "articles");
const publicDir = path.join(root, "public");
const outDir = path.join(root, "docs");
const stylesPath = path.join(root, "src", "styles", "site.css");

const site = {
  title: "MeMe",
  description: "日常生活、片段和一些慢慢留下来的记录。",
  author: "MeMe"
};

await build();

async function build() {
  const posts = (await loadPosts()).sort((a, b) => b.timestamp - a.timestamp);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "assets"), { recursive: true });
  await mkdir(path.join(outDir, "posts"), { recursive: true });

  await copyPublic();
  await copyFile(stylesPath, path.join(outDir, "assets", "site.css"));
  await writeFile(path.join(outDir, ".nojekyll"), "");
  await writeFile(path.join(outDir, "index.html"), renderHome(posts));

  for (const post of posts) {
    const postDir = path.join(outDir, "posts", post.slug);
    await mkdir(postDir, { recursive: true });
    await writeFile(path.join(postDir, "index.html"), renderPost(post, posts));
  }

  console.log(`Built ${posts.length} published post(s) into docs/`);
}

async function loadPosts() {
  if (!existsSync(articlesDir)) {
    await mkdir(articlesDir, { recursive: true });
    return [];
  }

  const files = await walkMarkdown(articlesDir);
  const posts = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const { data, body } = parseFrontmatter(source);
    if (data.draft === true || data.status === "draft") continue;

    const title = data.title || titleFromFilename(file);
    const date = parseDate(data.date);
    const slug = uniqueSlug(data.slug || slugify(path.basename(file, path.extname(file)) || title), posts);

    posts.push({
      title,
      slug,
      date,
      timestamp: date.getTime(),
      displayDate: formatDate(date),
      monthKey: formatMonthKey(date),
      monthLabel: formatMonthLabel(date),
      tags: Array.isArray(data.tags) ? data.tags : [],
      summary: data.summary || excerptFromMarkdown(body),
      cover: data.cover || "",
      html: markdownToHtml(body)
    });
  }

  return posts;
}

async function walkMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdown(full));
    } else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

async function copyPublic() {
  if (!existsSync(publicDir)) return;
  await copyDir(publicDir, outDir);
}

async function copyDir(from, to) {
  const entries = await readdir(from, { withFileTypes: true });
  await mkdir(to, { recursive: true });

  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dest);
    } else if (entry.isFile()) {
      await copyFile(src, dest);
    }
  }
}

function renderHome(posts) {
  const months = groupByMonth(posts);
  const content = posts.length
    ? `<main class="month-stream" id="monthStream">
        ${months.map((month, index) => renderMonth(month, index)).join("")}
        ${months.length > 2 ? `<button class="load-more" id="loadMore" type="button">加载更多月份</button>` : ""}
      </main>
      <script>
        const hiddenMonths = Array.from(document.querySelectorAll(".is-hidden-month"));
        const button = document.getElementById("loadMore");
        let nextMonth = 0;
        function revealMonth() {
          for (let i = 0; i < 1 && nextMonth < hiddenMonths.length; i += 1) {
            hiddenMonths[nextMonth].classList.remove("is-hidden-month");
            nextMonth += 1;
          }
          if (button && nextMonth >= hiddenMonths.length) button.remove();
        }
        if (button) button.addEventListener("click", revealMonth);
        if (button) {
          const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) revealMonth();
          }, { rootMargin: "240px" });
          observer.observe(button);
        }
      </script>`
    : `<main class="empty-state"><p>还没有发布文章。把 Markdown 放进 <code>content/articles/</code>，然后运行 <code>npm run publish</code>。</p></main>`;

  return page({
    title: site.title,
    description: site.description,
    body: `
      <section class="intro">
        <p class="eyebrow">Daily Notes</p>
        <h1>${escapeHtml(site.title)}</h1>
        <p>${escapeHtml(site.description)}</p>
      </section>
      ${content}
    `
  });
}

function renderMonth(month, index) {
  return `
    <section class="month-section ${index > 1 ? "is-hidden-month" : ""}" data-month="${escapeHtml(month.key)}">
      <div class="month-heading">
        <h2>${escapeHtml(month.label)}</h2>
        <span>${month.posts.length} 篇</span>
      </div>
      <div class="post-grid">
        ${month.posts.map(renderPostCard).join("")}
      </div>
    </section>
  `;
}

function renderPostCard(post) {
  return `
    <a class="post-card" href="posts/${encodeURIComponent(post.slug)}/">
      ${post.cover ? `<img class="post-cover" src="${escapeAttribute(assetUrl(post.cover, 0))}" alt="">` : ""}
      <div class="post-card-body">
        <time class="post-date" datetime="${post.date.toISOString()}">${escapeHtml(post.displayDate)}</time>
        <h3>${escapeHtml(post.title)}</h3>
        <p class="post-excerpt">${escapeHtml(post.summary)}</p>
        ${renderTags(post.tags)}
      </div>
    </a>
  `;
}

function renderPost(post, posts) {
  const index = posts.findIndex((item) => item.slug === post.slug);
  const newer = posts[index - 1];
  const older = posts[index + 1];

  return page({
    title: `${post.title} · ${site.title}`,
    description: post.summary,
    body: `
      <main class="article-shell">
        <article>
          <header class="article-header">
            <p class="eyebrow">Daily Note</p>
            <h1>${escapeHtml(post.title)}</h1>
            <div class="article-meta">
              <time datetime="${post.date.toISOString()}">${escapeHtml(post.displayDate)}</time>
            </div>
            ${renderTags(post.tags)}
            ${post.cover ? `<img class="article-cover" src="${escapeAttribute(assetUrl(post.cover, 2))}" alt="">` : ""}
          </header>
          <div class="article-content">
            ${rewriteContentUrls(post.html, 2)}
          </div>
        </article>
        <nav class="article-footer" aria-label="文章导航">
          <span>${older ? `<a href="../${encodeURIComponent(older.slug)}/">上一篇：${escapeHtml(older.title)}</a>` : ""}</span>
          <span>${newer ? `<a href="../${encodeURIComponent(newer.slug)}/">下一篇：${escapeHtml(newer.title)}</a>` : ""}</span>
        </nav>
      </main>
    `
  }, 2);
}

function page({ title, description, body }, depth = 0) {
  const prefix = depthPrefix(depth);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="stylesheet" href="${prefix}assets/site.css">
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <nav class="nav" aria-label="主导航">
          <a class="brand" href="${prefix}">
            <span class="brand-mark">M</span>
            <span>${escapeHtml(site.title)}</span>
          </a>
          <div class="nav-links">
            <a href="${prefix}">文章</a>
          </div>
        </nav>
      </header>
      ${body}
      <footer class="site-footer">
        <span>© ${new Date().getFullYear()} ${escapeHtml(site.author)}. Built from Markdown.</span>
      </footer>
    </div>
  </body>
</html>`;
}

function depthPrefix(depth) {
  return depth === 0 ? "./" : "../".repeat(depth);
}

function assetUrl(url, depth) {
  if (!url || /^(https?:)?\/\//.test(url) || url.startsWith("data:") || url.startsWith("#")) {
    return url;
  }
  const prefix = depthPrefix(depth);
  return url.startsWith("/") ? `${prefix}${url.slice(1)}` : url;
}

function rewriteContentUrls(html, depth) {
  return html.replace(/(src|href)="([^"]+)"/g, (_match, attr, url) => `${attr}="${escapeAttribute(assetUrl(url, depth))}"`);
}

function parseFrontmatter(source) {
  if (!source.startsWith("---")) return { data: {}, body: source.trim() };
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: source.trim() };

  const data = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    data[pair[1]] = parseValue(pair[2]);
  }

  return { data, body: source.slice(match[0].length).trim() };
}

function parseValue(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\[.*\]$/.test(trimmed)) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  return unquote(trimmed);
}

function unquote(value) {
  return value.replace(/^["']|["']$/g, "");
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let inCode = false;
  let code = [];
  let codeLang = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      if (inCode) {
        html.push(`<pre><code${codeLang ? ` class="language-${escapeAttribute(codeLang)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
        inCode = false;
        code = [];
        codeLang = "";
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = fence[1].trim();
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      html.push("<hr>");
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return html.join("\n");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img src="$2" alt="$1">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderTags(tags) {
  if (!tags.length) return "";
  return `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function groupByMonth(posts) {
  const groups = new Map();
  for (const post of posts) {
    if (!groups.has(post.monthKey)) {
      groups.set(post.monthKey, { key: post.monthKey, label: post.monthLabel, posts: [] });
    }
    groups.get(post.monthKey).posts.push(post);
  }
  return Array.from(groups.values());
}

function excerptFromMarkdown(markdown) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.match(/\[([^\]]+)\]/)?.[1] || "")
    .replace(/[#>*_`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function titleFromFilename(file) {
  return path.basename(file, path.extname(file)).replace(/[-_]+/g, " ");
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `post-${Date.now()}`;
}

function uniqueSlug(slug, posts) {
  let candidate = slug;
  let index = 2;
  while (posts.some((post) => post.slug === candidate)) {
    candidate = `${slug}-${index}`;
    index += 1;
  }
  return candidate;
}

function parseDate(value) {
  if (!value) return new Date();
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
