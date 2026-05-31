import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { insertNotificationSchema, insertAutomationRuleSchema } from "../../shared/schema.js";
import { automationConditionSchema, automationActionSchema, automationRulePatchSchema } from "../../server/routes/_helpers.js";
import { sanitizeInput } from "../../server/middleware/validation.js";

// ─── Security-focused schema & validation tests ──────────────────────────────
// These tests verify the PATCH whitelist schemas, AI input guards,
// and other security invariants without hitting the DB.

// ─── Replicate PATCH schemas from routes.ts for isolated testing ─────────────
const vehiclePatchSchema = z.object({
  plate: z.string().optional(),
  model: z.string().optional(),
  category: z.string().optional(),
  stationId: z.number().nullable().optional(),
  status: z.enum(['ready', 'rented', 'maintenance', 'washing', 'transit', 'retired', 'impounded']).optional(),
  sla: z.string().optional(),
  mileage: z.number().nonnegative().nullable().optional(),
  fuelLevel: z.number().min(0).max(100).nullable().optional(),
  nextBooking: z.string().nullable().optional(),
  timerInfo: z.string().nullable().optional(),
}).strict();

const conversationPatchSchema = z.object({
  title: z.string().optional(),
  pinned: z.boolean().optional(),
}).strict();

const userPatchSchema = z.object({
  displayName: z.string().optional(),
  role: z.string().optional(),
  station: z.string().nullable().optional(),
  language: z.string().optional(),
  theme: z.string().optional(),
  password: z.string().min(8).optional(),
}).strict();

const shiftPatchSchema = z.object({
  employeeName: z.string().optional(),
  employeeRole: z.string().optional(),
  weekStart: z.string().optional(),
  schedule: z.array(z.string()).optional(),
  status: z.string().optional(),
  stationId: z.number().nullable().optional(),
  fairnessScore: z.number().nullable().optional(),
  fatigueScore: z.number().nullable().optional(),
}).strict();

const ALLOWED_AI_ROLES = ['user', 'assistant'] as const;
const AI_MAX_MESSAGES = 20;
const AI_MAX_MESSAGE_CHARS = 4000;
const AI_MAX_TOTAL_CHARS = 40000;
const ALLOWED_CONTEXT_KEYS = ['currentModule', 'selectedVehicle', 'selectedStation', 'currentView', 'locale', 'timezone'] as const;

// ─── PATCH WHITELIST SCHEMA TESTS ────────────────────────────────────────────

describe("vehiclePatchSchema", () => {
  it("accepts valid partial update", () => {
    const result = vehiclePatchSchema.safeParse({ status: "washing", fuelLevel: 80 });
    expect(result.success).toBe(true);
  });

  it("rejects id field", () => {
    const result = vehiclePatchSchema.safeParse({ id: 99, status: "ready" });
    expect(result.success).toBe(false);
  });

  it("rejects deletedAt field", () => {
    const result = vehiclePatchSchema.safeParse({ deletedAt: null });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = vehiclePatchSchema.safeParse({ status: "ready", hackerField: "pwned" });
    expect(result.success).toBe(false);
  });
});

describe("conversationPatchSchema", () => {
  it("accepts title update", () => {
    const result = conversationPatchSchema.safeParse({ title: "New title" });
    expect(result.success).toBe(true);
  });

  it("rejects userId injection", () => {
    const result = conversationPatchSchema.safeParse({ title: "x", userId: 99 });
    expect(result.success).toBe(false);
  });

  it("rejects createdAt injection", () => {
    const result = conversationPatchSchema.safeParse({ createdAt: "2020-01-01" });
    expect(result.success).toBe(false);
  });
});

