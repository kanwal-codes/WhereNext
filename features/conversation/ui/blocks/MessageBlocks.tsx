import React from "react";
import type { AssistantBlock, PlaceCard, TrustLabel } from "@/packages/contracts/assistant";

export type BlockHandlers = {
  onFollowup: (prompt: string) => void;
  onSave: (place: PlaceCard) => void;
  onAddItinerary: (place: PlaceCard) => void;
};

const TRUST_LABEL: Record<TrustLabel, string> = {
  verified: "Verified",
  sourced: "From provider",
  estimated: "Estimated",
  assumption: "Assumption",
  unavailable: "Unavailable",
};

function PlaceCardView({ place, onSave, onAddItinerary }: { place: PlaceCard } & Pick<BlockHandlers, "onSave" | "onAddItinerary">) {
  return (
    <article className="pcard">
      {place.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img className="pcard-photo" src={place.photoUrl} alt={place.name} width={320} height={180} loading="lazy" />
      )}
      <div className="pcard-body">
        <h4 className="pcard-name">{place.name}</h4>
        {(place.category || place.address) && (
          <p className="pcard-meta">{[place.category?.replaceAll("_", " "), place.address].filter(Boolean).join(" · ")}</p>
        )}
        {typeof place.rating === "number" && (
          <p className="pcard-meta">★ {place.rating}{place.userRatingCount ? ` (${place.userRatingCount.toLocaleString()})` : ""}</p>
        )}
        {place.distanceToLocked && <p className="pcard-meta">📍 {place.distanceToLocked}</p>}
        <p className="pcard-trust">{TRUST_LABEL[place.trust] ?? place.trust}</p>
        <div className="pcard-actions">
          <button type="button" onClick={() => onSave(place)}>Save</button>
          <button type="button" onClick={() => onAddItinerary(place)}>Add to itinerary</button>
          {place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer noopener">Open in Maps</a>}
        </div>
      </div>
    </article>
  );
}

