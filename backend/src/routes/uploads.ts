import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { asyncHandler, HttpError } from "../lib/http.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { bunnyConfigured, uploadToBunny } from "../lib/bunny.js";

export const uploadsRouter = Router();

/** Where posters land. Relative to the working directory by default, which on
 * a container is wiped by every redeploy — point it at a mounted volume in
 * production. */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");

// Configurable so the ceiling can be raised without a deploy; the default
// matches what the form hint promises the organiser.
const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);

// Allowlist by MIME type AND extension: a browser-declared type alone is
// attacker-controlled, and an extension alone says nothing about content.
const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new HttpError(415, "Only JPEG, PNG or WebP images are accepted"));
      return;
    }
    cb(null, true);
  },
});

/** Magic-byte check: the declared MIME type is not evidence of anything. */
function sniff(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return null;
}

uploadsRouter.post(
  "/image",
  authenticate,
  requirePermission("uploads.create"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");

    const actual = sniff(file.buffer);
    if (!actual || actual !== ALLOWED.get(file.mimetype)) {
      throw new HttpError(415, "File content does not match its declared image type");
    }

    // Random name: never trust the client's filename — it carries path
    // traversal and collision risk for nothing in return.
    const name = `${Date.now()}-${randomBytes(8).toString("hex")}${actual}`;

    // Bunny when configured, local disk otherwise. The fallback is not a
    // nicety: it keeps the upload flow exercisable offline and in tests, and
    // it is why losing the CDN credentials degrades the app rather than
    // breaking event creation outright.
    if (bunnyConfigured()) {
      const url = await uploadToBunny(name, file.buffer, file.mimetype);
      res.status(201).json({ url });
      return;
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, name), file.buffer);
    res.status(201).json({ url: `/uploads/${name}` });
  }),
);