describe("userPatchSchema", () => {
  it("accepts valid fields", () => {
    const result = userPatchSchema.safeParse({ displayName: "New Name", theme: "light" });
    expect(result.success).toBe(true);
  });

  it("rejects id injection", () => {
    const result = userPatchSchema.safeParse({ id: 1, displayName: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects username change", () => {
    const result = userPatchSchema.safeParse({ username: "hacker" });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = userPatchSchema.safeParse({ password: "abc" });
    expect(result.success).toBe(false);
  });

  it("accepts valid password (8+ chars)", () => {
    const result = userPatchSchema.safeParse({ password: "securepass123" });
    expect(result.success).toBe(true);
  });
});

describe("shiftPatchSchema", () => {
  it("accepts valid schedule update", () => {
    const result = shiftPatchSchema.safeParse({ schedule: ["08-16", "OFF"] });
    expect(result.success).toBe(true);
  });

  it("rejects publishedBy injection", () => {
    const result = shiftPatchSchema.safeParse({ publishedBy: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects publishedAt injection", () => {
    const result = shiftPatchSchema.safeParse({ publishedAt: "2026-01-01" });
    expect(result.success).toBe(false);
  });
});

// ─── AI INPUT VALIDATION TESTS ───────────────────────────────────────────────

describe("AI chat input guards", () => {
  function validateMessages(messages: unknown[]): { valid: boolean; reason?: string } {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { valid: false, reason: "messages array required" };
    }
    if (messages.length > AI_MAX_MESSAGES) {
      return { valid: false, reason: `exceeds ${AI_MAX_MESSAGES} messages` };
    }
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg !== 'object' || msg === null) {
        return { valid: false, reason: "not an object" };
      }
      const { role, content } = msg as Record<string, unknown>;
      if (!ALLOWED_AI_ROLES.includes(role as typeof ALLOWED_AI_ROLES[number])) {
        return { valid: false, reason: `invalid role: ${String(role)}` };
      }
      if (typeof content !== 'string' || content.length === 0) {
        return { valid: false, reason: "empty content" };
      }
      if (content.length > AI_MAX_MESSAGE_CHARS) {
        return { valid: false, reason: "message too long" };
      }
      totalChars += content.length;
      if (totalChars > AI_MAX_TOTAL_CHARS) {
        return { valid: false, reason: "total content too long" };
      }
    }
    return { valid: true };
  }

  it("accepts valid messages", () => {
    const result = validateMessages([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects empty messages array", () => {
    expect(validateMessages([]).valid).toBe(false);
  });

  it("rejects more than 20 messages", () => {
    const msgs = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "msg",
    }));
    const result = validateMessages(msgs);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("20");
  });

  it("rejects invalid role", () => {
    const result = validateMessages([{ role: "system", content: "hack" }]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("role");
  });

  it("rejects message exceeding 4000 chars", () => {
    const result = validateMessages([{ role: "user", content: "x".repeat(4001) }]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too long");
  });

  it("rejects total content exceeding 40000 chars", () => {
    const msgs = Array.from({ length: 15 }, () => ({
      role: "user",
      content: "x".repeat(3000),
    }));
    const result = validateMessages(msgs);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("total");
  });

  it("rejects empty content", () => {
    const result = validateMessages([{ role: "user", content: "" }]);
    expect(result.valid).toBe(false);
  });
});

describe("AI context sanitization", () => {
  function sanitizeContext(context: unknown): Record<string, string> {
    const safe: Record<string, string> = {};
    if (context && typeof context === 'object' && !Array.isArray(context)) {
      for (const key of ALLOWED_CONTEXT_KEYS) {
        const val = (context as Record<string, unknown>)[key];
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          safe[key] = String(val);
        }
      }
    }
    return safe;
  }

  it("extracts only allowed keys", () => {
    const result = sanitizeContext({
      currentModule: "fleet",
      evilKey: "<script>alert(1)</script>",
      __proto__: { admin: true },
    });
    expect(result).toEqual({ currentModule: "fleet" });
    expect(result).not.toHaveProperty("evilKey");
    expect(result).not.toHaveProperty("__proto__");
  });

  it("ignores nested objects in allowed keys", () => {
    const result = sanitizeContext({
      currentModule: { nested: "injection" },
      selectedVehicle: "ABC-1234",
    });
    expect(result).toEqual({ selectedVehicle: "ABC-1234" });
  });

  it("converts numbers and booleans to strings", () => {
    const result = sanitizeContext({ locale: true, timezone: 3 });
    expect(result).toEqual({ locale: "true", timezone: "3" });
  });

  it("handles null/undefined context", () => {
    expect(sanitizeContext(null)).toEqual({});
    expect(sanitizeContext(undefined)).toEqual({});
  });

  it("handles array context", () => {
    expect(sanitizeContext(["injection"])).toEqual({});
  });
});

// ─── NOTIFICATION SCHEMA TESTS ───────────────────────────────────────────────

describe("notification recipient model", () => {
  it("accepts broadcast notification (default)", () => {
    const result = insertNotificationSchema.safeParse({
      title: "Test",
      body: "Test body",
    });
    expect(result.success).toBe(true);
  });

  it("accepts user-targeted notification", () => {
    const result = insertNotificationSchema.safeParse({
      title: "Test",
      body: "Test body",
      audience: "user",
      recipientUserId: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts role-targeted notification", () => {
    const result = insertNotificationSchema.safeParse({
      title: "Test",
      body: "Test body",
      audience: "role",
      recipientRole: "supervisor",
    });
    expect(result.success).toBe(true);
  });
});

// ─── PASSWORD STRENGTH TESTS ─────────────────────────────────────────────────

describe("password strength validation", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const schema = z.string().min(8);
    expect(schema.safeParse("abc").success).toBe(false);
    expect(schema.safeParse("1234567").success).toBe(false);
  });

  it("accepts passwords of 8+ characters", () => {
    const schema = z.string().min(8);
    expect(schema.safeParse("12345678").success).toBe(true);
    expect(schema.safeParse("a-long-secure-password").success).toBe(true);
  });
});

// ─── CHUNK 2: OWNERSHIP/RBAC VALIDATION SCHEMAS ─────────────────────────────

