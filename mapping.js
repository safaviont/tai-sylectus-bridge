/**
 * Field mapping between Tai's `ShipmentDetails` webhook payload (v3, the
 * default) and the inputs Sylectus's `createOrder` / `postOrder` mutations
 * expect.
 *
 * Two things you MUST fill in before this works end-to-end — both are
 * business configuration, not code, so they live in the tables below:
 *
 * 1. TRAILER_TYPE_TO_VEHICLE_SIZE — Sylectus's `vehicleSize` is an integer
 *    index into *your company's own* custom vehicle-size list (1 = first
 *    item in your list, 2 = second, etc). Only you can look that list up
 *    in Sylectus (Settings) and fill in the mapping from Tai's
 *    `trailerType` enum values.
 *
 * 2. CUSTOMER_CODE_MAP — createOrder's stops need a Sylectus
 *    `internalCustomerCode` (pabcode), which is Sylectus-internal and has
 *    no equivalent in Tai's payload. Populate this by matching Tai
 *    `organizationId` -> Sylectus pabcode for your regular customers, OR
 *    switch to raw `address` stops once you confirm that sub-schema with
 *    Sylectus support (see sylectusClient.js TODO).
 */

const TRAILER_TYPE_TO_VEHICLE_SIZE = {
  // "DryVan": 1,
  // "Flatbed": 2,
  // "Reefer": 3,
  // TODO: fill in from your Sylectus vehicle-size list
};

const LOAD_TYPE_MAP = {
  // Tai shipmentType/trailerType -> Sylectus postOrder loadType code
  LTL: 30,
  TL: 20,
  Reefer: 60,
  Flatbed: 50,
  CargoVan: 140,
  Sprinter: 150,
};

const CUSTOMER_CODE_MAP = {
  // [Tai organizationId]: "sylectusInternalCustomerCode"
};

// Only these Tai `trailerType` values are eligible for Sylectus posting.
// TODO: confirm the exact enum strings Tai sends -- these are best
// guesses based on Tai's naming conventions (e.g. "DryVan", "Reefer").
// Check a real ShipmentDetailUpdateUrl payload for a Sprinter/Straight
// Truck load and adjust if these don't match.
const ELIGIBLE_TRAILER_TYPES = ["Sprinter", "SmallStraight", "LargeStraight"];

// The dispatcher flags a shipment as "post this to Sylectus" by adding a
// reference number of this type (any value) in Tai. Change this to
// whatever reference type name is easiest for your dispatchers to use.
const TRIGGER_REFERENCE_TYPE = process.env.TRIGGER_REFERENCE_TYPE || "SYLECTUS";

/**
 * Returns true if this shipment should be posted to Sylectus: right
 * equipment type AND the dispatcher has flagged it via reference number.
 */
function isEligibleForSylectus(shipment) {
  const rightEquipment = ELIGIBLE_TRAILER_TYPES.includes(shipment.trailerType);
  const flagged = (shipment.shipmentReferenceNumbers || []).some(
    (ref) => ref.referenceType?.toUpperCase() === TRIGGER_REFERENCE_TYPE.toUpperCase()
  );
  return rightEquipment && flagged;
}

function mapShipmentToSylectusOrder(shipment, { defaultLoadType, defaultExpiryHours }) {
  const pickup = shipment.stops.find((s) => s.stopType === "Pickup");
  const delivery = shipment.stops.find((s) => s.stopType === "Delivery");

  if (!pickup || !delivery) {
    throw new Error(`Shipment ${shipment.shipmentId} is missing a Pickup or Delivery stop`);
  }

  const pickupCode = CUSTOMER_CODE_MAP[shipment.payerOrganization?.organizationId];
  const dropCode = CUSTOMER_CODE_MAP[shipment.payerOrganization?.organizationId];
  if (!pickupCode || !dropCode) {
    throw new Error(
      `No Sylectus customer code mapped for organizationId ${shipment.payerOrganization?.organizationId}. ` +
        `Add it to CUSTOMER_CODE_MAP in mapping.js, or switch to raw address stops.`
    );
  }

  const vehicleSize = TRAILER_TYPE_TO_VEHICLE_SIZE[shipment.trailerType];
  if (!vehicleSize) {
    throw new Error(
      `No Sylectus vehicleSize mapped for trailerType "${shipment.trailerType}". ` +
        `Add it to TRAILER_TYPE_TO_VEHICLE_SIZE in mapping.js.`
    );
  }

  const order = {
    shipmentNumber: String(shipment.shipmentId),
    refNum1: shipment.shipmentReferenceNumbers?.[0]?.value || "",
    equipmentNumber: "",
    vehicleSize,
    linehaulRate: String(shipment.totalSell ?? 0),
    fuelSurchargeRate: "0",
    totalRate: String(shipment.totalSell ?? 0),
    billingTerms: "3",
    authPABContact: pickupCode,
    billTo: pickupCode,
    pickup: {
      internalCustomerCode: pickupCode,
      scheduledDate: pickup.appointmentReadyDateTime || pickup.estimatedReadyDateTime,
    },
    drop: {
      internalCustomerCode: dropCode,
      scheduledDate: delivery.appointmentReadyDateTime || delivery.estimatedReadyDateTime,
    },
  };

  const loadType = LOAD_TYPE_MAP[shipment.trailerType] || LOAD_TYPE_MAP[shipment.shipmentType] || defaultLoadType;

  const expiry = new Date(Date.now() + defaultExpiryHours * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "Z");

  const post = {
    currencyType: "U",
    expiryDateTime: expiry,
    loadType,
    notes: "",
    postingAmount: Number(shipment.totalSell ?? 0),
    postToNewAuthority: true,
  };

  return { order, post };
}

module.exports = { mapShipmentToSylectusOrder, isEligibleForSylectus };
