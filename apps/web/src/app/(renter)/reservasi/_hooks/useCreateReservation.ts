"use client";

/**
 * POST /reservations — the stock lock (FR-INV-02, guest checkout).
 *
 * A fresh `Idempotency-Key` (UUID) is minted per attempt; for a guest booking
 * the server scopes it to `contactPhone` (A-17). A retry after a spent attempt
 * (502 GATEWAY_UNAVAILABLE) therefore gets a new key, never a reuse.
 */
import { useMutation } from "@tanstack/react-query";
import type { CreateReservationBody, CreateReservationResponse } from "@repo/contracts";
import { API_BASE, ApiError, networkError, readApiError } from "../_lib/api";

export interface CreateReservationInput {
  outletId: string;
  category: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  /** V-PHONE: required for a guest booking; omitted for an authenticated renter. */
  contactPhone?: string;
}

async function createReservation(input: CreateReservationInput): Promise<CreateReservationResponse> {
  const body: CreateReservationBody = {
    outletId: input.outletId,
    category: input.category,
    quantity: input.quantity,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    ...(input.contactPhone === undefined ? {} : { contactPhone: input.contactPhone }),
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal membuat reservasi");
  return (await res.json()) as CreateReservationResponse;
}

export function useCreateReservation() {
  return useMutation<CreateReservationResponse, ApiError, CreateReservationInput>({
    mutationFn: createReservation,
  });
}
