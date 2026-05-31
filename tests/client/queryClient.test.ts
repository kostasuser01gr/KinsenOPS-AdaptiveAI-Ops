import { describe, it, expect } from "vitest";
import { queryClient } from "@/lib/queryClient";

describe("QueryClient configuration", () => {
  it("staleTime is 30 seconds (not Infinity)", () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.staleTime).toBe(30 * 1000);
  });

  it("refetchOnWindowFocus is enabled", () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.refetchOnWindowFocus).toBe(true);
  });

  it("retry is 2 (not false)", () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.retry).toBe(2);
  });

  it("gcTime is 5 minutes", () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.gcTime).toBe(5 * 60 * 1000);
  });
});
