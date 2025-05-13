import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Button, Text, Banner } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get current subscription status
  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          name
          status
          trialDays
          currentPeriodEnd
        }
      }
    }
  `);

  const responseJson = await response.json();
  return json({
    subscriptions: responseJson.data.currentAppInstallation.activeSubscriptions,
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan");

  const plans = {
    setup: {
      name: "One-Time Setup",
      price: 100,
      isOneTime: true,
    },
    basic: {
      name: "Basic Plan",
      price: 10,
      interval: "EVERY_30_DAYS",
    },
    standard: {
      name: "Standard Plan",
      price: 20,
      interval: "EVERY_30_DAYS",
    },
    premium: {
      name: "Premium Plan",
      price: 60,
      interval: "EVERY_30_DAYS",
    },
  };

  const selectedPlan = plans[plan];

  const response = await admin.graphql(`
    mutation CreateSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        trialDays: $trialDays
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      name: selectedPlan.name,
      lineItems: [
        {
          plan: selectedPlan.isOneTime ? {
            appOneTimePricingDetails: {
              price: { amount: selectedPlan.price, currencyCode: "USD" },
            },
          } : {
            appRecurringPricingDetails: {
              price: { amount: selectedPlan.price, currencyCode: "USD" },
              interval: selectedPlan.interval,
            },
          },
        },
      ],
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
      trialDays: selectedPlan.isOneTime ? 0 : 1,
    },
  });

  const responseJson = await response.json();
  const confirmationUrl = responseJson.data.appSubscriptionCreate.confirmationUrl;

  return json({ confirmationUrl });
};

export default function Billing() {
  const { subscriptions } = useLoaderData();
  const hasActiveSubscription = subscriptions.length > 0;

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <Text variant="headingMd" as="h2">
                Subscription Plans
              </Text>
              {hasActiveSubscription ? (
                <Banner status="success">
                  <p>You have an active subscription plan.</p>
                </Banner>
              ) : (
                <div style={{ marginTop: "1rem" }}>
                  <form method="post">
                    <div style={{ marginBottom: "1rem" }}>
                      <Button submit name="plan" value="setup">
                        One-Time Setup - $100
                      </Button>
                    </div>
                    <div style={{ marginBottom: "1rem" }}>
                      <Button submit name="plan" value="basic">
                        Basic Plan - $10/month
                      </Button>
                    </div>
                    <div style={{ marginBottom: "1rem" }}>
                      <Button submit name="plan" value="standard">
                        Standard Plan - $20/month
                      </Button>
                    </div>
                    <div>
                      <Button submit name="plan" value="premium">
                        Premium Plan - $60/month
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 