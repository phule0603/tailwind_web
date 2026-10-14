import type { ProjectAnalysis } from "@/lib/pm/evm";
import type { Project, WbsItem } from "@/lib/pm/types";

export type TabId = "overview" | "wbs" | "schedule" | "evm";

export interface TabProps {
  project: Project;
  analysis: ProjectAnalysis;
  update: (fn: (p: Project) => Project, immediate?: boolean) => void;
  collapsed: Set<string>;
  toggleCollapsed: (id: string) => void;
  goTo: (tab: TabId) => void;
}

export interface VisibleRow {
  item: WbsItem;
  code: string;
  depth: number;
  leaf: boolean;
}

/** WBS rows in display order, without the descendants of collapsed items. */
export function visibleRows(project: Project, analysis: ProjectAnalysis, collapsed: Set<string>): VisibleRow[] {
  const { tree } = analysis.schedule;
  const out: VisibleRow[] = [];
  const hidden = new Set<string>();
  for (const item of project.wbs) {
    if (item.parentId && (hidden.has(item.parentId) || collapsed.has(item.parentId))) {
      hidden.add(item.id);
      continue;
    }
    out.push({ item, code: tree.code.get(item.id) ?? "", depth: tree.depth.get(item.id) ?? 0, leaf: tree.isLeaf(item.id) });
  }
  return out;
}
