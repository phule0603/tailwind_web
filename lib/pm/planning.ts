import type { ProjectAnalysis } from "./evm";
import type { Project } from "./types";

/*
 * The planning workflow (quy trình lập kế hoạch). Each step is "done" when the
 * project data satisfies it, so the checklist always reflects the real state.
 */

export type StepId = "charter" | "wbs" | "budget" | "schedule" | "baseline" | "tracking";

export interface PlanningStep {
  id: StepId;
  title: string;
  description: string;
  done: boolean;
  /** what is still missing, when not done */
  hint: string | null;
  /** workspace tab where the step is performed */
  tab: "overview" | "wbs" | "schedule" | "evm";
}

export function planningSteps(project: Project, a: ProjectAnalysis): PlanningStep[] {
  const { tree } = a.schedule;
  const leaves = project.wbs.filter((i) => tree.isLeaf(i.id));
  const summaries = project.wbs.length - leaves.length;
  const unpriced = leaves.filter((l) => l.quantity * l.unitPrice <= 0 && l.duration > 0);
  // every work package but the first ones needs a predecessor or a start constraint
  const unlinked = leaves.filter((l) => l.predecessors.length === 0 && !l.startNoEarlierThan);
  const charterMissing = [
    !project.name.trim() && "tên dự án",
    !project.client.trim() && "chủ đầu tư",
    !project.manager.trim() && "giám đốc dự án",
  ].filter(Boolean);

  return [
    {
      id: "charter",
      title: "Khởi tạo dự án",
      description: "Thông tin dự án, chủ đầu tư, ngày khởi công, lịch làm việc.",
      done: charterMissing.length === 0,
      hint: charterMissing.length ? `Thiếu ${charterMissing.join(", ")}` : null,
      tab: "overview",
    },
    {
      id: "wbs",
      title: "Lập cấu trúc phân chia công việc (WBS)",
      description: "Chia dự án thành các hạng mục và gói công việc.",
      done: summaries > 0 && leaves.length >= 2,
      hint:
        summaries > 0 && leaves.length >= 2
          ? null
          : "Cần ít nhất 1 hạng mục tổng hợp và 2 gói công việc",
      tab: "wbs",
    },
    {
      id: "budget",
      title: "Lập ngân sách",
      description: "Khối lượng × đơn giá cho từng gói công việc, dự phòng phí.",
      done: leaves.length > 0 && unpriced.length === 0,
      hint: leaves.length === 0 ? "Chưa có gói công việc" : unpriced.length ? `${unpriced.length} gói công việc chưa có chi phí` : null,
      tab: "wbs",
    },
    {
      id: "schedule",
      title: "Lập tiến độ",
      description: "Thời lượng, quan hệ trước–sau, đường găng (CPM).",
      done: leaves.length > 0 && unlinked.length <= 1 && a.schedule.cycle.length === 0,
      hint:
        a.schedule.cycle.length > 0
          ? "Có vòng lặp trong quan hệ công việc"
          : unlinked.length > 1
            ? `${unlinked.length - 1} công việc chưa có công việc trước hoặc ngày ràng buộc`
            : leaves.length === 0
              ? "Chưa có gói công việc"
              : null,
      tab: "schedule",
    },
    {
      id: "baseline",
      title: "Phê duyệt kế hoạch cơ sở (baseline)",
      description: "Chốt ngân sách và tiến độ làm cơ sở tính PV.",
      done: project.baseline !== null,
      hint: project.baseline ? null : "Chưa lưu baseline",
      tab: "schedule",
    },
    {
      id: "tracking",
      title: "Theo dõi thực hiện",
      description: "Cập nhật % hoàn thành, chi phí thực tế; phân tích PV – EV – AC.",
      done: project.history.length > 0,
      hint: project.history.length ? null : "Chưa chốt số liệu kỳ báo cáo nào",
      tab: "evm",
    },
  ];
}
