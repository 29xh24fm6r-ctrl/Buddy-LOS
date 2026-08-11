export type ReadinessItem = { id: string; label: string; category: string; status: string; required: boolean; dueDate: string | null };
export type UnderwritingReadiness = { checklist: ReadinessItem[]; documents: ReadinessItem[]; required: number; satisfied: number; exceptions: number; percent: number; readyForReview: boolean };

export function deriveUnderwritingReadiness(checklist: ReadinessItem[], documents: ReadinessItem[]): UnderwritingReadiness {
  const items = [...checklist, ...documents];
  const requiredItems = items.filter((item) => item.required && item.status !== "waived");
  const satisfied = requiredItems.filter((item) => item.status === "satisfied").length;
  const exceptions = items.filter((item) => item.status === "exception").length;
  return { checklist, documents, required: requiredItems.length, satisfied, exceptions,
    percent: requiredItems.length === 0 ? 0 : Math.round((satisfied / requiredItems.length) * 100),
    readyForReview: requiredItems.length > 0 && satisfied === requiredItems.length && exceptions === 0 };
}
