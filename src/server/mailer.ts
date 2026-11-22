// メール送信。Resend の API キーがあれば Resend で送り、なければ送らずにログへ出す(開発用)
// デモ公開中は DEMO_MAIL_TO を設定し、宛先をすべてその1か所に差し替える(実在の宛先へは送らない)
import { Resend } from "resend";

export type MailAttachment = { filename: string; content: Buffer };
export type MailMessage = { to: string; subject: string; text: string; attachments?: MailAttachment[] };
export type MailResult = { id: string | null; deliveredTo: string; redirected: boolean; transport: "resend" | "log" };

export interface Mailer {
  send(message: MailMessage): Promise<MailResult>;
}

// 宛先の差し替え(デモ用)。本来の宛先は件名と本文に残す
export function applyDemoRedirect(message: MailMessage, demoTo: string | undefined): MailMessage & { redirected: boolean } {
  if (!demoTo) return { ...message, redirected: false };
  return {
    ...message,
    to: demoTo,
    subject: `[デモ] ${message.subject}`,
    text: `※ デモのため、本来の宛先(${message.to})ではなくこのアドレスに送っています。\n\n${message.text}`,
    redirected: true,
  };
}

export function createMailer(env: Record<string, string | undefined> = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY;
  const from = env.MAIL_FROM ?? "tour-ops <onboarding@resend.dev>";
  const demoTo = env.DEMO_MAIL_TO || undefined;

  return {
    async send(original) {
      const message = applyDemoRedirect(original, demoTo);
      if (!apiKey) {
        console.info(
          JSON.stringify({
            level: "info",
            msg: "mail (not sent: RESEND_API_KEY is not set)",
            to: message.to,
            subject: message.subject,
            attachments: message.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`),
          }),
        );
        return { id: null, deliveredTo: message.to, redirected: message.redirected, transport: "log" };
      }
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      });
      if (error) throw new Error(`メールを送れませんでした: ${error.message}`);
      return { id: data?.id ?? null, deliveredTo: message.to, redirected: message.redirected, transport: "resend" };
    },
  };
}
