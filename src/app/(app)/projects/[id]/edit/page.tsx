import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProjectAction } from "@/app/actions/projects";
import { Loading, PageHeader } from "@/components/app/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { getDb } from "@/db";
import { requireActor } from "@/lib/session";
import { PROJECT_STATUS_LABEL, TERMINAL_STATUSES } from "@/lib/status";
import { getProjectDetail, listAgencyOptions, listUserOptions } from "@/server/queries";

export const metadata: Metadata = { title: "案件を編集 | tour-ops" };

export default function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  return (
    <Suspense fallback={<Loading />}>
      <EditProject params={params} />
    </Suspense>
  );
}

async function EditProject({ params }: { params: PageProps<"/projects/[id]/edit">["params"] }) {
  await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const project = await getProjectDetail(db, id);
  if (!project) notFound();
  const [agencies, users] = await Promise.all([listAgencyOptions(db, project.agencyId), listUserOptions(db)]);

  return (
    <>
      <PageHeader title="案件を編集" description={`${project.code} ${project.title}`} />
      {TERMINAL_STATUSES.includes(project.status) ? (
        <p className="rounded-lg border p-4 text-sm">
          「{PROJECT_STATUS_LABEL[project.status]}」の案件は編集できません。{" "}
          <Link href={`/projects/${id}`} className="underline">
            案件詳細に戻る
          </Link>
        </p>
      ) : (
        <ProjectForm
          action={updateProjectAction.bind(null, id)}
          defaults={project}
          agencies={agencies}
          users={users.filter((u) => u.active || u.id === project.ownerUserId)}
          cancelHref={`/projects/${id}`}
          submitLabel="保存する"
        />
      )}
    </>
  );
}
