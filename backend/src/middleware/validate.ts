import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

export function validateBody<S extends z.ZodType>(schema: S) {
  return (req: Request<unknown, unknown, z.infer<S>>, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery<S extends z.ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Express types req.query as ParsedQs; the validated/coerced result from
    // a zod schema is a different (usually narrower) shape, so this is an
    // intentional widen rather than a type we can keep structurally honest.
    req.query = schema.parse(req.query) as unknown as Request["query"];
    next();
  };
}
