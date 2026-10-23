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
  if (!value) throw new HttpError(400, `Missing route parameter: ${name}`);
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
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