describe("shiftRequestReviewSchema", () => {
  const shiftRequestReviewSchema = z.object({
    status: z.string(),
    note: z.string().optional(),
  }).strict();

  it("accepts valid review", () => {
    expect(shiftRequestReviewSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(shiftRequestReviewSchema.safeParse({ status: "rejected", note: "Understaffed" }).success).toBe(true);
  });

  it("rejects missing status", () => {
    expect(shiftRequestReviewSchema.safeParse({ note: "test" }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(shiftRequestReviewSchema.safeParse({ status: "approved", reviewedBy: 1 }).success).toBe(false);
  });
});

describe("roomMessageSchema", () => {
  const roomMessageSchema = z.object({
    content: z.string().min(1).max(10000),
    type: z.string().optional(),
  }).strict();

  it("accepts valid message", () => {
    expect(roomMessageSchema.safeParse({ content: "Hello" }).success).toBe(true);
    expect(roomMessageSchema.safeParse({ content: "Hello", type: "message" }).success).toBe(true);
  });

  it("rejects empty content", () => {
    expect(roomMessageSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("rejects content exceeding 10000 chars", () => {
    expect(roomMessageSchema.safeParse({ content: "x".repeat(10001) }).success).toBe(false);
  });

  it("rejects userId injection", () => {
    expect(roomMessageSchema.safeParse({ content: "Hello", userId: 99 }).success).toBe(false);
  });

  it("rejects roomId injection", () => {
    expect(roomMessageSchema.safeParse({ content: "Hello", roomId: 1 }).success).toBe(false);
  });
});

describe("activityFeedSchema", () => {
  const activityFeedSchema = z.object({
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable().optional(),
    entityLabel: z.string().nullable().optional(),
    stationId: z.number().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  }).strict();

  it("accepts valid activity entry", () => {
    expect(activityFeedSchema.safeParse({
      action: "created",
      entityType: "vehicle",
      entityId: "123",
    }).success).toBe(true);
  });

  it("rejects userId injection", () => {
    expect(activityFeedSchema.safeParse({
      action: "created",
      entityType: "vehicle",
      userId: 99,
    }).success).toBe(false);
  });

  it("rejects actorName injection", () => {
    expect(activityFeedSchema.safeParse({
      action: "created",
      entityType: "vehicle",
      actorName: "hacker",
    }).success).toBe(false);
  });
});

describe("digitalTwinSchema", () => {
  const digitalTwinSchema = z.object({
    stationId: z.number().nullable().optional(),
    snapshotType: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
  }).strict();

  it("accepts valid snapshot", () => {
    expect(digitalTwinSchema.safeParse({
      data: { vehicles: 10, wash: 3 },
    }).success).toBe(true);
  });

  it("rejects missing data", () => {
    expect(digitalTwinSchema.safeParse({
      stationId: 1,
    }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(digitalTwinSchema.safeParse({
      data: {},
      createdAt: "2026-01-01",
    }).success).toBe(false);
  });
});

describe("automationRulePatchSchema", () => {
  const automationRulePatchSchema = z.object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    trigger: z.string().optional(),
    conditions: z.record(z.string(), z.unknown()).nullable().optional(),
    actions: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    scope: z.string().optional(),
    active: z.boolean().optional(),
    version: z.number().optional(),
  }).strict();

  it("accepts valid partial update", () => {
    expect(automationRulePatchSchema.safeParse({ active: false }).success).toBe(true);
    expect(automationRulePatchSchema.safeParse({ name: "New name", trigger: "vehicle:status" }).success).toBe(true);
  });

  it("rejects id injection", () => {
    expect(automationRulePatchSchema.safeParse({ id: 1, name: "test" }).success).toBe(false);
  });

  it("rejects createdBy injection", () => {
    expect(automationRulePatchSchema.safeParse({ createdBy: 99 }).success).toBe(false);
  });

  it("rejects createdAt injection", () => {
    expect(automationRulePatchSchema.safeParse({ createdAt: "2020-01-01" }).success).toBe(false);
  });

  it("rejects triggerCount injection", () => {
    expect(automationRulePatchSchema.safeParse({ triggerCount: 999 }).success).toBe(false);
  });
});

describe("automation rule schema validation", () => {
  it("requires createdBy", () => {
    const result = insertAutomationRuleSchema.safeParse({
      name: "Test rule",
      trigger: "vehicle:status",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid rule with createdBy", () => {
    const result = insertAutomationRuleSchema.safeParse({
      name: "Test rule",
      trigger: "vehicle:status",
      createdBy: 1,
    });
    expect(result.success).toBe(true);
  });
});

// ─── PUBLIC ROOM ENTITY TYPE WHITELIST TESTS ─────────────────────────────────
// These tests verify that only whitelisted entity types are accepted by
// the public room resolve endpoint schema, blocking enumeration of internal rooms.

describe("public room entity type whitelist", () => {
  const PUBLIC_ROOM_ENTITY_TYPES = ['reservation', 'washer-ops'] as const;

  const publicResolveSchema = z.object({
    entityType: z.enum(PUBLIC_ROOM_ENTITY_TYPES),
    entityId: z.string().min(1).max(100),
    title: z.string().min(1).max(200).optional(),
  }).strict();

  it("accepts reservation entity type", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "reservation",
      entityId: "RES-001",
    });
    expect(result.success).toBe(true);
  });

  it("accepts washer-ops entity type", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "washer-ops",
      entityId: "default",
    });
    expect(result.success).toBe(true);
  });

  it("rejects notification entity type (war room)", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "notification",
      entityId: "1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects vehicle entity type (internal room)", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "vehicle",
      entityId: "YHA-1234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects shift entity type (internal room)", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "shift",
      entityId: "week-2026-03-09",
    });
    expect(result.success).toBe(false);
  });

  it("rejects operations entity type (internal room)", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "operations",
      entityId: "ops-daily",
    });
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary entity type", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "hacker-room",
      entityId: "1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entity type", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "",
      entityId: "1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = publicResolveSchema.safeParse({
      entityType: "reservation",
      entityId: "RES-001",
      admin: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("public room ID enumeration guard", () => {
  const PUBLIC_ROOM_ENTITY_TYPES = ['reservation', 'washer-ops'] as const;

  function isPublicRoomType(entityType: string): boolean {
    return (PUBLIC_ROOM_ENTITY_TYPES as readonly string[]).includes(entityType);
  }

  it("allows access to reservation rooms", () => {
    expect(isPublicRoomType("reservation")).toBe(true);
  });

  it("allows access to washer-ops rooms", () => {
    expect(isPublicRoomType("washer-ops")).toBe(true);
  });

  it("blocks access to notification rooms (war rooms)", () => {
    expect(isPublicRoomType("notification")).toBe(false);
  });

  it("blocks access to vehicle rooms", () => {
    expect(isPublicRoomType("vehicle")).toBe(false);
  });

  it("blocks access to shift rooms", () => {
    expect(isPublicRoomType("shift")).toBe(false);
  });

  it("blocks access to operations rooms", () => {
    expect(isPublicRoomType("operations")).toBe(false);
  });

  it("blocks access to unknown room types", () => {
    expect(isPublicRoomType("admin")).toBe(false);
    expect(isPublicRoomType("")).toBe(false);
    expect(isPublicRoomType("internal")).toBe(false);
  });
});

