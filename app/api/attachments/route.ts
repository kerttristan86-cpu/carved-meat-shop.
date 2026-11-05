import { authentication } from "../../../lib/auth";
import { database } from "../../../lib/db";
import {
  attachmentLimit,
  prepareAttachment,
  storeAttachment,
} from "../../../lib/attachments";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const session = await (
    await authentication()
  ).api.getSession({ headers: req.headers });
  if (!session)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (
    req.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin
  )
    return Response.json({ error: "Origin rejected" }, { status: 403 });
  try {
    const limit = attachmentLimit(),
      megabytes = limit / 1000000;
    if (Number(req.headers.get("content-length") || 0) > limit + 500000)
      throw new Error(`Attachment limit is ${megabytes} MB`);
    const form = await req.formData(),
      file = form.get("file"),
      documentId = form.get("documentId");
    if (
      !(file instanceof File) ||
      typeof documentId !== "string" ||
      file.size > limit
    )
      throw new Error(`Choose a PDF, PNG or JPEG up to ${megabytes} MB`);
    const data = Buffer.from(await file.arrayBuffer());
    const mime =
      data.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : data
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : data[0] === 255 && data[1] === 216 && data[2] === 255
            ? "image/jpeg"
            : null;
    if (!mime) throw new Error("Only PDF, PNG and JPEG are supported");
    const db = await database();
    if (
      !(
        await db.query(
          "SELECT id FROM documents WHERE id=$1 AND kind='expense'",
          [documentId],
        )
      ).rows.length
    )
      throw new Error("Expense not found");
    const id = randomUUID();
    await prepareAttachment(id, data);
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO attachments(id,document_id,name,mime) VALUES($1,$2,$3,$4)",
        [id, documentId, file.name.slice(0, 150), mime],
      );
      await storeAttachment(tx, id, data);
      await tx.query("INSERT INTO audit VALUES($1,now(),$2,$3,$4)", [
        randomUUID(),
        session.user.id,
        "attachment",
        JSON.stringify({ documentId, id, name: file.name.slice(0, 150) }),
      ]);
    });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
