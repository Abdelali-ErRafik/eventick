import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as Req, res, next).catch(next);
  };
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) throw new HttpError(400, `Missing route parameter: ${name}`);
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((issue) => issue.message).join(", ") });
    return;
  }
  // Multer rejects oversize/extra files with its own error class. These are
  // client mistakes, not server faults — a 500 here would tell an organiser
  // the service is broken when their poster is simply too big.
  if (typeof err === "object" && err !== null && (err as { name?: string }).name === "MulterError") {
    const code = (err as { code?: string }).code;
    const message =
      code === "LIMIT_FILE_SIZE"
        ? "Image is too large (maximum 5 MB)"
        : code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE"
          ? "Upload one image at a time"
          : "Upload rejected";
    res.status(413).json({ error: message });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
