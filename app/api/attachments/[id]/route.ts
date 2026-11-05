import { authentication } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { readAttachment } from "../../../../lib/attachments";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await (await authentication()).api.getSession({ headers: req.headers }))
  )
    return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  if (!/^[\da-f-]{36}$/.test(id))
    return new Response("Not found", { status: 404 });
  const db = await database();
  const attachment = (
    await db.query("SELECT * FROM attachments WHERE id=$1", [id])
  ).rows[0] as { name: string; mime: string } | undefined;
  if (!attachment) return new Response("Not found", { status: 404 });
  try {
    return new Response(new Uint8Array(await readAttachment(db, id)), {
      headers: {
        "Content-Type": attachment.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Attachment unavailable; check restored file archive", {
      status: 404,
    });
  }
}
