import { describe, expect, it } from "vitest";
import { localDebts, totalsByCurrency } from "../../lib/expense-split";

const [a, b, c, d, e] = ["arjun", "noah", "liam", "maya", "sofia"];
const all = [a, b, c, d, e];

describe("localDebts", () => {
  it("splits an expense equally among everyone when it names nobody", () => {
    const debts = localDebts([{ amount: 100, currency: "EUR", paidBy: a, among: null }], all);
    expect(debts).toHaveLength(4);
    expect(debts.every((x) => x.toUserId === a && x.amount === 20 && x.currency === "EUR")).toBe(true);
  });
  it("shares only among the people it names", () => {
    expect(localDebts([{ amount: 90, currency: "EUR", paidBy: b, among: [b, d, e] }], all).sort((x, y) => x.fromUserId.localeCompare(y.fromUserId))).toEqual([
      { fromUserId: d, toUserId: b, amount: 30, currency: "EUR" },
      { fromUserId: e, toUserId: b, amount: 30, currency: "EUR" },
    ]);
  });
  it("nets people who paid for each other and settles with the fewest payments", () => {
    const debts = localDebts([
      { amount: 60, currency: "EUR", paidBy: a, among: [a, b] },
      { amount: 60, currency: "EUR", paidBy: b, among: [a, b] },
    ], all);
    expect(debts).toEqual([]);
    const chain = localDebts([
      { amount: 30, currency: "GBP", paidBy: a, among: [a, b, c] },
      { amount: 30, currency: "GBP", paidBy: b, among: [a, b, c] },
    ], all);
    expect(chain).toHaveLength(2);
    expect(chain.every((x) => x.fromUserId === c && x.amount === 10)).toBe(true);
    expect(chain.map((x) => x.toUserId).sort()).toEqual([a, b].sort());
  });
  it("keeps every cent: three-way split of 10.00 adds up exactly", () => {
    const debts = localDebts([{ amount: 10, currency: "CAD", paidBy: a, among: [a, b, c] }], all);
    // The payer (first sharer) takes the spare cent: 3.34 for them, 3.33 each for the others, 10.00 in all.
    expect(debts.map((x) => x.amount)).toEqual([3.33, 3.33]);
    expect(debts.reduce((t, x) => t + x.amount, 0) + 3.34).toBeCloseTo(10, 2);
  });
  it("settles each currency on its own and ignores an expense nobody paid", () => {
    const debts = localDebts([
      { amount: 20, currency: "EUR", paidBy: a, among: [a, b] },
      { amount: 20, currency: "GBP", paidBy: b, among: [a, b] },
      { amount: 50, currency: "EUR", paidBy: null, among: null },
    ], all);
    expect(debts).toEqual(expect.arrayContaining([{ fromUserId: b, toUserId: a, amount: 10, currency: "EUR" }, { fromUserId: a, toUserId: b, amount: 10, currency: "GBP" }]));
    expect(debts).toHaveLength(2);
  });
  it("skips a payer who left the trip and sharers who are not members", () => {
    expect(localDebts([{ amount: 40, currency: "EUR", paidBy: "ghost", among: null }], all)).toEqual([]);
    expect(localDebts([{ amount: 40, currency: "EUR", paidBy: a, among: ["ghost", b] }], all)).toEqual([{ fromUserId: b, toUserId: a, amount: 40, currency: "EUR" }]);
  });
});

describe("totalsByCurrency", () => {
  it("adds amounts per currency without float drift", () => {
    expect(totalsByCurrency([{ amount: 0.1, currency: "EUR" }, { amount: 0.2, currency: "EUR" }, { amount: 5, currency: "CAD" }])).toEqual([{ currency: "EUR", total: 0.3 }, { currency: "CAD", total: 5 }]);
  });
});
