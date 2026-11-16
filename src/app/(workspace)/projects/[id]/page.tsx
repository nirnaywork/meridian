import { ProjectDetail } from "@/components/project-detail";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ProjectDetail id={(await params).id} />;
}
