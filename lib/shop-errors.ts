import { z } from "zod";
export function shopErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    if (
      error.issues.some(
        (issue) => "format" in issue && issue.format === "safeint",
      )
    )
      return "Enter a whole number for counts. Decimal weights belong in Weight (kg).";
    return "Some entries are invalid. Check the form values and try again.";
  }
  const message = error instanceof Error ? error.message : "Unable to save";
  if (message.includes("duplicate key"))
    return "This code or name already exists";
  if (message.includes("foreign key"))
    return "Select an existing product, party and location";
  return message;
}
