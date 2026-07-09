# MeMe 日常记录站

这是一个简单的 Markdown 静态文章站，适合发布日常生活记录到 GitHub Pages。

## 日常使用

发布文章：

1. 把 Markdown 文件放到 `content/articles/`
2. 在项目根目录运行：

```bash
npm run publish
```

草稿：

1. 把 Markdown 文件放到 `content/drafts/`
2. 不运行发布也可以；运行发布时草稿也不会出现在网站上

`content/drafts/` 默认不会提交到 Git，适合存放不公开的草稿。

本地预览：

```bash
npm run preview
```

然后打开 `http://localhost:4173`。

## 文章格式

每篇文章建议使用这样的开头：

```markdown
---
title: "周四傍晚散步"
date: 2026-07-09 18:30
tags: ["日常", "散步"]
summary: "今天傍晚风很舒服。"
cover: "/images/walk.jpg"
---

这里开始写正文。
```

字段说明：

- `title`：文章标题
- `date`：发布时间
- `tags`：标签
- `summary`：首页卡片摘要，可不填
- `cover`：封面图，可不填，图片放到 `public/images/`

## 发布到 GitHub Pages

推荐设置 GitHub Pages：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

之后每次发布流程就是：

```bash
npm run publish
git add .
git commit -m "publish posts"
git push
```
