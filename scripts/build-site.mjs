import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const articlesDir = path.join(root, "content", "articles");
const publicDir = path.join(root, "public");
const outDir = path.join(root, "docs");
const stylesPath = path.join(root, "src", "styles", "site.css");

const site = {
  title: "Mebug",
  description: "把日常、花草、片段和一点点心事慢慢记录下来。",
  author: "Mebug"
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

  const files = await walkArticles(articlesDir);
  const posts = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const { data, body } = parseFrontmatter(source);
    if (data.draft === true || data.status === "draft") continue;

    const isHtml = /\.html?$/i.test(file);
    const htmlArticle = isHtml ? htmlDocumentToArticle(body) : null;
    const fileDate = (await stat(file)).mtime;
    const title = data.title || htmlArticle?.title || titleFromFilename(file);
    const dateOnly = isDateOnly(data.date);
    const date = data.date ? parseDate(data.date) : fileDate;
    const slug = uniqueSlug(data.slug || slugify(path.basename(file, path.extname(file)) || title), posts);

    posts.push({
      title,
      slug,
      date,
      timestamp: date.getTime(),
      displayDate: formatDate(date, dateOnly),
      datetime: dateOnly ? formatDateKey(date) : date.toISOString(),
      yearKey: formatYearKey(date),
      yearLabel: formatYearLabel(date),
      tags: Array.isArray(data.tags) ? data.tags : [],
      summary: data.summary || htmlArticle?.summary || excerptFromMarkdown(body),
      cover: data.cover || "",
      readingTime: readingTimeFromMarkdown(htmlArticle?.text || body),
      html: htmlArticle?.html || markdownToHtml(body)
    });
  }

  return posts;
}

async function walkArticles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkArticles(full));
    } else if (entry.isFile() && /\.(?:md|mdx|html?)$/i.test(entry.name)) {
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
    if (entry.name === ".DS_Store") continue;

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
  const years = groupByYear(posts);
  const content = posts.length
    ? `<main class="home-content">
        <div class="year-stream" id="yearStream">${years.map((year, index) => renderYear(year, index)).join("")}${years.length > 2 ? `<button class="load-more" id="loadMore" type="button">加载更多年份</button>` : ""}</div>
      </main>
      <script>
        const hiddenYears = Array.from(document.querySelectorAll(".is-hidden-year"));
        const button = document.getElementById("loadMore");
        let nextYear = 0;
        function revealYear() {
          for (let i = 0; i < 1 && nextYear < hiddenYears.length; i += 1) {
            hiddenYears[nextYear].classList.remove("is-hidden-year");
            nextYear += 1;
          }
          if (button && nextYear >= hiddenYears.length) button.remove();
        }
        if (button) button.addEventListener("click", revealYear);
        if (button) {
          const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) revealYear();
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
        <div class="intro-kicker"><span class="intro-dot"></span><span>Daily Notes</span></div>
        <h1>${escapeHtml(site.title)}</h1>
        <p>${escapeHtml(site.description)}</p>
        <div class="intro-meta"><span>${posts.length} 篇记录</span><span>持续更新中</span></div>
      </section>
      ${content}
    `
  });
}

function renderFeaturedPost(post) {
  return `<section class="featured-post" aria-labelledby="featured-title">
    <div class="featured-copy">
      <p class="eyebrow">Latest note</p>
      <h2 id="featured-title"><a href="posts/${encodeURIComponent(post.slug)}/">${escapeHtml(post.title)}</a></h2>
      <p class="featured-summary">${escapeHtml(post.summary)}</p>
      <div class="featured-meta"><time datetime="${escapeAttribute(post.datetime)}">${escapeHtml(post.displayDate)}</time><span>${escapeHtml(post.readingTime)}</span></div>
      ${renderTags(post.tags)}
      <a class="read-link" href="posts/${encodeURIComponent(post.slug)}/">阅读这篇 <span aria-hidden="true">↗</span></a>
    </div>
    <div class="featured-mark" aria-hidden="true"><span>01</span><i></i><em>NEW</em></div>
  </section>`;
}

