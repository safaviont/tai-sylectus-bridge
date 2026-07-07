/**
 * Field mapping between Tai's `ShipmentDetails` webhook payload (v3, the
 * default) and the inputs Sylectus's `createOrder` / `postOrder` mutations
 * expect.
 */

const VEHICLE_SIZE_KEYWORDS = [
  { keyword: "Sprinter", vehicleSize: 1 }, // Cargo Van
  { keyword: "Cargo Van", vehicleSize: 1 },
  { keyword: "Small Straight", vehicleSize: 2 },
  { keyword: "Large Straight", vehicleSize: 3 },
  { keyword: "Tractor", vehicleSize: 4 },
  { keyword: "Flatbed", vehicleSize: 5 },
];

function getVehicleSize(trailerType) {
  const type = trailerType || "";
  const match = VEHICLE_SIZE_KEYWORDS.find((v) => type.toLowerCase().includes(v.keyword.toLowerCase()));
  return match?.vehicleSize;
}

const LOAD_TYPE_KEYWORDS = [
  { keyword: "Sprinter", loadType: 150 },
  { keyword: "Small Straight", loadType: 70 },
  { keyword: "Large Straight", loadType: 80 },
  { keyword: "Flatbed", loadType: 50 },
  { keyword: "Reefer", loadType: 60 },
];

function getLoadType(trailerType, defaultLoadType) {
  const type = trailerType || "";
  const match = LOAD_TYPE_KEYWORDS.find((v) => type.toLowerCase().includes(v.keyword.toLowerCase()));
  return match?.loadType || defaultLoadType;
}

const CUSTOMER_CODE_MAP = {
  // [Tai organizationId]: "sylectusInternalCustomerCode"
};

const ELIGIBLE_TRAILER_KEYWORDS = ["Sprinter", "Straight"];

const TRIGGER_KEYWORD = process.env.TRIGGER_REFERENCE_TYPE || "SYLECTUS";

function isEligibleForSylectus(shipment) {
  const trailerType = shipment.trailerType || "";
  const rightEquipment = ELIGIBLE_TRAILER_KEYWORDS.some((kw) =>
    trailerType.toLowerCase().includes(kw.toLowerCase())
  );
  const flagged = (shipment.shipmentReferenceNumbers || []).some((ref) =>
    (ref.value || "").toUpperCase().includes(TRIGGER_KEYWORD.toUpperCase())
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

  const vehicleSize = getVehicleSize(shipment.trailerType);
  if (!vehicleSize) {
    throw new Error(
      `No Sylectus vehicleSize mapped for trailerType "${shipment.trailerType}". ` +
        `Add it to VEHICLE_SIZE_KEYWORDS in mapping.js.`
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

  const loadType = getLoadType(shipment.trailerType, defaultLoadType);

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
