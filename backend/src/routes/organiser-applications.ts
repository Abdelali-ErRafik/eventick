import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { phoneOk } from "../lib/payment-sim.js";

/**
 * Applying to become an organiser.
 *
 * Public registration always creates a CUSTOMER, and an admin can mint an
 * organiser directly — but until now nobody could ASK. The "Créer un
 * événement" button in the header was a dead end: logged out it bounced to
 * /login, and a logged-in customer was silently redirected to the homepage.
 *
 * The review step is deliberate. An organiser lists events, takes money from
 * buyers and will eventually be paid out, so who gets to do that is worth a
 * human decision rather than a checkbox — the same reasoning that keeps
 * ADMIN out of the roles POST /auth/users may assign.
 */

export const organiserApplicationsRouter = Router();

const applySchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  phone: z.string().trim(),
  pitch: z.string().trim().min(20).max(1000),
});

/** What the applicant themselves may see. Never includes the reviewer. */
function applicantView(app: {
  id: string;
  status: string;
  displayName: string;
  phone: string;
  pitch: string;
  decisionNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: app.id,
    status: app.status,
    displayName: app.displayName,
    phone: app.phone,
    pitch: app.pitch,
    decisionNote: app.decisionNote,
    createdAt: app.createdAt.toISOString(),
    reviewedAt: app.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * The applicant's own view: their latest application, or null.
 *
 * Returns 200 with `application: null` rather than 404 — "you have not
 * applied" is a normal state the page renders a form for, not an error.
 */
organiserApplicationsRouter.get(
  "/mine",
  authenticate,
  asyncHandler(async (req, res) => {
    const app = await prisma.organiserApplication.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ application: app ? applicantView(app) : null });
  }),
);

organiserApplicationsRouter.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = applySchema.parse(req.body);
    if (!phoneOk(body.phone)) throw new HttpError(400, "Invalid phone number");

    // Already an organiser (or an admin, who can do strictly more): there is
    // nothing to apply for, and approving it later would be a no-op that
    // still looked like a pending decision in the queue.
    if (req.user!.role !== "CUSTOMER") {
      throw new HttpError(409, "This account can already create events");
    }

    // One open application at a time. Without this, a frustrated applicant
    // refreshing the form fills the admin queue with duplicates of the same
    // request, and approving one leaves the others pending forever.
    const pending = await prisma.organiserApplication.findFirst({
      where: { userId: req.user!.id, status: "PENDING" },
    });
    if (pending) throw new HttpError(409, "Your application is already being reviewed");

    const app = await prisma.organiserApplication.create({
      data: {
        userId: req.user!.id,
        displayName: body.displayName,
        phone: body.phone,
        pitch: body.pitch,
      },
    });
    res.status(201).json({ application: applicantView(app) });
  }),
);

// ─────────────────────────────────────────────────── the admin queue ──

/** The reviewer's view: adds who applied, which the applicant's own view
 * obviously does not need. */
function reviewView(app: {
  id: string;
  status: string;
  displayName: string;
  phone: string;
  pitch: string;
  decisionNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  user: { id: string; name: string; email: string; role: string };
  reviewedBy: { name: string } | null;
}) {
  return {
    ...applicantView(app),
    applicant: { id: app.user.id, name: app.user.name, email: app.user.email, role: app.user.role },
    reviewedBy: app.reviewedBy?.name ?? null,
  };
}

const listQuery = z.object({ status: z.enum(["PENDING", "APPROVED", "DECLINED"]).optional() });

organiserApplicationsRouter.get(
  "/",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const applications = await prisma.organiserApplication.findMany({
      where: query.status ? { status: query.status } : {},
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        reviewedBy: { select: { name: true } },
      },
      // Oldest pending first: a queue people wait in should be answered in
      // the order they joined it.
      orderBy: { createdAt: "asc" },
    });
    res.json({ applications: applications.map(reviewView) });
  }),
);

const decideSchema = z.object({
  approve: z.boolean(),
  /** Shown to the applicant when declined. */
  note: z.string().trim().max(500).optional(),
});

/**
 * Decide an application. Approving promotes the applicant to ORGANISER.
 *
 * The promotion and the decision are written in one transaction: a promotion
 * without a recorded decision would leave an organiser nobody approved, and a
 * decision without the promotion would leave an approved applicant who still
 * cannot do anything.
 */
organiserApplicationsRouter.post(
  "/:id/decide",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = decideSchema.parse(req.body);

    const app = await prisma.organiserApplication.findUnique({ where: { id }, include: { user: true } });
    if (!app) throw new HttpError(404, "Application not found");
    if (app.status !== "PENDING") throw new HttpError(409, "This application has already been decided");

    const status = body.approve ? "APPROVED" : "DECLINED";

    const updated = await prisma.$transaction(async (tx) => {
      // Only promote a CUSTOMER. If their role moved while the application
      // sat in the queue — an admin promoted them by hand, say — recording
      // the decision is still right, but overwriting the role is not.
      if (body.approve && app.user.role === "CUSTOMER") {
        await tx.user.update({ where: { id: app.userId }, data: { role: "ORGANISER" } });
      }
      return tx.organiserApplication.update({
        where: { id },
        data: {
          status,
          decisionNote: body.note ?? null,
          reviewedAt: new Date(),
          reviewedById: req.user!.id,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          reviewedBy: { select: { name: true } },
        },
      });
    });

    res.json({ application: reviewView(updated) });
  }),
);
