require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const { mapShipmentToSylectusOrder, isEligibleForSylectus } = require("./mapping");
const sylectus = require("./sylectusClient");
const tai = require("./taiClient");
const postedStore = require("./postedStore");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  console.log(`Incoming: ${req.method} ${req.path} | Authorization header: "${req.headers["authorization"]}"`);
  next();
});

function requireAuth(req, res, next) {
  const expected = process.env.TAI_WEBHOOK_SECRET;
  const got = req.headers["authorization"];
  if (!expected || got !== expected) {
    console.log(`Rejected: expected "${expected}" but got "${got}"`);
    return res.status(401).send("Unauthorized");
  }
  next();
}

app.post("/webhooks/tai/shipment-update", requireAuth, async (req, res) => {
  res.status(200).send("received");

  const shipment = req.body;
  console.log(`Tai shipment-update payload for shipment ${shipment?.shipmentId}:`, JSON.stringify(shipment, null, 2));

  try {
    if (!isEligibleForSylectus(shipment)) {
      console.log(
        `Shipment ${shipment.shipmentId} skipped -- trailerType is "${shipment.trailerType}", ` +
          `reference numbers: ${JSON.stringify(shipment.shipmentReferenceNumbers)}`
      );
      return;
    }

    if (postedStore.alreadyPosted(shipment.shipmentId)) {
      return;
    }

    const { order, post } = mapShipmentToSylectusOrder(shipment, {
      defaultLoadType: Number(process.env.DEFAULT_SYLECTUS_LOAD_TYPE || 20),
      defaultExpiryHours: Number(process.env.DEFAULT_POST_EXPIRY_HOURS || 24),
    });

    const created = await sylectus.createOrder({
      corpId: process.env.SYLECTUS_CORP_ID,
      userId: process.env.SYLECTUS_USER_ID,
      order,
    });

    if (created.ErrorCode !== 0) {
      throw new Error(`createOrder failed: ${created.Status}`);
    }

    const posted = await sylectus.postOrder({
      corpId: process.env.SYLECTUS_CORP_ID,
      userId: process.env.SYLECTUS_USER_ID,
      proNumber: created.OrderID,
      post,
    });

    if (posted.ErrorCode !== 0) {
      throw new Error(`postOrder failed: ${posted.Status}`);
    }

    await tai.updateFromLoadboard({
      shipmentId: shipment.shipmentId,
      referenceNumber: created.OrderID,
    });

    postedStore.markPosted(shipment.shipmentId, created.OrderID);

    console.log(
      `Shipment ${shipment.shipmentId} -> Sylectus order ${created.OrderID} posted and reference written back to Tai.`
    );
  } catch (err) {
    console.error(`Failed to bridge shipment ${shipment?.shipmentId} to Sylectus:`, err.message);
  }
});

app.get("/health", (req, res) => res.send("ok"));

app.get("/whoami", async (req, res) => {
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipJson = await ipRes.json();
    res.json({ outboundIp: ipJson.ip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/test-sylectus", async (req, res) => {
  const query = `mutation { createOrder
    (
      corpId: 15464,
      userId: "AWOL",
      orderTemplate: {
        order: {
          shipmentNumber: "render-diagnostic-test"
          equipmentNumber: "TRACTOR",
          vehicleSize: 3,
          rate: {
            fuelSurchargeRate: "50"
            linehaulRate: "150"
            totalRate: "200"
            billingTerms: "3"
            bookingSource: "3"
            authPABContact: "207131"
            billTo: "562249"
            items: {
              item: {
                stopSequence: "1",
                quantities: { quantity: "3", quantityUOM: "4" },
                weights: { weight: "500", weightUOM: "1" }
              }
            }
            stops: {
              stopCount: "2"
              stop: [
                {
                  stopSequence: "1"
                  stopType: "Pickup"
                  dates: { scheduledDate: "2026-07-24T10:00:00Z" }
                  address: { name: "Ford Company XYZ" addrLine1: "123 Main Street" postalCode: "48309" }
                }
                {
                  stopSequence: "2"
                  stopType: "drop"
                  dates: { scheduledDate: "2026-07-24T14:00:00Z" }
                  address: { name: "Ford Company ABC" addrLine1: "333 Main Street" city: "Daallas" stateProvince: "TX" postalCode: "" countryCode: "USA" }
                }
              ]
            }
          }
        }
      }
    )
    { OrderID Status ErrorCode }
  }`;

  try {
    const fetchRes = await fetch(process.env.SYLECTUS_ORDERS_URL || "https://api.sylectus.com/orders/graphql/", {
      method: "POST",
      headers: {
        "x-api-key": process.env.SYLECTUS_API_KEY,
        "Content-Type": "text/plain",
        "User-Agent": "TaiSylectusBridge/1.0 (+https://tai-sylectus-bridge.onrender.com)",
        "Accept": "*/*",
      },
      body: query,
    });
    const text = await fetchRes.text();
    res.json({ status: fetchRes.status, body: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Tai <-> Sylectus bridge listening on port ${PORT}`);
});
