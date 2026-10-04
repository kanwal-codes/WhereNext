import type { StayCardItem, StayOption } from "@/packages/contracts/stay";

/** A priced hotel as a stays card holds it: the card contract's limits applied. Shared by the chat turn and the card's own search. */
export function toStayCardItem(option: StayOption, distanceToLocked?: string): StayCardItem {
  return {
    hotelId: option.hotelId.slice(0, 120),
    name: option.name.slice(0, 160),
    nightlyPrice: String(option.nightlyAmount),
    totalPrice: String(option.totalAmount),
    currency: option.currency.slice(0, 8),
    stars: option.stars ?? undefined,
    rating: option.rating ?? undefined,
    reviews: option.reviewCount ?? undefined,
    board: option.boardName ?? undefined,
    refundable: option.refundable,
    distanceToLocked,
    thumbnailUrl: option.thumbnail?.startsWith("http") ? option.thumbnail : undefined,
    latitude: option.latitude ?? undefined,
    longitude: option.longitude ?? undefined,
    address: option.address?.slice(0, 200) ?? undefined,
    city: option.city?.slice(0, 80) ?? undefined,
  };
}
