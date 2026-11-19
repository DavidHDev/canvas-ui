import Link from "next/link";
import { ArrowRight } from "@/components/icons";

export interface LinkCard {
  href: string;
  title: string;
  description: string;
}

export function LinkCards({ items }: { items: LinkCard[] }) {
  return (
    <div className="not-typeset grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group frame block min-w-0 transition-[background-color,transform] duration-150 ease-out hover:bg-muted/70 active:scale-[0.99]"
        >
          <span className="frame-inset flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors duration-150 ease-out group-hover:bg-muted/70">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium tracking-tight text-foreground">
                {item.title}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                {item.description}
              </span>
            </span>
            <ArrowRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
            />
          </span>
        </Link>
      ))}
    </div>
  );
}
