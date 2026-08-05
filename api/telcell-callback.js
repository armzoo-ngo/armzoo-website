function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === "string") return resolve(req.body);
      if (typeof req.body === "object") {
        return resolve(new URLSearchParams(req.body).toString());
      }
    }

    let body = "";

    req.on("data", chunk => {
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

    const status = data.status || "";
    const paymentId = data.payment_id || "";
    const invoice = data.invoice || "";
    const sum = data.sum || "";
    const currency = data.currency || "";
    const checksum = data.checksum || "";

    console.log("ARMZOO Telcell callback received", {
      receivedAt: new Date().toISOString(),
      status,
      paymentId,
      invoice,
      sum,
      currency,
      checksumExists: Boolean(checksum),
      raw: data
    });

    /*
      IMPORTANT:
      Donation must be marked as PAID only after:
      1. Telcell callback is received,
      2. Telcell checksum/signature is verified,
      3. status is PAID.

      We still need Telcell's exact callback checksum formula.
    */

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("OK");
  } catch (error) {
    console.error("ARMZOO Telcell callback error", error);

    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Callback error");
  }
};
