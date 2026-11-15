export type OrderStatus =
  | "pending_payment"
  | "payment_confirmed"
  | "seller_notified"
  | "accepted"
  | "processing"
  | "ready_for_delivery"
  | "out_for_delivery"
  | "delivered"
  | "customer_confirmed"
  | "completed"
  | "rejected"
  | "cancelled"
  | "disputed"
  | "refund_pending"
  | "refunded"
  | "expired";

export type FulfilmentMethod = "delivery" | "collection";

export function nextSellerStatuses(current: OrderStatus, method: FulfilmentMethod): OrderStatus[] {
  switch (current) {
    case "seller_notified":
      return ["accepted", "rejected"];
    case "accepted":
      return ["processing"];
    case "processing":
      return ["ready_for_delivery"];
    case "ready_for_delivery":
      return method === "collection" ? ["delivered"] : ["out_for_delivery"];
    case "out_for_delivery":
      return ["delivered"];
    default:
      return [];
  }
}

export function canCustomerCancel(current: OrderStatus): boolean {
  return current === "payment_confirmed" || current === "seller_notified";
}

export function canRequestOtp(current: OrderStatus): boolean {
  return current === "ready_for_delivery" || current === "out_for_delivery" || current === "delivered";
}

export function canOpenDispute(current: OrderStatus): boolean {
  return ["accepted", "processing", "ready_for_delivery", "out_for_delivery", "delivered"].includes(current);
}
