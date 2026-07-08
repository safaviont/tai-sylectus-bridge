const fetch = require("node-fetch");

const SYLECTUS_URL = process.env.SYLECTUS_ORDERS_URL || "https://api.sylectus.com/orders/graphql/";
const API_KEY = process.env.SYLECTUS_API_KEY;

async function callSylectus(query) {
  const res = await fetch(SYLECTUS_URL, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "text/plain",
    },
    body: query,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }

  if (!res.ok) {
    throw new Error(`Sylectus HTTP ${res.status}: ${text}`);
  }
  if (json?.errors) {
    throw new Error(`Sylectus GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json?.data;
}

async function createOrder({ corpId, userId, order }) {
  const query = `mutation { createOrder
    (
      corpId: ${corpId},
      userId: "${userId}",
      orderTemplate: {
        order: {
          shipmentNumber: "${escape(order.shipmentNumber)}"
          refNum1: "${escape(order.refNum1 || "")}",
          equipmentNumber: "${escape(order.equipmentNumber || "")}",
          vehicleSize: ${order.vehicleSize},
          rate: {
            fuelSurchargeRate: "${order.fuelSurchargeRate || "0"}"
            linehaulRate: "${order.linehaulRate || "0"}"
