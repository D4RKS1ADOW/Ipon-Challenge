import { getAll, putOne, removeOne, makeId } from "./database.js";
import { recordLiabilityCollection, recordExpense, updateTransaction, deleteTransaction } from "./transactions.js";

export async function getLiabilities() {
  const all = await getAll("liabilities");
  return all.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

/**
 * Records money that has already arrived in an account (e.g. fun run
 * registration fees) but isn't earned yet. The linked transaction affects
 * the account balance right away, but stays excluded from income totals
 * until it's converted on (or after) its due date.
 */
export async function createLiability({ description, amountCentavos, accountId, dueDate, categoryId }) {
  if (!description.trim()) throw new Error("Please describe what this money is for.");
  if (!Number.isFinite(amountCentavos) || amountCentavos <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  if (!dueDate) throw new Error("Please choose the date this becomes yours.");

  const transaction = await recordLiabilityCollection({
    amountCentavos,
    categoryId,
    note: description,
    date: new Date().toISOString().slice(0, 10),
    accountId,
  });

  return putOne("liabilities", {
    id: makeId(),
    description: description.trim(),
    amountCentavos,
    accountId,
    categoryId: categoryId || null,
    dueDate,
    status: "pending", // "pending" | "earned" | "refunded"
    transactionId: transaction.id,
    createdAt: new Date().toISOString(),
  });
}

/** Only "pending" liabilities represent money that isn't the user's yet. */
export function getPendingLiabilities(liabilities) {
  return liabilities.filter((l) => l.status === "pending");
}

/**
 * Flips the linked transaction from "liability" to "income". The account
 * balance is unaffected (same transaction id and amount) — it just starts
 * counting toward income totals and reports from its due date onward.
 */
async function earnLiability(liability) {
  await updateTransaction(liability.transactionId, { type: "income", date: liability.dueDate });
  return putOne("liabilities", { ...liability, status: "earned" });
}

/**
 * Checks every pending liability and auto-converts any whose due date has
 * arrived or passed into real income. Safe to call on every view render —
 * already-earned or refunded liabilities are simply skipped.
 */
export async function processDueLiabilities() {
  const liabilities = await getAll("liabilities");
  const today = new Date().toISOString().slice(0, 10);
  const due = getPendingLiabilities(liabilities).filter((l) => l.dueDate <= today);
  for (const liability of due) {
    await earnLiability(liability);
  }
  return due.length;
}

/**
 * Cancels a pending liability: records a real expense (the cash actually
 * leaving the account, e.g. a refund to a registrant) and marks the
 * liability "refunded" so it stops counting as pending/unearned money.
 * It never becomes income.
 */
export async function refundLiability(liability, { categoryId, date }) {
  if (liability.status !== "pending") {
    throw new Error("Only pending liabilities can be refunded.");
  }

  const transaction = await recordExpense({
    amountCentavos: liability.amountCentavos,
    categoryId,
    note: `Refund: ${liability.description}`,
    date: date || new Date().toISOString().slice(0, 10),
    accountId: liability.accountId,
  });

  return putOne("liabilities", {
    ...liability,
    status: "refunded",
    refundTransactionId: transaction.id,
  });
}

/**
 * Only pending liabilities can be deleted outright (e.g. entered by
 * mistake) — earned or refunded ones are historical and already tied to
 * a real transaction, so they should be corrected via that transaction
 * instead of silently disappearing.
 */
export async function deleteLiability(id) {
  const all = await getAll("liabilities");
  const existing = all.find((l) => l.id === id);
  if (!existing) throw new Error("Liability not found.");
  if (existing.status !== "pending") {
    throw new Error("This liability has already been resolved and can't be deleted.");
  }
  if (existing.transactionId) {
    await deleteTransaction(existing.transactionId);
  }
  return removeOne("liabilities", id);
}