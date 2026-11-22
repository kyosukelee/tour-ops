import { Suspense } from "react";
import type { Metadata } from "next";
import { createProjectAction } from "@/app/actions/projects";
import { Loading, PageHeader } from "@/components/app/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { getDb } from "@/db";
import { requireActor } from "@/lib/session";
import { listAgencyOptions, listUserOptions } from "@/server/queries";

export const metadata: Metadata = { title: "案件を登録 | tour-ops" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="案件を登録" description="FAX・メールで届いた依頼の内容を入力します。案件番号は自動で付きます。" />
      <Suspense fallback={<Loading />}>
        <NewProject />
      </Suspense>
    </>
  );
}

async function NewProject() {
  await requireActor();
  const db = getDb();
  const [agencies, users] = await Promise.all([listAgencyOptions(db), listUserOptions(db)]);
  return (
    <ProjectForm
      action={createProjectAction}
      defaults={{}}
      agencies={agencies}
      users={users.filter((u) => u.active)}
      cancelHref="/projects"
      submitLabel="登録する"
    />
  );
}
