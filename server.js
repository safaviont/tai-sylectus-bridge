require("dotenv").config();
const express = require("express");
const { mapShipmentToSylectusOrder, isEligibleForSylectus } = require("./mapping");
const sylectus = require("./sylectusClient");
const tai = require("./taiClient");
const postedStore = require("./postedStore");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

function requireAuth(req, res, next) {
  const expected = process.env.TAI_WEBHOOK_SECRET;
  const got = req.headers["authorization"];
  if (!expected || got !== expected) {
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

app.listen(PORT, () => {
  console.log(`Tai <-> Sylectus bridge listening on port ${PORT}`);
});
