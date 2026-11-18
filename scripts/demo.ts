import "./env";
import { database } from "../lib/db";
import { execute } from "../lib/shop";
async function main() {
  if (!process.env.DATABASE_DIR?.replaceAll("\\", "/").endsWith("/demo"))
    throw new Error(
      "Demo seed requires DATABASE_DIR=./data/demo. It never seeds production.",
    );
  const db = await database();
  const run = (a: string, d: any, k: string) =>
    execute(db, a, d, "demo-" + k, "demo-seed");
  const entries = [
    ["P001", "Pork shoulder", "Pork", "219", "239"],
    ["P002", "Pork belly", "Pork", "289", "309"],
    ["C001", "Chicken whole", "Chicken", "175", "189"],
    ["B001", "Beef brisket", "Beef", "359", "389"],
    ["F001", "Frozen hotdog", "Frozen goods", "140", "155"],
  ];
  for (const [code, name, category, bulk, retail] of entries) {
    const p = await run(
      "product",
      {
        code,
        name,
        category,
        unit: "kg",
        retail,
        bulk,
        box: bulk,
        lowStock: "10",
      },
      code,
    );
    await run(
      "adjust",
      {
        productId: p.id,
        locationId: "storage",
        quantity: "100",
        cost: "120",
        reason: "DEMO opening inventory",
        kind: "opening",
      },
      code + "-stock",
    );
    await run(
      "transfer",
      {
        productId: p.id,
        from: "storage",
        to: "freezer",
        quantity: "25",
        reason: "DEMO retail replenishment",
      },
      code + "-transfer",
    );
  }
  await run(
    "product",
    {
      code: "S001",
      name: "Grinding charge",
      category: "Services",
      unit: "service",
      serviceUnit: "portion",
      retail: "10",
    },
    "service",
  );
  await run(
    "party",
    { name: "DEMO supplier", kind: "supplier", contact: "Sample record" },
    "supplier",
  );
  await run("party", { name: "DEMO customer", kind: "customer" }, "customer");
  console.log("Separate DEMO database seeded; prices are fixtures only.");
  await db.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
