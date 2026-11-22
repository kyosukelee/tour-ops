import { Badge } from "@/components/ui/badge";
import {
  ARRANGEMENT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  type ArrangementStatus,
  type ProjectStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const PROJECT_COLOR: Record<ProjectStatus, string> = {
  inquiry: "bg-slate-100 text-slate-700",
  quoting: "bg-amber-100 text-amber-800",
  quoted: "bg-amber-100 text-amber-800",
  arranging: "bg-blue-100 text-blue-800",
  arranged: "bg-indigo-100 text-indigo-800",
  operating: "bg-emerald-100 text-emerald-800",
  settling: "bg-teal-100 text-teal-800",
  completed: "bg-transparent text-muted-foreground border-border",
  lost: "bg-transparent text-red-700 border-red-200",
  cancelled: "bg-transparent text-red-700 border-red-200",
};

const ARRANGEMENT_COLOR: Record<ArrangementStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  requested: "bg-amber-100 text-amber-800",
  tentative: "bg-sky-100 text-sky-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-transparent text-red-700 border-red-200 line-through",
};

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", PROJECT_COLOR[status], className)}>
      {PROJECT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function ArrangementStatusBadge({ status, className }: { status: ArrangementStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", ARRANGEMENT_COLOR[status], className)}>
      {ARRANGEMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
