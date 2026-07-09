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
            totalRate: "${order.totalRate || "0"}"
            billingTerms: "${order.billingTerms || "3"}"
            bookingSource: "3"
            authPABContact: "${order.authPABContact}"
            billTo: "${order.billTo}"
            items: {
              item: {
                stopSequence: "1",
                quantities: {
                  quantity: "${escape(order.quantity || "1")}",
                  quantityUOM: "${escape(order.quantityUOM || "PIECES")}"
                },
                weights: {
                  weight: "${escape(order.weight || "0")}",
                  weightQualifier: "1",
                  weightUOM: "${order.weightUOM || 1}"
                }
              }
            }
            stops: {
              stopCount: "2"
              stop: [
                {
                  stopSequence: "1"
                  stopType: "Pickup"
                  dates: { scheduledDate: "${order.pickup.scheduledDate}" }
                  address: {
                    name: "${escape(order.pickup.address.name)}"
                    addrLine1: "${escape(order.pickup.address.addrLine1)}"
                    city: "${escape(order.pickup.address.city)}"
                    stateProvince: "${escape(order.pickup.address.stateProvince)}"
                    postalCode: "${escape(order.pickup.address.postalCode)}"
                    countryCode: "${escape(order.pickup.address.countryCode)}"
                  }
                }
                {
                  stopSequence: "2"
                  stopType: "drop"
                  dates: { scheduledDate: "${order.drop.scheduledDate}" }
                  address: {
                    name: "${escape(order.drop.address.name)}"
                    addrLine1: "${escape(order.drop.address.addrLine1)}"
                    city: "${escape(order.drop.address.city)}"
                    stateProvince: "${escape(order.drop.address.stateProvince)}"
                    postalCode: "${escape(order.drop.address.postalCode)}"
                    countryCode: "${escape(order.drop.address.countryCode)}"
                  }
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
