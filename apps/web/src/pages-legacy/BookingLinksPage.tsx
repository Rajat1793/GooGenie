"use client";

/**
 * Standalone Booking Links page. Hosts the existing <BookingLinksPanel/> on
 * its own route so users can manage Calendly-style booking pages without
 * scrolling through the entire Profile screen.
 */
import { PageHeader } from "../components/PageHeader";
import { BookingLinksPanel } from "../components/BookingLinksPanel";

export function BookingLinksPage() {
  return (
    <div>
      <PageHeader
        title="Booking Links"
        subtitle="Share a public scheduler so anyone can book time on your calendar."
      />
      <BookingLinksPanel />
    </div>
  );
}