function renderYear(year, index) {
  return `
    <section class="year-section ${index > 1 ? "is-hidden-year" : ""}" data-year="${escapeHtml(year.key)}">
      <div class="year-heading">
        <h2>${escapeHtml(year.label)}</h2>
        <span>${year.posts.length} 篇</span>
      </div>
      <div class="post-grid">
        ${year.posts.map(renderPostCard).join("")}
      </div>
    </section>
  `;
}

function renderPostCard(post) {
  return `
    <a class="post-card ${post.cover ? "has-cover" : ""}" href="posts/${encodeURIComponent(post.slug)}/">
      ${post.cover ? `<img class="post-cover" src="${escapeAttribute(assetUrl(post.cover, 0))}" alt="">` : ""}
      <div class="post-card-body">
        <div class="post-card-meta"><time class="post-date" datetime="${escapeAttribute(post.datetime)}">${escapeHtml(post.displayDate)}</time><span>${escapeHtml(post.readingTime)}</span></div>
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
            <p class="article-dek">${escapeHtml(post.summary)}</p>
            <div class="article-meta">
              <time datetime="${escapeAttribute(post.datetime)}">${escapeHtml(post.displayDate)}</time>
              <span aria-hidden="true">·</span>
              <span>${escapeHtml(post.readingTime)}</span>
            </div>
            ${renderTags(post.tags)}
            ${post.cover ? `<img class="article-cover" src="${escapeAttribute(assetUrl(post.cover, 2))}" alt="">` : ""}
          </header>
          <div class="article-content kleebug-article">
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
    <link rel="icon" type="image/png" href="${prefix}favicon.png">
    <link rel="apple-touch-icon" href="${prefix}favicon.png">
    <link rel="stylesheet" href="${prefix}assets/site.css">
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <nav class="nav" aria-label="主导航">
          <a class="brand" href="${prefix}">
            <img class="brand-logo" src="${prefix}brand/logo-mark.png" alt="">
            <span class="brand-name">${escapeHtml(site.title)}</span>
          </a>
          <div class="nav-links">
            <a href="${prefix}">文章</a>
          </div>
        </nav>
      </header>
      ${body}
      <footer class="site-footer">
        <span>© ${new Date().getFullYear()} ${escapeHtml(site.author)}. Built from Markdown / HTML.</span>
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
  source = source.replace(/^\uFEFF/, "");
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

function htmlDocumentToArticle(source) {
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    || source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
  const summary = source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]
    || source.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1];
  const bodyMatch = source.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i);
  const head = source.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i)?.[1] || "";
  const headAssets = [
    ...head.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi),
    ...head.matchAll(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi)
  ].map((match) => match[0]).join("\n");
  const html = `${headAssets}${bodyMatch ? bodyMatch[1] : source}`.trim();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

  return {
    title: title ? decodeHtmlText(title) : "",
    summary: summary ? decodeHtmlText(summary) : excerptFromText(text),
    html,
    text
  };
}

function decodeHtmlText(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function excerptFromText(text) {
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
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
  const lines = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let listSeparated = false;
  let images = [];
  let inCode = false;
  let code = [];
  let codeLang = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    const strongOnly = text.match(/^\*\*(.+?)\*\*$/);
    if (strongOnly) {
      html.push(`<h4>${inlineMarkdown(strongOnly[1])}</h4>`);
    } else {
      html.push(`<p>${inlineMarkdown(text)}</p>`);
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!list || !list.items.length) return;
    const hasContinuation = list.items.some((item) => item.continuation.length);

    if (hasContinuation) {
      list.items.forEach((item) => {
        if (!item.continuation.length) {
          html.push(`<p class="article-loose-item">${inlineMarkdown(item.text)}</p>`);
          return;
        }

        const continuation = renderListContinuation(item.continuation);
        html.push(`
          <section class="article-note">
            <h4>${inlineMarkdown(item.text)}</h4>
            <div class="article-note-body">${continuation}</div>
          </section>
        `);
      });
    } else {
      const items = list.items
        .map((item) => `<li${item.indent ? ` data-indent="${item.indent}"` : ""}>${inlineMarkdown(item.text)}</li>`)
        .join("");
      html.push(`<${list.type}>${items}</${list.type}>`);
    }
    list = null;
    listSeparated = false;
  };

  const flushImages = () => {
    if (!images.length) return;
    html.push(`<div class="photo-grid">${images.join("")}</div>`);
    images = [];
  };

  for (const line of lines) {
    const fence = line.match(/^(```|''')\s*(.*)$/);
    if (fence) {
      if (inCode) {
        html.push(`<pre><code${codeLang ? ` class="language-${escapeAttribute(codeLang)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
        inCode = false;
        code = [];
        codeLang = "";
      } else {
        flushParagraph();
        flushList();
        flushImages();
        inCode = true;
        codeLang = /^[A-Za-z0-9_-]+$/.test(fence[2].trim()) ? fence[2].trim() : "";
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      if (list) listSeparated = true;
      continue;
    }

    const heading = line.match(/^(#{1,5})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushImages();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushImages();
      html.push("<hr>");
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      flushImages();
      html.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    const continuation = line.match(/^\s+(.+)$/);
    if (continuation && list?.items.length && list.items.length === 1 && list.items[0].indent === 0) {
      list.items[list.items.length - 1].continuation.push(continuation[1].trim());
      listSeparated = false;
      continue;
    }

    const unordered = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushImages();
      pushListItem("ul", unordered[2], indentLevel(unordered[1]));
      continue;
    }

    const ordered = line.match(/^(\s*)(?:\d+[.)、]|[（(]\d+[）)])\s*(.+)$/);
    if (ordered) {
      flushParagraph();
      flushImages();
      pushListItem("ol", ordered[2], indentLevel(ordered[1]));
      continue;
    }

    const image = line.trim().match(/^[!！]\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      images.push(`<figure><img src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1])}"></figure>`);
      continue;
    }

    flushList();
    flushImages();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushImages();

  return html.join("\n");

  function pushListItem(type, text, indent) {
    if (listSeparated) flushList();
    if (!list || list.type !== type) {
      flushList();
      list = { type, items: [] };
    }
    listSeparated = false;
    list.items.push({ text, indent, continuation: [] });
  }

  function renderListContinuation(items) {
    const ordered = items.every((item) => /^(?:\d+[.)、]|[（(]\d+[）)])\s*/.test(item));
    if (ordered) {
      const content = items
        .map((item) => item.replace(/^(?:\d+[.)、]|[（(]\d+[）)])\s*/, ""))
        .map((item) => `<li>${inlineMarkdown(item)}</li>`)
        .join("");
      return `<ol>${content}</ol>`;
    }
    return items.map((item) => `<p>${inlineMarkdown(item)}</p>`).join("");
  }
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/[!！]\[([^\]]*)\]\(([^)]+)\)/g, `<img src="$2" alt="$1">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(^|[^\w])'([^'\n]+)'(?=[^\w]|$)/g, "$1<code>$2</code>");
}

function indentLevel(spaces) {
  return Math.min(3, Math.floor(String(spaces || "").replace(/\t/g, "    ").length / 4));
}

function renderTags(tags) {
  if (!tags.length) return "";
  return `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function groupByYear(posts) {
  const groups = new Map();
  for (const post of posts) {
    if (!groups.has(post.yearKey)) {
      groups.set(post.yearKey, { key: post.yearKey, label: post.yearLabel, posts: [] });
    }
    groups.get(post.yearKey).posts.push(post);
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

function readingTimeFromMarkdown(markdown) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/[#>*_`-]/g, " ")
    .replace(/\s+/g, "")
    .trim();
  const minutes = Math.max(1, Math.ceil(text.length / 420));
  return `约 ${minutes} 分钟阅读`;
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
  if (isDateOnly(value)) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function formatDate(date, dateOnly = false) {
  const options = dateOnly
    ? {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    : {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      };
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatYearKey(date) {
  return String(date.getFullYear());
}

function formatYearLabel(date) {
  return `${date.getFullYear()}年`;
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
