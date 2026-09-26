import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default function ArticleMarkdown({ body }: { body: string }) {
  return (
    <div className="prose prose-zinc max-w-none break-words dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
