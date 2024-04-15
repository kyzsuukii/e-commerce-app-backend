import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface User {
      id: number;
      role: string;
    }
  }
}

export function findChangedValues<T extends Record<string, any>>(
  obj1: T,
  obj2: T,
): Partial<T> {
  const changedValues: Partial<T> = {};

  Object.keys(obj1).forEach((key) => {
    if (obj2.hasOwnProperty(key) && obj1[key] !== obj2[key]) {
      changedValues[key as keyof T] = obj2[key];
    }
  });

  return changedValues;
}
export 
function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({
      errors: [{ msg: "You do not have administrative privileges" }],
    });
  }
  next();
}