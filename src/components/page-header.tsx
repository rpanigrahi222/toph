import { SearchBox } from "@/components/search-box";

export function PageHeader({
  title,
  subtitle,
  search = true,
  actions,
}: {
  title: string;
  subtitle?: string;
  search?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 lg:mb-5">
      <div>
        <h1 className="text-[19px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {search ? <SearchBox /> : null}
      </div>
    </div>
  );
}
