const SMALL_STRAIGHT_MAX_FEET = 16;

function classifyTrailer(trailerType) {
  const type = trailerType || "";
  const lower = type.toLowerCase();

  if (lower.includes("sprinter") || lower.includes("cargo van")) {
    return { vehicleSize: 1, loadType: 150 };
  }
  if (lower.includes("straight")) {
    const feetMatch = type.match(/(\d+)\s*ft/i);
    const feet = feetMatch ? parseInt(feetMatch[1], 10) : null;
    if (feet !== null && feet <= SMALL_STRAIGHT_MAX_FEET) {
      return { vehicleSize: 2, loadType: 70 };
    }
    return { vehicleSize: 3, loadType: 80 };
  }
  if (lower.includes("tractor")) {
    return { vehicleSize: 4, loadType: 20 };
  }
  if (lower.includes("flatbed")) {
    return { vehicleSize: 5, loadType: 50 };
  }
  if (lower.includes("reefer")) {
    return { vehicleSize: null, loadType: 60 };
  }
  return { vehicleSize: null, loadType: null };
}

function getVehicleSize(trailerType) {
  return classifyTrailer(trailerType).vehicleSize;
}

function getLoadType(trailerType, defaultLoadType) {
  return classifyTrailer(trailerType).loadType || defaultLoadType;
}

const BILLING_CONTACT_CODE = process.env.SYLECTUS_BILLING_CONTACT_CODE || "REPLACE_WITH_PLG_CODE";

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

const MAX_WEIGHT_BY_VEHICLE_SIZE = {
  1: 4000,
  2: 10000,
  3: 26000,
};

function mapShipmentToSylectusOrder(shipment, { defaultLoadType, defaultExpiryHours }) {
  const pickup = shipment.stops.find((s) => s.stopType === "First Pickup");
  const delivery = shipment.stops.find((s) => s.stopType === "Last Drop");

  if (!pickup || !delivery) {
    throw new Error(`Shipment ${shipment.shipmentId} is missing a Pickup or Delivery stop`);
  }

  const vehicleSize = getVehicleSize(shipment.trailerType);
  if (!vehicleSize) {
    throw new Error(
      `No Sylectus vehicleSize mapped for trailerType "${shipment.trailerType}". ` +
        `Add it to classifyTrailer() in mapping.js.`
    );
  }

  const totalWeight = (shipment.commodities || []).reduce((sum, c) => sum + (c.weightTotal || 0), 0);
  const totalPieces = (shipment.commodities || []).reduce((sum, c) => sum + (c.piecesTotal || 0), 0);
  const weightUOM = (shipment.weightUnits || "").toLowerCase() === "kg" ? 2 : 1;
  const quantityUOM = process.env.SYLECTUS_DEFAULT_QUANTITY_UOM || "4";

  const maxExpected = MAX_WEIGHT_BY_VEHICLE_SIZE[vehicleSize];
  if (maxExpected && totalWeight > maxExpected) {
    console.warn(
      `Shipment ${shipment.shipmentId}: weight ${totalWeight} lbs looks high for trailerType ` +
        `"${shipment.trailerType}" (vehicleSize ${vehicleSize}, expected under ~${maxExpected} lbs). ` +
        `Posting anyway -- double check this one manually.`
    );
  }

  const toAddress = (stop) => ({
    name: stop.companyName || "",
    addrLine1: stop.streetAddress || "",
    city: stop.city || "",
    stateProvince: stop.state || "",
    postalCode: stop.zipCode || "",
    countryCode: stop.country || "USA",
  });

  const toSylectusDate = (isoString) => {
    if (!isoString) return isoString;
    return new Date(isoString).toISOString().replace(/\.\d+Z$/, "Z");
  };

  const order = {
    shipmentNumber: String(shipment.shipmentId),
    refNum1: shipment.shipmentReferenceNumbers?.[0]?.value || "",
    equipmentNumber: "",
    vehicleSize,
    quantity: String(totalPieces || 1),
    quantityUOM,
    weight: String(totalWeight || 0),
    weightUOM,
    linehaulRate: String(shipment.totalSell ?? 0),
    fuelSurchargeRate: "0",
    totalRate: String(shipment.totalSell ?? 0),
    billingTerms: "3",
    authPABContact: BILLING_CONTACT_CODE,
    billTo: BILLING_CONTACT_CODE,
    pickup: {
      address: toAddress(pickup),
      scheduledDate: toSylectusDate(pickup.appointmentReadyDateTime || pickup.estimatedReadyDateTime),
    },
    drop: {
      address: toAddress(delivery),
      scheduledDate: toSylectusDate(delivery.appointmentReadyDateTime || delivery.estimatedReadyDateTime),
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
