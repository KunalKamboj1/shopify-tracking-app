import shopify, { sessionStorage } from "../shopify.server";
import crypto from "crypto";

function verifyHmac(query, secret) {
  const { hmac, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(",") : rest[key]}`)
    .join("&");
  const generated = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return generated === hmac;
}

export const action = async ({ request }) => {
  try {
    // Log incoming request URL and query params
    console.log("Incoming request URL:", request.url);
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    console.log("Query params:", queryParams);
    const shop = url.searchParams.get("shop");
    const hmac = url.searchParams.get("hmac");

    if (!shop || !hmac) {
      console.log("Missing shop or hmac in query.");
      return new Response(
        JSON.stringify({ message: "Missing shop or hmac in query." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify HMAC
    if (!verifyHmac(queryParams, process.env.SHOPIFY_API_SECRET)) {
      console.log("Invalid HMAC.");
      return new Response(
        JSON.stringify({ message: "Invalid HMAC." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log and parse request body
    const rawBody = await request.text();
    console.log("Request body:", rawBody);
    let orderNumber, email;
    try {
      ({ orderNumber, email } = JSON.parse(rawBody));
    } catch (e) {
      console.log("Failed to parse JSON body.");
      return new Response(
        JSON.stringify({ message: "Invalid JSON body." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("Parsed orderNumber:", orderNumber, "email:", email);

    // Retrieve the session for the shop
    const session = await sessionStorage.findSessionByShop(shop);
    console.log("Session found:", !!session, session);
    if (!session) {
      return new Response(
        JSON.stringify({ message: "Could not find a valid session for this shop. Please reinstall the app." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const admin = shopify.api.admin.createClient({ session });

    // Improved order query: use only order number, strip leading #
    const cleanOrderNumber = orderNumber ? orderNumber.replace(/^#/, "") : "";
    const orderQuery = `name:${cleanOrderNumber}`;
    console.log("Order query:", orderQuery);

    // Query the order using the Admin API
    const response = await admin.graphql(`
      query getOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              email
              fulfillments(first: 10) {
                edges {
                  node {
                    trackingCompany
                    trackingNumber
                    trackingUrl
                  }
                }
              }
            }
          }
        }
      }
    `, {
      variables: {
        query: orderQuery,
      },
    });

    const responseJson = await response.json();
    console.log("Shopify API response:", JSON.stringify(responseJson, null, 2));
    const order = responseJson.data?.orders?.edges[0]?.node;

    if (!order) {
      console.log("Order not found.");
      return new Response(
        JSON.stringify({
          message: "Order not found. Please check your order number.",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const fulfillment = order.fulfillments.edges[0]?.node;
    console.log("Fulfillment:", fulfillment);

    if (!fulfillment) {
      return new Response(
        JSON.stringify({
          message: "Your order has not been dispatched yet.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Your order has been dispatched!",
        trackingInfo: {
          trackingNumber: fulfillment.trackingNumber,
          trackingUrl: fulfillment.trackingUrl,
          trackingCompany: fulfillment.trackingCompany,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error tracking order:", error);
    return new Response(
      JSON.stringify({
        message: "An error occurred while tracking your order. Please try again.",
        error: error?.message || error
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}; 