export type BusinessScopedRecord = {
  businessId: string;
};

export function assertBusinessScope(record: BusinessScopedRecord, activeBusinessId: string): void {
  if (record.businessId !== activeBusinessId) {
    throw new Error("This record does not belong to the active business.");
  }
}

export function businessWhere<TWhere extends object>(businessId: string, where?: TWhere): TWhere & { businessId: string } {
  return {
    ...(where || ({} as TWhere)),
    businessId,
  };
}

export function isBusinessScoped(value: unknown): value is BusinessScopedRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      "businessId" in value &&
      typeof (value as BusinessScopedRecord).businessId === "string",
  );
}
