import { Link, useRoute } from "wouter";
import { getDiaryPost } from "../content/launchContent";
import { ArticleView } from "../components/Article";

/** Renders a single Launch Diary post at /blog/:slug, or a not-found notice. */
export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";
  const article = getDiaryPost(slug);

  if (!article) {
    return (
      <div className="mx-auto max-w-xl px-6 py-32 text-center">
        <h1 className="font-serif text-3xl text-[var(--brand-text)]">
          Post not found
        </h1>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          That Launch Diary entry doesn't exist (yet).
        </p>
        <Link
          href="/blog"
          className="mt-6 inline-block text-[var(--brand-accent)] hover:underline"
        >
          ← Back to all posts
        </Link>
      </div>
    );
  }

  return <ArticleView article={article} />;
}
