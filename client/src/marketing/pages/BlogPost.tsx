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
        <h1 className="text-3xl font-semibold text-white">Post not found</h1>
        <p className="mt-3 text-slate-400">
          That Launch Diary entry doesn't exist (yet).
        </p>
        <Link
          href="/blog"
          className="mt-6 inline-block text-violet-300 hover:underline"
        >
          ← Back to all posts
        </Link>
      </div>
    );
  }

  return <ArticleView article={article} />;
}
