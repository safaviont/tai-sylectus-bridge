# Tai (AWOL) <-> Sylectus load-posting bridge

Lets dispatchers flag specific shipments in Tai to be posted to the
Sylectus Load Board, without leaving the TAI screen. Filtered to Sprinter
and Straight Truck equipment only. Writes the Sylectus posting reference
back into Tai so it's visible there too.

## How it works

1. Dispatcher creates/edits a shipment in Tai and adds a reference number
   of type `SYLECTUS` (any value) — that's the "post this one" flag.
2. Tai's `ShipmentDetailUpdateUrl` webhook fires and calls this service.
3. This service checks: right equipment type (Sprinter/Straight Truck),
   flagged with the `SYLECTUS` reference number, and not already posted.
4. If all three pass: calls Sylectus `createOrder`, then `postOrder`.
5. Writes the resulting Sylectus order ID back to Tai via
   `PUT /PublicApi/Loadboard/v2/UpdateFromLoadboard`, and records it
   locally so later edits to the same shipment don't re-post it.

## Setup

```bash
npm install
cp .env.example .env
# fill in .env, then:
npm start
```

Needs to run somewhere Tai can reach over HTTPS (Render, Railway,
Fly.io, a small VM — not your laptop), since Tai calls the webhook
whenever a dispatcher saves a shipment, not on your schedule.

### Configure the Tai side

In the AWOL back-office: `Rates -> Integration Sources -> Add New`.

- **Source Group:** Other
- **Integration Type:** Public API Webhooks
- Set `ShipmentDetailUpdateUrl` to `https://<your-host>/webhooks/tai/shipment-update`
- Set `Authorization` to the same value as `TAI_WEBHOOK_SECRET` in your `.env`
- Link the source to the relevant Organization(s)

## Before this actually works, resolve these:

1. **Confirm `trailerType` enum values.** `ELIGIBLE_TRAILER_TYPES` in
   `mapping.js` currently guesses `"Sprinter"`, `"SmallStraight"`,
   `"LargeStraight"`. Post one test shipment of each type with the
   `SYLECTUS` reference number, check the logged payload (or Tai's
   `WebhookActivityLogs`), and correct the strings if needed.

2. **Fill in `TRAILER_TYPE_TO_VEHICLE_SIZE` in `mapping.js`.** Sylectus's
   `vehicleSize` is a 1-indexed position in *your company's own* custom
   vehicle-size list — look that list up in Sylectus settings.

3. **Fill in `CUSTOMER_CODE_MAP` in `mapping.js`**, OR get the raw
   `address` sub-schema for `createOrder` stops from Sylectus support
   (`sylectus.techsupport@omnitracs.com`) so you can send origin/
   destination addresses directly instead of pre-mapped customer codes.

4. **Get your Sylectus API key upgraded if needed** — the Order
   Management API requires VF or Pro tier.

5. **Get your Tai bearer token and Integration Source ID** — see
   `docs.taicloud.net/docs/obtaining-an-api-key`.

## Notes

- Tai does **not** retry failed webhook deliveries and expects a fast
  `200`. This service acknowledges immediately and does the Sylectus/Tai
  work afterward — a failure after the `200` is silent unless you wire up
  real alerting where the `TODO` is in `server.js`.
- The idempotency store (`postedStore.js`) is a flat JSON file — fine to
  get this working, but swap it for a real database before relying on
  this in production with concurrent traffic.
- Want dispatchers to be able to *un*-post from Tai too? `unpostOrder` is
  already implemented in `sylectusClient.js`; it just isn't wired to a
  route yet. Same pattern — watch for the `SYLECTUS` reference number
  being removed, or add a second trigger reference type like `UNPOST`.
