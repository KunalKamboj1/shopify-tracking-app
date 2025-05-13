import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { Page, Layout, Card, Button, Text, Banner } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Check for active subscription
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
  const subscriptions = responseJson.data.currentAppInstallation.activeSubscriptions;
  const hasActiveSubscription = subscriptions.length > 0;

  return json({ hasActiveSubscription });
};

export default function Index() {
  const { hasActiveSubscription } = useLoaderData();
  const submit = useSubmit();

  const handleBillingRedirect = () => {
    submit(null, { method: "get", action: "/app/billing" });
  };

  return (
    <Page>
      <Layout>
        <Layout.Section>
          {!hasActiveSubscription && (
            <Banner
              title="Subscription Required"
              action={{ content: "Choose a Plan", onAction: handleBillingRedirect }}
              status="warning"
            >
              <p>Please select a subscription plan to continue using the app.</p>
            </Banner>
          )}
          <Card>
            <Card.Section>
              <Text variant="headingMd" as="h2">
                Welcome to Your App
              </Text>
              {hasActiveSubscription ? (
                <Text as="p">Your app is ready to use!</Text>
              ) : (
                <Text as="p">Please select a subscription plan to get started.</Text>
              )}
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 