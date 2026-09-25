const crypto = require("crypto");

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

function calculateTelcellChecksum(shopKey, callback) {
  const source =
    shopKey +
    callback.invoice +
    callback.issuer_id +
    callback.payment_id +
    callback.currency +
    callback.sum +
    callback.time +
    callback.status;

  return crypto
    .createHash("md5")
    .update(source, "utf8")
    .digest("hex")
    .toLowerCase();
}

function safeChecksumEqual(expected, received) {
  const a = Buffer.from(String(expected || "").toLowerCase());
  const b = Buffer.from(String(received || "").toLowerCase());

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method Not Allowed");
      return;
    }

    const shopKey = process.env.TELCELL_SHOP_KEY;

    if (!shopKey) {
      console.error("TELCELL_SHOP_KEY is missing");

      res.statusCode = 500;
      res.end("Server configuration error");
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

    const requiredFields = [
      "invoice",
      "issuer_id",
      "payment_id",
      "currency",
      "sum",
      "time",
      "status",
      "checksum"
    ];

    const missingFields = requiredFields.filter(
      (field) => !callback[field]
    );

    if (missingFields.length > 0) {
      console.warn("Telcell callback missing fields", missingFields);

      res.statusCode = 400;
      res.end("Invalid callback");
      return;
    }

    const expectedChecksum = calculateTelcellChecksum(
      shopKey,
      callback
    );

    const checksumValid = safeChecksumEqual(
      expectedChecksum,
      callback.checksum
    );

    if (!checksumValid) {
      console.warn("Invalid Telcell callback checksum", {
        invoice: callback.invoice,
        payment_id: callback.payment_id
      });

      res.statusCode = 403;
      res.end("Invalid checksum");
      return;
    }

    const isPaid = callback.status === "PAID";
    const isRejected = callback.status === "REJECTED";

    console.log("ARMZOO verified Telcell callback", {
      receivedAt: new Date().toISOString(),
      invoice: callback.invoice,
      issuer_id: callback.issuer_id,
      payment_id: callback.payment_id,
      currency: callback.currency,
      sum: callback.sum,
      time: callback.time,
      status: callback.status,
      checksumValid: true
    });

    if (isPaid) {
      /*
       * VERIFIED TELCELL PAYMENT
       *
       * Next production step:
       * verify issuer_id + amount against the donation
       * originally created by ARMZOO.
       *
       * Only after that should the donation be stored
       * as confirmed/PAID.
       */

      console.log("TELCELL_PAYMENT_VERIFIED", {
        invoice: callback.invoice,
        issuer_id: callback.issuer_id,
        payment_id: callback.payment_id,
        sum: callback.sum,
        currency: callback.currency
      });
    }

    if (isRejected) {
      console.log("TELCELL_PAYMENT_REJECTED", {
        invoice: callback.invoice,
        issuer_id: callback.issuer_id,
        payment_id: callback.payment_id
      });
    }

    if (!isPaid && !isRejected) {
      console.warn("Unknown Telcell payment status", {
        status: callback.status
      });
    }

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
