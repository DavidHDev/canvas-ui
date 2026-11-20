import { cn } from "@/lib/utils";

export interface ApiProp {
  name: string;
  description: string;
  type: string;
  defaultValue?: string;
}

const HEADER_CELL =
  "px-4 pt-1.5 pb-2.5 text-[13px] leading-5 font-medium text-muted-foreground";

export function ApiReference({ props }: { props: ApiProp[] }) {
  const lastRow = props.length - 1;

  const bodyCell = (row: number, column: 0 | 1 | 2) =>
    cn(
      "bg-background px-4 py-3.5 align-top",
      row !== lastRow && "border-b border-b-border-subtle",
      row === 0 && column === 0 && "rounded-tl-control",
      row === 0 && column === 2 && "rounded-tr-control",
      row === lastRow && column === 0 && "rounded-bl-control",
      row === lastRow && column === 2 && "rounded-br-control",
    );

  return (
    <div className="frame">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={HEADER_CELL}>
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
