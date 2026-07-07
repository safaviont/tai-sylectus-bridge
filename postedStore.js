const fs = require("fs");
const path = require("path");

// Simple starter persistence so a re-delivered or later, unrelated
// webhook for the same shipment doesn't post it to Sylectus twice.
// TODO: swap this for a real database (Postgres/Redis/etc.) before
// running this in production -- a JSON file is fine for getting the
// integration working, not for concurrent production traffic.
const STORE_PATH = path.join(__dirname, "posted-shipments.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function alreadyPosted(shipmentId) {
  const store = load();
  return Boolean(store[shipmentId]);
}

function markPosted(shipmentId, sylectusOrderId) {
  const store = load();
  store[shipmentId] = { sylectusOrderId, postedAt: new Date().toISOString() };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

module.exports = { alreadyPosted, markPosted };
