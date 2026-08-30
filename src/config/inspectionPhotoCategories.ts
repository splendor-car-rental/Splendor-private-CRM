import type { InspectionPhotoCategory, InspectionType } from '../types';

/**
 * Which photo categories are required to COMPLETE an inspection of a given
 * type. Configurable in one place rather than hardcoded into validation
 * logic scattered across routes -- change this file, not the route code,
 * to adjust what's required. Snapshotted onto each VehicleInspection at
 * creation time (see src/server/vehicleInspections.ts) so a later change
 * here never silently changes what an already-created inspection needs.
 *
 * 'in_rental' (a spot-check during an active rental, e.g. responding to a
 * customer report) intentionally requires only 'damage' -- there's no
 * reason to demand a full 8-angle walk-around for a single reported issue.
 */
export const REQUIRED_PHOTO_CATEGORIES_BY_TYPE: Record<InspectionType, InspectionPhotoCategory[]> = {
  pre_delivery: ['front', 'rear', 'left', 'right', 'interior', 'dashboard_odometer', 'fuel_gauge'],
  handover: ['front', 'rear', 'left', 'right', 'interior', 'dashboard_odometer', 'fuel_gauge'],
  in_rental: ['damage'],
  return: ['front', 'rear', 'left', 'right', 'interior', 'dashboard_odometer', 'fuel_gauge'],
  post_return: ['dashboard_odometer']
};

export const ALL_INSPECTION_PHOTO_CATEGORIES: InspectionPhotoCategory[] = [
  'front', 'rear', 'left', 'right', 'interior', 'dashboard_odometer', 'fuel_gauge', 'damage', 'other'
];

/** Whether completing this inspection type is blocked until customerAcknowledgement is recorded -- a customer isn't present for a pre_delivery check or an in-rental spot-check, so there's no one to acknowledge it. */
export const REQUIRES_CUSTOMER_ACKNOWLEDGEMENT: Record<InspectionType, boolean> = {
  pre_delivery: false,
  handover: true,
  in_rental: false,
  return: true,
  post_return: false
};
