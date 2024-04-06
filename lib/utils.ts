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
