function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === "string") {
        return resolve(req.body);
      }

      if (typeof req.body === "object") {
        return resolve(new URLSearchParams(req.body).toString());
      }
    }

    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseFormBody(body) {
  const params = new URLSearchParams(body);
  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method Not Allowed");
      return;
    }

    const rawBody = await readRawBody(req);
    const data = parseFormBody(rawBody);

    const callback = {
      invoice: data.invoice || "",
      issuer_id: data.issuer_id || "",
      payment_id: data.payment_id || "",
      currency: data.currency || "",
      sum: data.sum || "",
      time: data.time || "",
      status: normalizeStatus(data.status),
      checksum: data.checksum || ""
    };

    const isPaid = callback.status === "PAID";
    const isRejected = callback.status === "REJECTED";

    console.log("ARMZOO Telcell callback received", {
      receivedAt: new Date().toISOString(),
      invoice: callback.invoice,
      issuer_id: callback.issuer_id,
      payment_id: callback.payment_id,
      currency: callback.currency,
      sum: callback.sum,
      time: callback.time,
      status: callback.status,
      checksumExists: Boolean(callback.checksum),
      interpretedStatus: isPaid ? "PAID" : isRejected ? "REJECTED" : "UNKNOWN",
      raw: data
    });

    /*
      IMPORTANT PRODUCTION RULE:

      Telcell callback is received here.

      Current known fields:
      invoice
      issuer_id
      payment_id
      currency
      sum
      time
      status
      checksum

      Known statuses:
      PAID
      REJECTED

      We still need Telcell's exact checksum/signature verification formula.

      Until checksum is verified, do NOT automatically mark a donation as confirmed/PAID
      in a database or accounting system.

      Correct final rule will be:
      1. status === "PAID"
      2. checksum/signature is valid
      3. amount and invoice match our expected donation
      => then mark donation as PAID
    */

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("OK");
  } catch (error) {
    console.error("ARMZOO Telcell callback error", {
      receivedAt: new Date().toISOString(),
      message: error.message
    });

    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Callback error");
  }
};
