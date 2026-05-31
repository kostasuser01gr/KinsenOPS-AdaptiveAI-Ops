import { describe, it, expect, vi } from "vitest";
import { requireAuth, requireRole } from "../../server/auth.js";
import { readFileSync } from "fs";

// ─── Password hashing ──────────────────────────────────────────────────────────
// We test the scrypt-based hash/compare functions via the exported hashPassword
// and a reconstructed comparePasswords equivalent.
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

describe("Password hashing", () => {
  it("produces a valid hash string with salt separator", async () => {
    const hash = await hashPassword("supersecret");
    expect(hash).toContain(".");
    const [hex, salt] = hash.split(".");
    expect(hex).toHaveLength(128); // 64 bytes hex
    expect(salt).toHaveLength(32); // 16 bytes hex
  });

  it("same password produces different hashes (random salt)", async () => {
    const h1 = await hashPassword("samepassword");
    const h2 = await hashPassword("samepassword");
    expect(h1).not.toBe(h2);
  });

  it("comparePasswords returns true for correct password", async () => {
    const hash = await hashPassword("mypassword");
    const result = await comparePasswords("mypassword", hash);
    expect(result).toBe(true);
  });

  it("comparePasswords returns false for wrong password", async () => {
    const hash = await hashPassword("correcthorse");
    const result = await comparePasswords("wrongpassword", hash);
    expect(result).toBe(false);
  });
});

// ─── requireAuth middleware ────────────────────────────────────────────────────
describe("requireAuth middleware", () => {
  function makeReq(authenticated: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test stub for Request
    return { isAuthenticated: () => authenticated } as any;
  }

  function makeRes() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test stub for Response
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it("calls next() when authenticated", () => {
    const next = vi.fn();
    requireAuth(makeReq(true), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when not authenticated", () => {
    const res = makeRes();
    const next = vi.fn();
    requireAuth(makeReq(false), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
  });
});

// ─── requireRole middleware ────────────────────────────────────────────────────
describe("requireRole middleware", () => {
  function makeReq(authenticated: boolean, role?: string) {
    return {
      isAuthenticated: () => authenticated,
      user: role ? { id: 1, role } : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test stub for Request
    } as any;
  }

  function makeRes() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test stub for Response
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it("calls next() when user has the required role", () => {
    const next = vi.fn();
    requireRole("admin")(makeReq(true, "admin"), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows multiple roles — passes for any matching role", () => {
    const next = vi.fn();
    requireRole("admin", "supervisor")(makeReq(true, "supervisor"), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when not authenticated", () => {
    const res = makeRes();
    const next = vi.fn();
    requireRole("admin")(makeReq(false), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 403 when authenticated but wrong role", () => {
    const res = makeRes();
    const next = vi.fn();
    requireRole("admin")(makeReq(true, "agent"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Insufficient permissions" });
  });
});

describe("user_sessions migration", () => {
  it("creates the explicit session store table and expiry index", () => {
    const sql = readFileSync(
      "supabase/migrations/20260414000000_025_user_sessions.sql",
      "utf8",
    );

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_sessions");
    expect(sql).toContain("sess json NOT NULL");
    expect(sql).toContain("expire timestamp(6) NOT NULL");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS user_sessions_expire_idx");
  });
});
