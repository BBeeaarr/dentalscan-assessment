import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ALLOWED_SCAN_STATUSES = ["pending", "completed", "failed"] as const;
type ScanStatus = (typeof ALLOWED_SCAN_STATUSES)[number];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isScanStatus(value: unknown): value is ScanStatus {
  return typeof value === "string" && (ALLOWED_SCAN_STATUSES as readonly string[]).includes(value);
}

/**
 * CHALLENGE: NOTIFICATION SYSTEM
 * 
 * Your goal is to implement a robust notification logic.
 * 1. When a scan is "completed", create a record in the Notification table.
 * 2. Return a success status to the client.
 * 3. Bonus: Handle potential errors (e.g., database connection issues).
 */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request body",
          details: "Expected a JSON object payload.",
        },
        { status: 400 },
      );
    }

    const { scanId, status } = body as { scanId?: unknown; status?: unknown };

    if (!isNonEmptyString(scanId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing scanId",
          details: "scanId is required and must be a non-empty string.",
        },
        { status: 400 },
      );
    }

    if (!isScanStatus(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid status",
          details: `status must be one of: ${ALLOWED_SCAN_STATUSES.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (status === "completed") {
      const notification = await prisma.notification.create({
        data: {
          userId: "clinic",
          title: "Scan Completed",
          message: `Scan ${scanId} has been completed and is ready for review.`,
          read: false,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          scanId,
          status,
          notificationCreated: true,
          notificationId: notification.id,
        },
        { status: 201 },
      );
    }

    return NextResponse.json({ ok: true, scanId, status, notificationCreated: false });
  } catch (err) {
    console.error("Notification API Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
