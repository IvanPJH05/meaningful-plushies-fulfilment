type BankRow = { id: string; bank: string; status: string; journal_entry_id: string | null; money_in: number; money_out: number };

export function contraRows<T extends BankRow>(row: T, rows: T[]): T[] {
  if (!row.journal_entry_id || row.status === "unposted") return [];
  const linked = rows.filter((item) => item.journal_entry_id === row.journal_entry_id && item.status !== "unposted");
  const incoming = linked.find((item) => item.money_in > 0);
  const outgoing = linked.find((item) => item.money_out > 0);
  return incoming && outgoing && incoming.bank !== outgoing.bank && Math.abs(incoming.money_in - outgoing.money_out) < 0.005 ? linked : [];
}

export function bankRowStatus<T extends BankRow>(row: T, rows: T[]) {
  return row.status === "reconciled" || contraRows(row, rows).length > 0 ? "contra" : row.status;
}
