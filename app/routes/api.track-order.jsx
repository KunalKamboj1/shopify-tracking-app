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
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const hmac = url.searchParams.get("hmac");

  if (!shop || !hmac) {
    return new Response(
      JSON.stringify({ message: "Missing shop or hmac in query." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify HMAC
  if (!verifyHmac(Object.fromEntries(url.searchParams), process.env.SHOPIFY_API_SECRET)) {
    return new Response(
      JSON.stringify({ message: "Invalid HMAC." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const { orderNumber, email } = await request.json();

  // Retrieve the session for the shop
  const session = await sessionStorage.findSessionByShop(shop);
  if (!session) {
    return new Response(
      JSON.stringify({ message: "Could not find a valid session for this shop. Please reinstall the app." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const admin = shopify.api.admin.createClient({
    session,
  });

  try {
    // Query the order using the Admin API
    const response = await admin.graphql(`
      query getOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              email
              fulfillments(first: 1) {
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
        query: `name:${orderNumber} email:${email}`,
      },
    });

    const responseJson = await response.json();
    const order = responseJson.data.orders.edges[0]?.node;

    if (!order) {
      return new Response(
        JSON.stringify({
          message: "Order not found. Please check your order number and email.",
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