"use client";

import { useMutation } from "@tanstack/react-query";
import type { CreateReservationBody, CreateReservationResponse } from "@repo/contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export interface CreateReservationInput {
  outletId: string;
  category: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  contactPhone?: string;
}

export interface ApiErrorShape {
  status: number;
  code?: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function useCreateReservation() {
  return useMutation<CreateReservationResponse, ApiError, CreateReservationInput>({
    mutationFn: async (input) => {
      const idempotencyKey = crypto.randomUUID();
      const body: CreateReservationBody = {
        outletId: input.outletId,
        category: input.category,
        quantity: input.quantity,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        contactPhone: input.contactPhone,
      };
      const res = await fetch(`${API_BASE}/api/v1/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const code = payload?.error?.code as string | undefined;
        const message =
          payload?.error?.message ?? `Gagal membuat reservasi (HTTP ${res.status}).`;
        throw new ApiError(res.status, code, message);
      }
      return (await res.json()) as CreateReservationResponse;
    },
  });
}
