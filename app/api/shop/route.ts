import { authentication } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { execute, snapshot } from "../../../lib/shop";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function owner(req: Request) {
  return (await authentication()).api.getSession({ headers: req.headers });
}
export async function GET(req: Request) {
  try {
    if (!(await owner(req)))
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    const u = new URL(req.url);
    const key = u.searchParams.get("requestKey");
    if (key) {
      const r = await (
        await database()
      ).query("SELECT result FROM requests WHERE key=$1", [key]);
      return Response.json(
        {
          result:
            (r.rows[0] as { result: unknown } | undefined)?.result || null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      await snapshot(
        await database(),
        u.searchParams.get("from") || undefined,
        u.searchParams.get("to") || undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Database or owner setup unavailable. Check server configuration.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    const session = await owner(req);
    if (!session)
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    if (
      req.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin
    )
      return Response.json(
        { error: "Request origin rejected" },
        { status: 403 },
      );
    if (Number(req.headers.get("content-length") || 0) > 200000)
      throw new Error("Request too large");
    const body = await req.json();
    return Response.json(
      await execute(
        await database(),
        body.action,
        body.data,
        body.key,
        session.user.id,
      ),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to save";
    return Response.json(
      {
        error: message.includes("duplicate key")
          ? "This code or name already exists"
          : message.includes("foreign key")
            ? "Select an existing product, party and location"
            : message,
      },
      { status: 400 },
    );
  }
}
