import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { RichDoc } from "@/lib/server/content-schemas";

/**
 * Renders structured rich-text (never raw HTML). Only paragraph / heading /
 * quote / bullet+numbered lists with bold+italic spans are supported.
 */
type Span = { text: string; bold?: boolean; italic?: boolean };

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => (
        <Fragment key={i}>
          <span className={cn(s.bold && "font-semibold", s.italic && "italic")}>{s.text}</span>
        </Fragment>
      ))}
    </>
  );
}

export function RichText({ doc }: { doc: RichDoc }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
      {doc.map((node, i) => {
        switch (node.type) {
          case "heading": {
            const cls =
              node.level === 1 ? "text-xl font-bold" : node.level === 2 ? "text-lg font-semibold" : "text-base font-semibold";
            return (
              <p key={i} className={cls}>
                <Spans spans={node.spans} />
              </p>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-brand pl-3 italic text-muted-foreground">
                <Spans spans={node.spans} />
              </blockquote>
            );
          case "bulletList":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {node.items.map((it, j) => (
                  <li key={j}><Spans spans={it.spans} /></li>
                ))}
              </ul>
            );
          case "numberedList":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {node.items.map((it, j) => (
                  <li key={j}><Spans spans={it.spans} /></li>
                ))}
              </ol>
            );
          case "paragraph":
          default:
            return (
              <p key={i}>
                <Spans spans={node.spans} />
              </p>
            );
        }
      })}
    </div>
  );
}
