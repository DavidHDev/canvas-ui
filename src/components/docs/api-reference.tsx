import { cn } from "@/lib/utils";

export interface ApiProp {
  /** Property name, rendered as code. */
  name: string;
  /** Short description shown under the name. */
  description: string;
  /** Type, rendered as a code chip. */
  type: string;
  /** Default value, rendered as a code chip. Omit for none. */
  defaultValue?: string;
}

const HEADER_CELL =
  "px-4 pt-1.5 pb-2.5 text-[13px] leading-5 font-medium text-muted-foreground";

export function ApiReference({ props }: { props: ApiProp[] }) {
  const lastRow = props.length - 1;

  // The body cells draw the dashed box themselves (edge borders, corner radii,
  // tint), so the column titles can sit outside it on the frame's gap while
  // staying in the same table and sharing its column widths.
  const bodyCell = (row: number, column: 0 | 1 | 2) =>
    cn(
      "border-dashed bg-muted/40 px-4 py-3.5 align-top",
      row === 0 && "border-t border-t-border/70",
      row === lastRow
        ? "border-b border-b-border/70"
        : "border-b border-b-border/50",
      column === 0 && "border-l border-l-border/70",
      column === 2 && "border-r border-r-border/70",
      row === 0 && column === 0 && "rounded-tl-lg",
      row === 0 && column === 2 && "rounded-tr-lg",
      row === lastRow && column === 0 && "rounded-bl-lg",
      row === lastRow && column === 2 && "rounded-br-lg",
    );

  return (
    <div className="rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background p-1">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {/* The transparent border matches the box's left edge below. */}
              <th className={cn(HEADER_CELL, "border-l border-transparent")}>
                Property
              </th>
              <th className={HEADER_CELL}>Type</th>
              <th className={HEADER_CELL}>Default</th>
            </tr>
          </thead>
          <tbody>
            {props.map((prop, index) => (
              <tr key={prop.name}>
                <td className={cn(bodyCell(index, 0), "min-w-56")}>
                  <code className="font-mono text-[13px] font-medium text-foreground">
                    {prop.name}
                  </code>
                  <p className="mt-1 max-w-md text-[13px] leading-5 text-muted-foreground">
                    {prop.description}
                  </p>
                </td>
                <td className={bodyCell(index, 1)}>
                  <code className="inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] whitespace-nowrap text-foreground/80">
                    {prop.type}
                  </code>
                </td>
                <td className={bodyCell(index, 2)}>
                  {prop.defaultValue !== undefined ? (
                    <code className="inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] whitespace-nowrap text-foreground/80">
                      {prop.defaultValue}
                    </code>
                  ) : (
                    <span aria-hidden className="text-muted-foreground/50">
                      &mdash;
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
