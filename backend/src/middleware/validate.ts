import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";

export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request<unknown, unknown, z.infer<S>>, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.query = schema.parse(req.query);
    next();
  };
}
