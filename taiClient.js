const fetch = require("node-fetch");

const BASE_URL = (process.env.TAI_TMS_BASE_URL || "").replace(/\/$/, "");
const TOKEN = process.env.TAI_API_TOKEN;
const INTEGRATION_SOURCE_ID = process.env.TAI_INTEGRATION_SOURCE_ID;

/**
 * Writes the Sylectus posting reference number back onto the Tai shipment,
 * closing the loop so dispatchers see it in the Truckload Volume Quoting
 * page's Load Board section.
 */
async function updateFromLoadboard({ shipmentId, referenceNumber }) {
  const res = await fetch(`${BASE_URL}/PublicApi/Loadboard/v2/UpdateFromLoadboard`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      integrationSourceId: Number(INTEGRATION_SOURCE_ID),
      shipmentId: Number(shipmentId),
      referenceNumber: String(referenceNumber),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tai UpdateFromLoadboard HTTP ${res.status}: ${text}`);
  }
  return true;
}

module.exports = { updateFromLoadboard };
