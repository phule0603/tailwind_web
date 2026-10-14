import type { Metadata } from "next";
import NewProjectForm from "@/components/NewProjectForm";

export const metadata: Metadata = { title: "Tạo dự án" };

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <NewProjectForm />
    </main>
  );
}