export function MessageBlocks({ blocks, onFollowup, onSave, onAddItinerary }: { blocks: AssistantBlock[] } & BlockHandlers) {
  return (
    <div className="msg-blocks">
      {blocks.map((block, index) => {
        if (block.type === "place_list") {
          return (
            <div className="pcard-grid" key={index}>
              {block.places.map((place) => <PlaceCardView key={place.providerId} place={place} onSave={onSave} onAddItinerary={onAddItinerary} />)}
            </div>
          );
        }
        if (block.type === "comparison") {
          return (
            <div className="cmp" key={index}>
              <p className="cmp-title">{block.title}</p>
              <div className="cmp-scroll">
                <table>
                  <thead><tr><th aria-hidden="true" />{block.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {block.bestForYou && <p className="cmp-best"><strong>{block.bestForYou.label}</strong> — {block.bestForYou.reason}</p>}
            </div>
          );
        }
        if (block.type === "actions") {
          return (
            <div className="chips" key={index}>
              {block.items.map((item) => <button type="button" key={item.label} onClick={() => onFollowup(item.prompt)}>{item.label}</button>)}
            </div>
          );
        }
        if (block.type === "route_summary") {
          const icon = block.mode === "transit" ? "🚆" : block.mode === "walking" ? "🚶" : "🚗";
          return (
            <div className="route" key={index}>
              <p className="route-head">{icon} {block.from} → {block.to}</p>
              <p className="route-meta">
                {Math.round(block.durationSeconds / 60)} min · {(block.distanceMeters / 1000).toFixed(1)} km
                {block.departureTime ? ` · leaves ${new Date(block.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
              </p>
              {block.steps.length > 0 && <ol className="route-steps">{block.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>}
            </div>
          );
        }
        if (block.type === "clarifying_question") {
          return (
            <div className="clarify" key={index}>
              <p>{block.question}</p>
              {block.chips.length > 0 && (
                <div className="chips">{block.chips.map((chip) => <button type="button" key={chip} onClick={() => onFollowup(chip)}>{chip}</button>)}</div>
              )}
            </div>
          );
        }
        if (block.type === "events") {
          return (
            <div className="events" key={index}>
              {block.items.map((event, eventIndex) => (
                <div className="event-row" key={eventIndex}>
                  <div className="event-main">
                    <span className="event-title">{event.title}</span>
                    {(event.date || event.venue) && <span className="event-meta">{[event.date, event.venue].filter(Boolean).join(" · ")}</span>}
                  </div>
                  <a href={event.url} target="_blank" rel="noreferrer noopener">Tickets →</a>
                </div>
              ))}
              <p className="event-note">Snapshot from {new Date(block.retrievedAt).toLocaleString()} — confirm dates & availability on the ticket page.</p>
            </div>
          );
        }
        if (block.type === "flights") {
          const fmt = (value: string) => {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          };
          return (
            <div className="flights" key={index}>
              <p className="flights-head">✈️ {block.origin} → {block.destination}{block.dateNote ? ` · ${block.dateNote}` : ""}</p>
              {block.items.map((offer, offerIndex) => (
                <div className="flight-row" key={offerIndex}>
                  <span className="flight-airline">{offer.airline}</span>
                  <span className="flight-meta">
                    {Math.floor(offer.durationMinutes / 60)}h {offer.durationMinutes % 60}m · {offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`} · {fmt(offer.departAt)}
                  </span>
                  <span className="flight-price tabular-nums">{offer.price} {offer.currency}</span>
                </div>
              ))}
              <p className="event-note">Live estimate from {new Date(block.retrievedAt).toLocaleString()} — fares change; book on the airline or a travel site.</p>
            </div>
          );
        }
        if (block.type === "stays") {
          return (
            <div className="stays" key={index}>
              <p className="stays-head">🏨 Stays in {block.location} · {block.nights} night{block.nights > 1 ? "s" : ""}{block.dateNote ? ` · ${block.dateNote}` : ""}</p>
              {block.items.map((hotel, hotelIndex) => (
                <div className="stay-row" key={hotelIndex}>
                  <div className="stay-main">
                    <span className="stay-name">{hotel.name}</span>
                    <span className="stay-meta">
                      {[
                        typeof hotel.stars === "number" ? `${hotel.stars}★` : null,
                        typeof hotel.rating === "number" ? `${hotel.rating}/10${hotel.reviews ? ` (${hotel.reviews.toLocaleString()})` : ""}` : null,
                        hotel.board,
                        hotel.refundable ? "refundable" : null,
                        hotel.distanceToLocked ? `📍 ${hotel.distanceToLocked}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="stay-price">
                    <span className="tabular-nums">{hotel.nightlyPrice} {hotel.currency}</span>
                    <span className="stay-price-sub">/night · {hotel.totalPrice} {hotel.currency} total</span>
                    <span className="stay-links">
                      {hotel.mapUrl && <a href={hotel.mapUrl} target="_blank" rel="noreferrer noopener">Map</a>}
                      <button type="button" onClick={() => onFollowup(`Show room rates at ${hotel.name}`)}>Rooms</button>
                    </span>
                  </div>
                </div>
              ))}
              {block.rooms && block.rooms.length > 0 && (
                <div className="stay-rooms">
                  <p className="stay-rooms-head">Rooms at {block.detailHotel}</p>
                  {block.rooms.map((room, roomIndex) => (
                    <div className="stay-room-row" key={roomIndex}>
                      <span>{room.name}{room.board ? ` · ${room.board}` : ""}{room.refundable ? " · refundable" : ""}</span>
                      <span className="tabular-nums">{room.nightlyPrice} {room.currency}/night</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="event-note">Live rates from {new Date(block.retrievedAt).toLocaleString()} — taxes/fees may be extra; confirm availability at booking.</p>
            </div>
          );
        }
        if (block.type === "checklist") {
          return (
            <div className="checklist" key={index}>
              {block.groups.map((group) => (
                <div className="checklist-group" key={group.title}>
                  <p className="checklist-title">{group.title}</p>
                  <ul>{group.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item.text}{item.why ? <span className="checklist-why"> — {item.why}</span> : null}</li>
                  ))}</ul>
                </div>
              ))}
            </div>
          );
        }
        return null; // stay_options rendered in a later phase
      })}
    </div>
  );
}