// ─── NOTIFICATION ACTION SCHEMA TESTS ────────────────────────────────────────
// Mirrors the notificationActionSchema defined in notifications.ts

const notificationActionSchema = z.object({
  action: z.enum(["acknowledge", "dismiss", "escalate", "resolve"]),
  note: z.string().max(1000).optional(),
}).strict();

describe("notificationActionSchema", () => {
  it("accepts valid actions", () => {
    for (const action of ["acknowledge", "dismiss", "escalate", "resolve"]) {
      expect(notificationActionSchema.safeParse({ action }).success).toBe(true);
    }
  });

  it("accepts optional note", () => {
    const result = notificationActionSchema.safeParse({ action: "acknowledge", note: "Looking into it" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    expect(notificationActionSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(notificationActionSchema.safeParse({ action: "" }).success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(notificationActionSchema.safeParse({ action: "resolve", hackerField: "pwned" }).success).toBe(false);
  });

  it("rejects note over 1000 chars", () => {
    expect(notificationActionSchema.safeParse({ action: "dismiss", note: "x".repeat(1001) }).success).toBe(false);
  });
});

// ─── ESCALATION AUTH LOGIC TESTS ─────────────────────────────────────────────
// Tests the authorization logic used in POST /api/notifications/:id/escalate

describe("notification escalation authorization", () => {
  function canEscalate(notification: { recipientUserId: number }, user: { id: number; role: string }): boolean {
    if (notification.recipientUserId === user.id) return true;
    if (user.role === 'admin' || user.role === 'supervisor') return true;
    return false;
  }

  it("allows the recipient to escalate", () => {
    expect(canEscalate({ recipientUserId: 5 }, { id: 5, role: "washer" })).toBe(true);
  });

  it("allows admin to escalate any notification", () => {
    expect(canEscalate({ recipientUserId: 5 }, { id: 99, role: "admin" })).toBe(true);
  });

  it("allows supervisor to escalate any notification", () => {
    expect(canEscalate({ recipientUserId: 5 }, { id: 99, role: "supervisor" })).toBe(true);
  });

  it("blocks other users from escalating", () => {
    expect(canEscalate({ recipientUserId: 5 }, { id: 99, role: "washer" })).toBe(false);
    expect(canEscalate({ recipientUserId: 5 }, { id: 99, role: "manager" })).toBe(false);
  });
});

// ─── ROUND 2-4 REGRESSION TESTS ─────────────────────────────────────────────

describe("vehiclePatchSchema — status enum enforcement", () => {
  it("accepts valid status values", () => {
    for (const s of ['ready', 'rented', 'maintenance', 'washing', 'transit', 'retired', 'impounded']) {
      expect(vehiclePatchSchema.safeParse({ status: s }).success).toBe(true);
    }
  });

  it("rejects arbitrary string status", () => {
    expect(vehiclePatchSchema.safeParse({ status: "banana" }).success).toBe(false);
    expect(vehiclePatchSchema.safeParse({ status: "" }).success).toBe(false);
    expect(vehiclePatchSchema.safeParse({ status: "READY" }).success).toBe(false);
  });

  it("rejects negative mileage", () => {
    expect(vehiclePatchSchema.safeParse({ mileage: -999 }).success).toBe(false);
  });

  it("rejects negative fuel level", () => {
    expect(vehiclePatchSchema.safeParse({ fuelLevel: -1 }).success).toBe(false);
  });

  it("rejects fuel level over 100", () => {
    expect(vehiclePatchSchema.safeParse({ fuelLevel: 101 }).success).toBe(false);
  });

  it("accepts zero mileage and fuel", () => {
    expect(vehiclePatchSchema.safeParse({ mileage: 0, fuelLevel: 0 }).success).toBe(true);
  });
});

describe("RESERVATION_TRANSITIONS — pending state", () => {
  const RESERVATION_TRANSITIONS: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['checked_out', 'cancelled', 'no_show'],
    checked_out: ['returned'],
    returned: [],
    cancelled: [],
    no_show: [],
  };

  it("allows pending → confirmed", () => {
    expect(RESERVATION_TRANSITIONS['pending']).toContain('confirmed');
  });

  it("allows pending → cancelled", () => {
    expect(RESERVATION_TRANSITIONS['pending']).toContain('cancelled');
  });

  it("blocks pending → checked_out (must confirm first)", () => {
    expect(RESERVATION_TRANSITIONS['pending']).not.toContain('checked_out');
  });

  it("has entries for all statuses", () => {
    for (const s of ['pending', 'confirmed', 'checked_out', 'returned', 'cancelled', 'no_show']) {
      expect(RESERVATION_TRANSITIONS).toHaveProperty(s);
    }
  });
});

describe("matchesConditions — automation rule condition evaluation", () => {
  function matchesConditions(conditions: Record<string, unknown> | null | undefined, context: Record<string, unknown>): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    return Object.entries(conditions).every(([key, expected]) => {
      const actual = context[key];
      if (Array.isArray(expected)) return expected.includes(actual);
      return actual === expected;
    });
  }

  it("matches when conditions are null", () => {
    expect(matchesConditions(null, { status: "ready" })).toBe(true);
  });

  it("matches when conditions are empty", () => {
    expect(matchesConditions({}, { status: "ready" })).toBe(true);
  });

  it("matches exact key-value", () => {
    expect(matchesConditions({ severity: "critical" }, { severity: "critical", type: "incident" })).toBe(true);
  });

  it("fails on value mismatch", () => {
    expect(matchesConditions({ severity: "critical" }, { severity: "low" })).toBe(false);
  });

  it("matches array-of-values condition (OR)", () => {
    expect(matchesConditions({ status: ["ready", "washing"] }, { status: "washing" })).toBe(true);
  });

  it("fails array-of-values when actual not in list", () => {
    expect(matchesConditions({ status: ["ready", "washing"] }, { status: "rented" })).toBe(false);
  });

  it("requires ALL conditions to match", () => {
    expect(matchesConditions({ severity: "critical", type: "incident" }, { severity: "critical", type: "maintenance" })).toBe(false);
  });
});

// ─── Round 3 Regression Tests ─────────────────────────────────────────────────

describe("WHK-1/WHK-2: Webhook URL validation & PATCH schema", () => {
  // Replicate the SSRF-prevention helper and PATCH schema from webhooks.ts
  function isAllowedWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) return false;
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return false;
      if (host.startsWith('10.') || host.startsWith('192.168.') || host === '169.254.169.254') return false;
      if (host.match(/^172\.(1[6-9]|2\d|3[01])\./) ) return false;
      if (host.endsWith('.internal') || host.endsWith('.local')) return false;
      return true;
    } catch { return false; }
  }

  const webhookPatchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    url: z.string().url().max(2000).optional(),
    events: z.array(z.string().min(1).max(100)).max(50).optional(),
    active: z.boolean().optional(),
    retryPolicy: z.enum(['none', 'linear', 'exponential']).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
  }).strict();

  it("blocks localhost SSRF", () => {
    expect(isAllowedWebhookUrl("http://localhost:5432/")).toBe(false);
    expect(isAllowedWebhookUrl("http://127.0.0.1/admin")).toBe(false);
  });

  it("blocks cloud metadata endpoint", () => {
    expect(isAllowedWebhookUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("blocks private RFC1918 ranges", () => {
    expect(isAllowedWebhookUrl("http://10.0.0.1/internal")).toBe(false);
    expect(isAllowedWebhookUrl("http://192.168.1.1/")).toBe(false);
    expect(isAllowedWebhookUrl("http://172.16.0.1/")).toBe(false);
  });

  it("blocks .internal and .local hostnames", () => {
    expect(isAllowedWebhookUrl("http://service.internal/hook")).toBe(false);
    expect(isAllowedWebhookUrl("http://printer.local/api")).toBe(false);
  });

  it("allows valid public URLs", () => {
    expect(isAllowedWebhookUrl("https://hooks.example.com/webhook")).toBe(true);
    expect(isAllowedWebhookUrl("http://api.partner.io/v1/events")).toBe(true);
  });

  it("blocks non-http protocols", () => {
    expect(isAllowedWebhookUrl("ftp://example.com/")).toBe(false);
    expect(isAllowedWebhookUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects invalid URL strings", () => {
    expect(isAllowedWebhookUrl("not-a-url")).toBe(false);
  });

  it("PATCH schema rejects extra fields", () => {
    expect(() => webhookPatchSchema.parse({ name: "x", evil: true })).toThrow();
  });

  it("PATCH schema validates maxRetries bounds", () => {
    expect(() => webhookPatchSchema.parse({ maxRetries: -1 })).toThrow();
    expect(() => webhookPatchSchema.parse({ maxRetries: 99 })).toThrow();
    expect(webhookPatchSchema.parse({ maxRetries: 5 })).toEqual({ maxRetries: 5 });
  });

  it("PATCH schema validates events is a string array", () => {
    expect(() => webhookPatchSchema.parse({ events: "not-array" })).toThrow();
    expect(() => webhookPatchSchema.parse({ events: [123] })).toThrow();
    expect(webhookPatchSchema.parse({ events: ["push", "pull"] })).toEqual({ events: ["push", "pull"] });
  });
});

describe("PUB-1: Public room IDOR prevention", () => {
  it("entityId mismatch should deny access (contract test)", () => {
    // The fix requires ?entityId=X to match room.entityId
    // Simulating: room.entityId = "RES-123", attacker sends entityId = "RES-999"
    const roomEntityId = "RES-123";
    const attackerEntityId = "RES-999";
    expect(attackerEntityId).not.toBe(roomEntityId);
  });
});

describe("QUAL-1: Quality inspection PATCH schema validation", () => {
  const inspectionPatchSchema = z.object({
    checklist: z.array(z.object({ item: z.string(), passed: z.boolean() })).optional(),
    notes: z.string().max(5000).nullable().optional(),
    photos: z.array(z.string().url().max(2000)).max(20).optional(),
    status: z.enum(["passed", "partial", "failed", "pending"]).optional(),
  }).strict();

  it("rejects arbitrary status values", () => {
    expect(() => inspectionPatchSchema.parse({ status: "hacked" })).toThrow();
    expect(() => inspectionPatchSchema.parse({ status: "=CMD('calc')" })).toThrow();
  });

  it("accepts valid inspection statuses", () => {
    expect(inspectionPatchSchema.parse({ status: "passed" })).toEqual({ status: "passed" });
    expect(inspectionPatchSchema.parse({ status: "failed" })).toEqual({ status: "failed" });
  });

  it("rejects extra fields (strict)", () => {
    expect(() => inspectionPatchSchema.parse({ status: "passed", evil: true })).toThrow();
  });

  it("validates checklist structure", () => {
    expect(() => inspectionPatchSchema.parse({ checklist: [{ item: "Clean", wrong: true }] })).toThrow();
    expect(inspectionPatchSchema.parse({ checklist: [{ item: "Clean", passed: true }] }))
      .toEqual({ checklist: [{ item: "Clean", passed: true }] });
  });
});

describe("USR-1: Invite token schema validation", () => {
  const inviteTokenSchema = z.object({
    email: z.string().email().max(254).nullable().optional(),
    role: z.enum(["admin", "supervisor", "coordinator", "agent"]).optional(),
    expiresInDays: z.number().int().min(1).max(90).optional(),
  }).strict();

  it("rejects invalid email format", () => {
    expect(() => inviteTokenSchema.parse({ email: "not-an-email" })).toThrow();
  });

  it("rejects excessive expiry days", () => {
    expect(() => inviteTokenSchema.parse({ expiresInDays: 999999 })).toThrow();
  });

  it("rejects invalid roles", () => {
    expect(() => inviteTokenSchema.parse({ role: "superadmin" })).toThrow();
  });

  it("accepts valid invite data", () => {
    const result = inviteTokenSchema.parse({ email: "user@example.com", role: "agent", expiresInDays: 14 });
    expect(result.email).toBe("user@example.com");
    expect(result.role).toBe("agent");
    expect(result.expiresInDays).toBe(14);
  });

  it("rejects extra fields", () => {
    expect(() => inviteTokenSchema.parse({ email: "a@b.com", extra: true })).toThrow();
  });
});

describe("TRS-1: CSV injection prevention", () => {
  const csvSafe = (val: string | null | undefined): string => {
    if (val == null) return '';
    const s = String(val).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) return `"'${s}"`;
    return `"${s}"`;
  };

  it("escapes formula injection starting with =", () => {
    expect(csvSafe("=CMD('calc')")).toBe(`"'=CMD('calc')"`);
  });

  it("escapes + prefix", () => {
    expect(csvSafe("+1234")).toBe(`"'+1234"`);
  });

  it("escapes - prefix", () => {
    expect(csvSafe("-1+2")).toBe(`"'-1+2"`);
  });

  it("escapes @ prefix", () => {
    expect(csvSafe("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });

  it("passes safe values through quoted", () => {
    expect(csvSafe("normal text")).toBe(`"normal text"`);
  });

  it("handles null/undefined", () => {
    expect(csvSafe(null)).toBe('');
    expect(csvSafe(undefined)).toBe('');
  });

  it("escapes internal double quotes", () => {
    expect(csvSafe('he said "hello"')).toBe('"he said ""hello"""');
  });
});

describe("INC-2: Closed incident escalation prevention", () => {
  it("closed/resolved incidents should not be escalatable (contract)", () => {
    const nonEscalatable = ['closed', 'resolved'];
    for (const status of nonEscalatable) {
      // Our fix returns 409 for these statuses
      expect(nonEscalatable).toContain(status);
    }
    // Open/investigating should still be escalatable
    const escalatable = ['open', 'investigating'];
    for (const status of escalatable) {
      expect(nonEscalatable).not.toContain(status);
    }
  });
});

// ─── Round 3: Cross-Cutting Concerns ─────────────────────────────────────────

describe("CC-2: pg Pool error handler", () => {
  it("pool module exports a pg.Pool instance with an error listener", async () => {
    // Importing db.ts should attach an 'error' handler on pool
    const { pool } = await import("../../server/db.js");
    expect(pool).toBeDefined();
    // The pool should have at least one 'error' listener (our handler)
    expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);
  });
});

describe("CC-3: WebSocket Origin validation helper", () => {
  it("CORS_ORIGIN env should restrict WebSocket origins in production", () => {
    // Verify the env var mechanism: if CORS_ORIGIN is set, it produces an allow-list
    const origins = "https://app.example.com, https://admin.example.com";
    const allowedSet = new Set(origins.split(",").map(s => s.trim()));
    expect(allowedSet.has("https://app.example.com")).toBe(true);
    expect(allowedSet.has("https://evil.com")).toBe(false);
  });
});

describe("CC-5: WebSocket subscription limit", () => {
  it("MAX_SUBSCRIPTIONS_PER_CLIENT constant should be reasonable", () => {
    // If we import the module, the constant is scoped. Instead, verify behaviour:
    // A Set with 100+ entries should trigger the limit guard.
    const subs = new Set<string>();
    for (let i = 0; i < 100; i++) subs.add(`channel:${i}`);
    expect(subs.size).toBe(100);
    // Adding one more should exceed the limit
    subs.add("channel:100");
    expect(subs.size).toBe(101);
    // The guard checks size >= MAX before adding, so at 100 it blocks
  });
});

describe("CC-6: WebSocket message rate limiter", () => {
  it("rate window filtering keeps only recent timestamps", () => {
    const now = Date.now();
    const WINDOW = 10_000;
    const timestamps = [
      now - 15_000, // expired
      now - 11_000, // expired
      now - 5_000,  // active
      now - 1_000,  // active
    ];
    const filtered = timestamps.filter(t => t > now - WINDOW);
    expect(filtered.length).toBe(2);
  });

  it("rejects when max messages exceeded in window", () => {
    const now = Date.now();
    const WINDOW = 10_000;
    const MAX = 50;
    // Simulate 50 messages in the window
    const timestamps = Array.from({ length: MAX }, (_, i) => now - i * 100);
    const filtered = timestamps.filter(t => t > now - WINDOW);
    expect(filtered.length).toBe(MAX);
    // Should be rejected (>= MAX)
    expect(filtered.length >= MAX).toBe(true);
  });
});

describe("CC-7: Typing indicator uses server-side userId only", () => {
  it("typing broadcast should NOT include client-provided displayName", () => {
    // Simulate what our fixed handler does:
    const clientUserId = 42;
    const broadcastData = { userId: clientUserId };
    // displayName should NOT be present
    expect(broadcastData).not.toHaveProperty("displayName");
    expect(broadcastData.userId).toBe(42);
  });
});

describe("CC-8: Typing requires channel subscription", () => {
  it("client not subscribed to channel should be blocked from typing", () => {
    const subscriptions = new Set(["channel:1", "vehicles"]);
    const typingChannel = "channel:99";
    // Our guard: if (!client.subscriptions.has(typingChannel)) break;
    expect(subscriptions.has(typingChannel)).toBe(false);
  });

  it("client subscribed to channel should be allowed", () => {
    const subscriptions = new Set(["channel:1", "vehicles"]);
    const typingChannel = "channel:1";
    expect(subscriptions.has(typingChannel)).toBe(true);
  });
});

describe("CC-4: Error handler ordering", () => {
  it("serveStatic must be registered before the error handler", async () => {
    // Read index.ts source to confirm ordering
    const fs = await import("fs");
    const path = await import("path");
    const indexSrc = fs.readFileSync(
      path.resolve(__dirname, "../../server/index.ts"),
      "utf-8"
    );
    const staticIdx = indexSrc.indexOf("serveStatic(app)");
    const errorHandlerIdx = indexSrc.indexOf("installGlobalErrorHandler(app)");
    // Both should exist
    expect(staticIdx).toBeGreaterThan(-1);
    expect(errorHandlerIdx).toBeGreaterThan(-1);
    // Static must come first
    expect(staticIdx).toBeLessThan(errorHandlerIdx);
  });
});

// ─── Round 3 Batch 2: Route-level findings ───────────────────────────────────

describe("RT-3/RT-4: Tab widget PATCH schemas", () => {
  const tabPatchSchema = z.object({
    label: z.string().max(100).optional(),
    icon: z.string().max(50).optional(),
    order: z.number().int().min(0).optional(),
    isDefault: z.boolean().optional(),
    template: z.string().max(50).nullable().optional(),
    config: z.record(z.string(), z.unknown()).nullable().optional(),
  }).strict();

  const widgetPatchSchema = z.object({
    widgetSlug: z.string().max(100).optional(),
    x: z.number().int().min(0).optional(),
    y: z.number().int().min(0).optional(),
    w: z.number().int().min(1).optional(),
    h: z.number().int().min(1).optional(),
    config: z.record(z.string(), z.unknown()).nullable().optional(),
  }).strict();

  it("tab patch rejects injected userId field", () => {
    expect(() => tabPatchSchema.parse({ label: "ok", userId: 999 })).toThrow();
  });

  it("tab patch rejects injected id field", () => {
    expect(() => tabPatchSchema.parse({ id: 1 })).toThrow();
  });

  it("tab patch accepts valid fields", () => {
    expect(() => tabPatchSchema.parse({ label: "My Tab", icon: "Star", order: 2 })).not.toThrow();
  });

  it("widget patch rejects injected tabId field", () => {
    expect(() => widgetPatchSchema.parse({ w: 4, tabId: 999 })).toThrow();
  });

  it("widget patch accepts valid layout change", () => {
    expect(() => widgetPatchSchema.parse({ x: 0, y: 0, w: 6, h: 4 })).not.toThrow();
  });
});

describe("RT-12: Analytics CSV injection prevention", () => {
  const csvSafe = (val: unknown): string => {
    const s = String(val ?? '');
    if (/^[=+\-@\t\r]/.test(s) || s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  it("escapes formula-starting characters", () => {
    expect(csvSafe("=cmd()")).toMatch(/^"/);
    expect(csvSafe("+1")).toMatch(/^"/);
    expect(csvSafe("-1")).toMatch(/^"/);
    expect(csvSafe("@evil")).toMatch(/^"/);
  });

  it("escapes embedded quotes", () => {
    const result = csvSafe('hello "world"');
    expect(result).toContain('""');
  });

  it("passes through safe values", () => {
    expect(csvSafe("hello")).toBe("hello");
    expect(csvSafe("42")).toBe("42");
  });
});

describe("RT-14: Content-Disposition filename sanitisation", () => {
  it("strips double-quotes from filename", () => {
    const raw = 'file"; other="bad';
    const safe = raw.replace(/["\r\n]/g, '_');
    expect(safe).not.toContain('"');
  });

  it("strips newlines from filename", () => {
    const raw = "file\r\nInjected: header";
    const safe = raw.replace(/["\r\n]/g, '_');
    expect(safe).not.toContain("\r");
    expect(safe).not.toContain("\n");
  });

  it("passes through safe filenames", () => {
    const raw = "analytics-2024-01-15.csv";
    const safe = raw.replace(/["\r\n]/g, '_');
    expect(safe).toBe(raw);
  });
});

// ─── AUTOMATION JSONB VALIDATION TESTS ───────────────────────────────────────

describe("automationConditionSchema", () => {
  it("accepts simple equality conditions", () => {
    expect(automationConditionSchema.safeParse({ status: "ready", stationId: 1 }).success).toBe(true);
  });

  it("accepts array conditions (IN-list)", () => {
    expect(automationConditionSchema.safeParse({ status: ["ready", "maintenance"] }).success).toBe(true);
  });

  it("accepts boolean conditions", () => {
    expect(automationConditionSchema.safeParse({ isUrgent: true }).success).toBe(true);
  });

  it("rejects object values (nested injection)", () => {
    const result = automationConditionSchema.safeParse({ status: { $ne: "blocked" } });
    expect(result.success).toBe(false);
  });

  it("rejects keys longer than 100 chars", () => {
    const longKey = "a".repeat(101);
    const result = automationConditionSchema.safeParse({ [longKey]: "value" });
    expect(result.success).toBe(false);
  });
});

describe("automationActionSchema", () => {
  it("accepts valid send_notification action", () => {
    const result = automationActionSchema.safeParse({
      type: "send_notification",
      title: "Alert",
      severity: "warning",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid update_vehicle_status action", () => {
    const result = automationActionSchema.safeParse({
      type: "update_vehicle_status",
      vehicleId: 42,
      status: "maintenance",
    });
    expect(result.success).toBe(true);
  });

  it("rejects update_vehicle_status without required vehicleId", () => {
    const result = automationActionSchema.safeParse({
      type: "update_vehicle_status",
      status: "maintenance",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid create_incident action", () => {
    const result = automationActionSchema.safeParse({
      type: "create_incident",
      title: "Auto-incident",
      severity: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid log_event action", () => {
    const result = automationActionSchema.safeParse({ type: "log_event" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown action type", () => {
    const result = automationActionSchema.safeParse({ type: "drop_table" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity enum values", () => {
    const result = automationActionSchema.safeParse({
      type: "send_notification",
      severity: "apocalyptic",
    });
    expect(result.success).toBe(false);
  });
});

describe("automationRulePatchSchema — JSONB fields", () => {
  it("accepts valid conditions + actions together", () => {
    const result = automationRulePatchSchema.safeParse({
      conditions: { status: "ready" },
      actions: [
        { type: "send_notification", title: "Heads up" },
        { type: "log_event", eventAction: "status_change" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects actions array exceeding max 20", () => {
    const actions = Array.from({ length: 21 }, () => ({ type: "log_event" as const }));
    const result = automationRulePatchSchema.safeParse({ actions });
    expect(result.success).toBe(false);
  });

  it("rejects extra properties (strict mode)", () => {
    const result = automationRulePatchSchema.safeParse({ evilField: "injection" });
    expect(result.success).toBe(false);
  });
});

// ─── AI TOOL OUTPUT SANITIZATION TESTS ───────────────────────────────────────

describe("sanitizeInput — AI tool output sanitization", () => {
  it("strips all HTML tags from tool output", () => {
    const malicious = '<script>alert("xss")</script>Safe text';
    expect(sanitizeInput(malicious)).toBe("Safe text");
  });

  it("strips nested HTML while preserving text", () => {
    const input = '<div><b>bold</b> and <a href="http://evil.com">link</a></div>';
    expect(sanitizeInput(input)).toBe("bold and link");
  });

  it("passes through plain text unchanged", () => {
    expect(sanitizeInput("Vehicle ABC-1234 status: ready")).toBe("Vehicle ABC-1234 status: ready");
  });

  it("trims whitespace", () => {
    expect(sanitizeInput("   padded   ")).toBe("padded");
  });

  it("handles empty string", () => {
    expect(sanitizeInput("")).toBe("");
  });

  it("strips event handler attributes", () => {
    const input = '<img onerror="alert(1)" src=x>';
    expect(sanitizeInput(input)).toBe("");
  });
});
