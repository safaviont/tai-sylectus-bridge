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

  const json = await res.json().catch(() => null);

  if (!res.ok || !json) {
    throw new Error(`Sylectus HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors) {
    throw new Error(`Sylectus GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

/**
 * Creates an order in Sylectus. Returns { orderId, status, errorCode }.
 *
 * NOTE: `order.pickup` / `order.drop` here use `internalCustomerCode`.
 * TODO: confirm the raw `address` sub-schema with Sylectus support
 * (sylectus.techsupport@omnitracs.com) if you don't have pre-mapped
 * Sylectus contact codes for Tai customers/locations. Once confirmed,
 * swap the `internalCustomerCode` lines below for an `address: { ... }`
 * block per stop.
 */
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
            totalRate: "${order.totalRate || "0"}"
            billingTerms: "${order.billingTerms || "3"}"
            bookingSource: "3"
            authPABContact: "${order.authPABContact}"
            billTo: "${order.billTo}"
            stops: {
              stopCount: "2"
              stop: [
                {
                  stopSequence: "1"
                  stopType: "Pickup"
                  internalCustomerCode: "${order.pickup.internalCustomerCode}"
                  dates: { scheduledDate: "${order.pickup.scheduledDate}" }
                }
                {
                  stopSequence: "2"
                  stopType: "drop"
                  internalCustomerCode: "${order.drop.internalCustomerCode}"
                  dates: { scheduledDate: "${order.drop.scheduledDate}" }
                }
              ]
            }
          }
        }
      }
    )
    { OrderID Status ErrorCode }
  }`;

  const data = await callSylectus(query);
  return data.createOrder;
}

/** Posts an already-created order to the Sylectus load board. */
async function postOrder({ corpId, userId, proNumber, post }) {
  const query = `mutation { postOrder
    (
      corpId: ${corpId},
      userId: "${userId}",
      proNumber: ${proNumber},
      postTemplate: {
        currencyType: "${post.currencyType || "U"}",
        expiryDateTime: "${post.expiryDateTime}",
        loadType: ${post.loadType},
        notes: "${escape(post.notes || "")}",
        postingAmount: ${post.postingAmount},
        postToNewAuthority: ${post.postToNewAuthority !== false}
      }
    )
    { OrderID Status ErrorCode }
  }`;

  const data = await callSylectus(query);
  return data.postOrder;
}

/** Removes a posting from the Sylectus load board. */
async function unpostOrder({ corpId, userId, proNumbers }) {
  const list = proNumbers.join(",");
  const query = `mutation { unPostOrder
    ( corpId: ${corpId}, userId: "${userId}", proNumber: [${list}] )
    { OrderID Status ErrorCode }
  }`;
  const data = await callSylectus(query);
  return data.unPostOrder;
}

function escape(str) {
  return String(str).replace(/"/g, '\\"');
}

module.exports = { createOrder, postOrder, unpostOrder };
