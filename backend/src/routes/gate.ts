import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const gateRouter = Router();

gateRouter.use(authenticate, requireRole("ORGANISER", "ADMIN"));

const checkInSchema = z.object({ ref: z.string().min(3) });

/**
 * Real server-side check-in. This replaces the previous frontend's gate
 * section, which only matched a typed ref against that one browser's
 * localStorage and could never see tickets scanned by a different device.
 * Because this reads/writes the shared database, two gate devices for the
 * same event now agree on which tickets have already been used.
 */
gateRouter.post(
  "/check-in",
  asyncHandler(async (req, res) => {
    const body = checkInSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { ref: body.ref } });

    if (!ticket) throw new HttpError(404, "Ticket not found");

    if (ticket.status === "USED") {
      res.status(409).json({ result: "used", ticket: { ref: ticket.ref, usedAt: ticket.usedAt } });
      return;
    }
    if (ticket.status === "CANCELLED") {
      res.status(409).json({ result: "cancelled", ticket: { ref: ticket.ref } });
      return;
    }
    if (ticket.status === "TRANSFERRED") {
      res.status(409).json({ result: "moved", ticket: { ref: ticket.ref, holderName: ticket.holderName } });
      return;
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "USED", usedAt: new Date() },
    });
    res.json({ result: "ok", ticket: { ref: updated.ref, holderName: updated.holderName, usedAt: updated.usedAt } });
  }),
);
