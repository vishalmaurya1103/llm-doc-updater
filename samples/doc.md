# Northwind Cloud Platform: Product Guide

Welcome to Northwind Cloud, the platform that helps small and mid-sized teams ship data products without hiring a whole platform team. This guide walks you through what we offer, how much it costs, and how to get going. We've tried to keep it short and friendly, so grab a coffee and dive in.

## What Northwind does

Northwind gives you managed pipelines, a hosted warehouse, and a dashboard builder in one place. You connect your sources, we keep them in sync, and your team builds reports on top. No servers to babysit, no 3am pages because a cron job died.

Most teams are up and running in under a day. Our onboarding folks will happily hop on a call if you get stuck, and honestly, we kind of love those calls.

## Pricing

We've got three plans, and you can switch between them whenever you like. All prices are per month and billed in US dollars.

| Plan       | Price per month | Included seats | Data volume |
|------------|-----------------|----------------|-------------|
| Starter    | $49             | 3              | 50 GB       |
| Team       | $199            | 10             | 500 GB      |
| Enterprise | $899            | Unlimited      | 5 TB        |

Extra seats on Starter and Team cost $15 per seat per month. Need more data? Additional storage is $20 for every 100 GB beyond your plan's allowance.

If you pay yearly, you get two months free. So Starter works out to $490 a year instead of $588.

## Getting started

1. Sign up at the Northwind console and verify your email.
2. Create a workspace and invite your teammates.
3. Connect your first data source from the Sources tab.
4. Build a dashboard using one of our starter templates.

That's it! Most folks finish these steps in about twenty minutes.

## Connectors

We support more than 120 connectors out of the box, including Postgres, MySQL, Snowflake, Salesforce, HubSpot, Stripe, and Google Analytics. Connectors sync every 15 minutes on Starter and every 5 minutes on Team and Enterprise.

If a connector you need isn't on the list, drop us a line. We ship new ones every couple of weeks and customer requests jump to the front of the queue.

## APIs

Northwind exposes a REST API for automating everything you can do in the console. You can create pipelines, trigger syncs, manage users, and pull query results programmatically.

```bash
curl -H "Authorization: Bearer $NORTHWIND_TOKEN" \
  https://api.northwind.example/v2/pipelines
```

The v2 API is rate limited to 600 requests per minute per workspace. If you hit the limit, back off and retry after the number of seconds in the Retry-After header.

The legacy v1 API is still around for older integrations. It uses API keys passed as query parameters, doesn't support pagination, and only covers pipelines and syncs. It's slower than v2 and we don't add new features to it anymore.

If you're still on v1, migrating is pretty painless: swap your API key for a bearer token, update the base URL to /v2, and adjust any list calls to handle pagination. Our migration checklist in the docs covers every endpoint, and the support team can review your integration before you switch.

## Security and compliance

Your data is encrypted in transit with TLS 1.2+ and at rest with AES-256. We're SOC 2 Type II certified and run annual third-party penetration tests. Enterprise customers can also use single sign-on through SAML and get audit logs retained for 365 days.

We never sell your data, and we only access your workspace when you explicitly ask support for help.

## Support

Starter customers get email support with a response within 2 business days. Team customers get priority email and chat, with responses within 8 business hours. Enterprise customers get a dedicated success manager and a 1-hour response time for critical issues, around the clock.

## Frequently asked questions

**Can I try Northwind for free?**
Yep! Every plan comes with a 14-day free trial, no credit card needed.

**What happens if I go over my data volume?**
We'll send you a heads-up at 80% and 100%. After that, overage is billed at $20 per 100 GB, same as buying extra storage.

**How much does it cost to add a teammate on the Team plan?**
Each extra seat beyond the included 10 is $15 per month.

**Can I cancel anytime?**
Of course. Monthly plans can be cancelled whenever you want, and yearly plans are refunded pro rata for unused full months.

## Contact

Questions about anything in this guide? Email hello@northwind.example or ping us in the in-app chat. We're a friendly bunch and we'd love to hear from you.
