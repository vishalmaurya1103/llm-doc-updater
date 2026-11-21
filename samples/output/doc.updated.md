# Northwind Cloud Platform: Product Guide

Welcome to Northwind Cloud, a platform designed to enable small and mid-sized teams to deploy data products efficiently without the need to hire a dedicated platform team. This guide provides an overview of our offerings, pricing details, and instructions to get started. We have endeavored to keep it concise and accessible; please proceed at your convenience.

## What Northwind does

Northwind Cloud offers managed pipelines, a hosted data warehouse, and a dashboard builder integrated within a single platform. You connect your data sources, we maintain synchronization, and your team can develop reports seamlessly. There are no servers to babysit, no 3am pages due to a failed cron job.

Most teams are operational within a day. Our onboarding specialists are available for consultations should you require assistance, and we welcome such interactions.

## Pricing

We offer three subscription plans, which you may change at any time. All prices are monthly and denominated in US dollars.

| Plan       | Price per month | Included seats | Data volume |
|------------|-----------------|----------------|-------------|
| Starter    | $54             | 3              | 50 GB       |
| Team       | $219            | 10             | 500 GB      |
| Enterprise | $989            | Unlimited      | 5 TB        |

Additional seats on the Starter and Team plans are available at $15 per seat per month. Should you require increased data capacity, additional storage is priced at $20 per 100 GB beyond your plan's allocation.

Annual payments include a discount equivalent to two months free. For example, the Starter plan costs $539 per year instead of $646.80 when billed monthly.

## Getting started

1. Register at the Northwind console and verify your email address.
2. Create a workspace and invite your colleagues.
3. Connect your initial data source via the Sources tab.
4. Construct a dashboard utilizing one of our starter templates.

These steps typically require approximately twenty minutes to complete.

## Connectors

We support over 120 connectors out of the box, including Postgres, MySQL, Snowflake, Salesforce, HubSpot, Stripe, and Google Analytics. Connectors synchronize every 15 minutes on the Starter plan and every 5 minutes on the Team and Enterprise plans.

If the connector you require is not listed, please contact us. We release new connectors biweekly, and customer requests are prioritized.

## APIs

Northwind provides a REST API that enables automation of all console functionalities. You may create pipelines, trigger synchronizations, manage users, and retrieve query results programmatically.

```bash
curl -H "Authorization: Bearer $NORTHWIND_TOKEN" \
  https://api.northwind.example/v2/pipelines
```

The version 2 API is rate limited to 600 requests per minute per workspace. If this limit is exceeded, please pause and retry after the duration specified in the Retry-After header.

If you are still using version 1, migration is straightforward: replace your API key with a bearer token, update the base URL to /v2, and modify list calls to accommodate pagination. Our migration checklist in the documentation covers all endpoints, and our support team is available to review your integration prior to switching.

## Security and compliance

Your data is encrypted in transit using TLS 1.2 or higher and at rest with AES-256 encryption. We hold SOC 2 Type II certification and conduct annual third-party penetration testing. Enterprise customers may utilize single sign-on via SAML and receive audit logs retained for 365 days.

We do not sell your data and access your workspace only upon your explicit request for support assistance.

## Support

Starter customers receive email support with a response time within 2 business days. Team customers benefit from priority email and chat support, with responses within 8 business hours. Enterprise customers are assigned a dedicated success manager and receive a 1-hour response time for critical issues.

## Frequently asked questions

**Is there a free trial available for Northwind?**
Yes. All plans include a 14-day free trial without requiring a credit card.

**What occurs if I exceed my data volume?**
Notifications are sent at 80% and 100% usage thresholds. Subsequent overage is billed at $20 per 100 GB, consistent with additional storage pricing.

**What is the cost to add a teammate on the Team plan?**
Each additional seat beyond the included 10 costs $15 per month.

**Can I cancel my subscription at any time?**
Yes. Monthly plans may be cancelled at any time, and yearly plans are refunded on a pro rata basis for unused full months.

## Contact

For inquiries regarding this guide, please contact us at hello@northwind.example or via the in-app chat. We welcome your communication and are eager to assist.
