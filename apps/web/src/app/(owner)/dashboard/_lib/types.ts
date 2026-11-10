/**
 * Dashboard summary types — mirrors the API response shape from
 * apps/api/src/modules/owner/summary.ts.
 */

export interface BikeStateCounts {
  [state: string]: number;
}

export interface CategorySummary {
  category: string;
  bikesByState: BikeStateCounts;
  heldCount: number;
  confirmedCount: number;
}

export interface OpenRentalRow {
  bikeAssetTag: string;
  renterPhoneMasked: string;
  checkedOutAt: string;
  expectedEndAt: string;
  overdue: boolean;
  escalationStage: number;
}

export interface OutletSummary {
  outletId: string;
  code: string;
  name: string;
  categories: CategorySummary[];
  openRentals: OpenRentalRow[];
  lateReturns: number;
}

export interface DashboardSummary {
  outlets: OutletSummary[];
  grossAccruedIdr: string;
}
