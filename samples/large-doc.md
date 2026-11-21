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

## Data modeling best practices in the Northwind warehouse

When working with the Northwind Cloud data platform, building efficient and scalable data models is key to unlocking the full power of your data warehouse. Whether you’re just starting your data journey or looking to optimize an existing data ecosystem, following best practices can help you design models that are easy to maintain, performant, and perfectly suited for your business questions.

In this guide, we’ll walk through some practical tips and strategies for data modeling in the Northwind warehouse, share approaches to organizing your data, and highlight techniques to keep your models clean and effective.

### Understanding the Northwind data landscape

The Northwind dataset is a classic example often used for demos and learning, featuring tables like Customers, Orders, Products, Employees, and Categories. When building models on top of these, it’s important to grasp the relationships and business logic behind the data.

Northwind is inherently relational:
- Customers place Orders.
- Orders contain multiple Order Details (line items).
- Products belong to Categories and are supplied by Suppliers.
- Employees process Orders and manage territories.

This structure makes it a great playground for applying dimensional modeling techniques like star schemas, which are designed to simplify querying and reporting.

### Use star schemas for simplified querying

One of the foundational principles of good data modeling in analytics is to separate business metrics and measures into a **fact table**, surrounded by descriptive **dimension tables**. Northwind’s data naturally lends itself to a star schema design, which enhances performance and usability.

- **Fact table**: Usually your Orders or Order Details table, where numeric measurements like quantity, price, and discount live.
- **Dimension tables**: Customers, Products, Categories, Employees, and Territories that provide context for analysis.

For example:
- **Fact_Orders**: order_id, order_date, customer_id, employee_id, ship_via, freight, total_amount.
- **Dim_Customers**: customer_id, customer_name, contact_name, city, country.
- **Dim_Products**: product_id, product_name, category_id, supplier_id, unit_price.
- **Dim_Employees**: employee_id, first_name, last_name, title, region.

By using surrogate keys (simple numeric IDs) and keeping descriptive attributes in dimension tables, the fact table remains lean and efficient for aggregations. This also makes SQL queries easier to write and faster to execute.

### Normalize thoughtfully but avoid overcomplication

While normalization is important to reduce redundancy, over-normalizing your data can lead to complicated joins that hurt query performance. For reporting and analytics especially in a cloud warehouse, a lightly normalized star schema often works better.

In Northwind Cloud, aim to:
- Keep dimension tables denormalized where it makes sense. For example, a product dimension can include category name and supplier name instead of just IDs, to reduce the number of joins.
- Use normalized tables primarily for transactional or operational systems rather than analytics layers.
- Leverage Northwind’s ability to handle moderately wide tables efficiently, which can simplify your data model.

### Leverage derived columns and calculated measures

Northwind includes rich transactional data, making it a great candidate for enriching your models with calculated fields and derived metrics—directly inside the warehouse. Adding these as model-level columns helps keep your reporting clean and consistent.

Common examples:
- **Total order amount** = quantity * unit_price * (1 - discount)
- **Order year/month**: extracted from order_date for time-based aggregation.
- **Customer lifetime value (CLV)**: aggregate sales per customer over time.

Northwind Cloud supports easy creation of such fields using familiar SQL expressions or through modeling layers, enabling faster, accurate analytics without moving your data out or running costly transformations externally.

### Organize your models for collaboration and reuse

In a team environment, clear organization and naming conventions go a long way toward making data models easy to find, understand, and maintain.

Here are a few tips:
- Use a consistent prefix or namespace for your Northwind models (e.g., `nw_` or `northwind_`).
- Group related models in folders or projects within Northwind Cloud’s workspace.
- Document your key models with descriptions outlining business purpose and main metrics.
- Use standardized column names and avoid ambiguous abbreviations (e.g., prefer `customer_id` over `cust_id`).

This discipline helps make your warehouse a shared asset that scales gracefully as your team and data grow.

### Optimize performance with partitioning and clustering

Northwind Cloud provides powerful optimization features that can drastically improve query speed, especially as your dataset expands.

- **Partitioning**: Split large fact tables by a date column (e.g., order_date). This means queries scanning recent data run faster because they read fewer partitions.
- **Clustering (sorting)**: Organize data by frequently queried columns like customer_id or product_id. This shrinks the amount of data scanned during filters or joins.

For the Northwind Orders table, partitioning by year or month and clustering by customer or product makes business sense and yields faster interactive reporting.

### Monitor and refine models over time

Data and business needs evolve, so don’t treat your Northwind models as “set and forget.” Continuously gather feedback on query performance, accuracy, and user experience.

A few strategies include:
- Regularly check query performance metrics and look for expensive queries.
- Use Northwind Cloud’s profiling tools to understand data distribution and hotspots.
- Refine dimension tables and fact granularity as new questions emerge.
- Archive or remove stale columns or models that no longer add value.

This iterative approach ensures your warehouse remains a lively, relevant source of insights rather than a rigid data archive.

### Summary checklist for modeling in Northwind Cloud

To wrap up, here’s a quick checklist to keep your Northwind warehouse models in tip-top shape:

- [ ] Design star schemas with clear fact and dimension separation.
- [ ] Use surrogate keys and descriptive attributes wisely.
- [ ] Avoid over-normalization; optimize for analytics.
- [ ] Add derived columns and calculated metrics inside your models.
- [ ] Follow consistent naming, documentation, and folder structures for maintainability.
- [ ] Implement partitioning and clustering to improve performance.
- [ ] Monitor model usage and performance regularly, refining based on feedback.

By following these best practices, you’ll build a Northwind data warehouse that’s not just functional but a pleasure to work with—helping your team make smarter data-driven decisions faster and more confidently.

---

If you want to dive deeper or see example SQL snippets and model templates, Northwind Cloud’s documentation and community forums are a fantastic resource. Happy modeling!

## Building and sharing dashboards

One of the core strengths of Northwind Cloud is its intuitive yet powerful dashboard builder. Whether you're a data newbie or a seasoned analyst, creating insightful, interactive dashboards is straightforward and adaptable to your unique needs. Dashboards are the best way to bring your data stories to life, visualize trends at a glance, and keep your team aligned. In this section, we'll walk you through how to build beautiful dashboards and share them seamlessly with others.

### Getting started with your first dashboard

When you log into Northwind Cloud, the dashboard area is your control center for visualizing data. To create a new dashboard, just hit the **“New Dashboard”** button on your home screen. From there, you’ll enter a clean canvas where you can start adding visualizations.

A few things to keep in mind as you build:

- **Choose your data sources:** Northwind Cloud connects to a variety of data sources, whether it’s your internal databases, spreadsheets, or live APIs. Start by selecting which data sets you want to visualize.
- **Add different widget types:** Dashboards are more than just charts. You can include tables, maps, gauges, and even text boxes to provide context or highlight key points.
- **Customize with filters and parameters:** Create interactive dashboards by adding filters that allow viewers to explore the data from different angles without needing separate dashboards.

Northwind Cloud supports drag-and-drop functionality, so you can position your widgets wherever they make the most sense for storytelling. Resize each component dynamically to emphasize the most important data.

### Building blocks: widgets and visualizations

Dashboards are collections of widgets—each widget is a container that displays a unique chart or data visualization. Northwind Cloud offers a rich library of widgets such as:

- Bar, line, and area charts for trends over time
- Pie and donut charts for showing parts of a whole
- Maps for geographic data analysis
- KPI cards to display key numbers clearly
- Tables with sorting and pagination

Selecting the right widget depends on your data and what you want to communicate. For example, if you want to highlight monthly sales growth, a line chart with a filter for different product categories might be your best bet. If you're tracking regional performance, a heat map on a geographical map widget can quickly reveal which areas are excelling or underperforming.

### Crafting interactivity with filters and drill-downs

One of the coolest things about Northwind Cloud dashboards is their interactivity. You can add global filters that apply to all widgets—or widget-specific filters to zoom in on particular segments. This lets viewers dynamically explore the data without getting lost in multiple reports.

Drill-downs offer even deeper insight by allowing a viewer to click on elements (like a bar in a chart) and automatically load more detailed data related to that segment. Setting these up is simple through the dashboard editor, where you define which fields link together.

Interactivity transforms dashboards from static displays into conversation starters, encouraging users to discover patterns themselves rather than just passively consuming information.

### Sharing dashboards with your team and stakeholders

Building dashboards is only half the fun — sharing them effectively is just as important. Northwind Cloud makes sharing easy and secure, whether you’re collaborating internally or presenting to external stakeholders.

Here’s how you can share your dashboards:

- **Sharing links:** Generate a shareable URL that you can send via email or messaging. You can control the level of access—view-only or edit permissions—and add password protection for sensitive data.
- **Embed dashboards:** Want to place a live dashboard on your company intranet or website? Northwind Cloud provides embed codes you can insert directly into other platforms. The embedded dashboards update in real-time, so your audience always sees the latest data.
- **Scheduled reports:** Set up automatic email deliveries of dashboards or individual charts on a daily, weekly, or monthly basis. This keeps busy leaders and teams regularly updated without requiring them to log into the platform.
- **Collaborative editing:** If you work in teams, you can invite colleagues to co-edit a dashboard. Changes sync instantly, making it easy to build and refine dashboards together.

Northwind Cloud also supports granular permissions so you can control who sees or edits what. Whether it’s a public overview or confidential operational metrics, you keep data security top of mind.

### Tips for creating dashboards that really resonate

Creating dashboards is more art than science. Here are some practical tips to boost the impact of your dashboards:

- **Start with clear questions:** Know what business questions you want answered. This guides the data and visualizations you include.
- **Keep it focused:** Avoid cramming too much information into one dashboard. Focus on metrics that matter, and use multiple dashboards if needed.
- **Use consistent colors and fonts:** This helps people navigate and interpret information faster.
- **Tell a story:** Add text boxes or annotations to guide the viewer through your analysis.
- **Test your filters and interactivity:** Make sure end users can easily change filters, drill down, and explore without confusion.

### Making dashboards mobile-friendly

In today’s work environment, dashboards need to work on the go. Northwind Cloud dashboards are designed to be fully responsive. They automatically adjust to different screen sizes, whether your team is checking dashboards on laptops, tablets, or smartphones.

You can preview how your dashboard looks on various devices right in the editor, and tweak layouts accordingly. This means you can confidently share dashboards knowing they’ll look great everywhere.

---

Building and sharing dashboards with Northwind Cloud helps turn raw data into actionable insights and keeps your entire organization aligned around what really matters. As you play around, experiment with different widgets, filters, and styles until you find the perfect format for your team’s needs.

Ready to get started? Log in now, create your first dashboard, and watch your data come alive!

## Pipeline scheduling, retries, and alerting

When working with data pipelines in **Northwind Cloud**, keeping your workflows running smoothly and handling hiccups gracefully is essential. Whether you’re orchestrating complex data transformations or simply moving data from one source to another, the ability to schedule your pipelines, manage retries on failures, and stay informed with alerts gives you peace of mind and keeps your projects on track. In this section, we’ll dive into how Northwind Cloud helps you master pipeline scheduling, automated retries, and alerting, so you’re always in control and ready to respond.

### Scheduling your pipelines with ease

Data rarely flows exactly when you want it without a little nudge, and that’s where scheduling comes in. Northwind Cloud offers flexible pipeline scheduling options right out of the box to help automate data workflows so you don’t have to kick them off manually every time.

- **Simple scheduling:** Choose fixed intervals. Want your pipeline to run every hour? No problem. You can select from minutes, hours, daily, or weekly schedules with a few clicks in the scheduler UI.  
- **Cron expressions:** If you’re familiar with cron syntax, Northwind Cloud supports that too, giving you the flexibility to specify exactly when your pipeline runs, down to the minute or specific days of the week.  
- **Timezone-aware schedules:** Data teams often span multiple regions, so your schedules can be set in your preferred timezone ensuring that your pipelines run exactly when you expect them to, no matter where you are.  
- **Manual triggers:** On top of automatic schedules, you can always trigger pipelines on demand — perfect when testing a pipeline or rerunning after a fix.

Scheduling pipelines in Northwind Cloud is as intuitive as it is powerful. When you set up or edit a pipeline, the scheduling tab lets you toggle on the scheduling feature and customize the cadence, all with helpful tooltips and validation so you don’t accidentally create impossible schedules.

### Smart retries: your pipeline’s safety net

Even in the best setups, pipelines can fail or run into temporary issues like network glitches, service downtime, or unexpected data problems. Northwind Cloud’s retry logic helps you bounce back from these interruptions without any manual intervention.

Here’s what makes Northwind’s retry system dependable:

- **Configurable retry attempts:** You decide how many times a pipeline should retry on failure—three attempts, five, or more. This flexibility lets you balance between resilience and resource usage.
- **Backoff strategies:** To avoid hammering services or compounding errors, retries don’t have to be immediate. Northwind Cloud supports exponential backoff, where the wait time between retries increases with each attempt. This is perfect for handling transient issues.
- **Selective retries:** You can configure retries for specific types of errors or stages within your pipeline. Maybe a network timeout should trigger a retry, but a data validation error warrants human inspection instead.
- **Retry logs and stats:** Each retry attempt gets logged with detailed info so you can review what happened, when, and how many attempts were made. This insight is invaluable for root cause analysis.

By making retries configurable and transparent, Northwind Cloud minimizes pipeline downtime and frees you from constantly monitoring and manually restarting pipelines after failures.

### Stay informed with alerting

If a pipeline fails repeatedly or behaves unexpectedly, the last thing you want is to find out hours later when the damage is done. Proactive alerting in Northwind Cloud helps you spot trouble early and act fast.

The alerting system is designed to fit naturally in your workflow and communication style:

- **Multiple alert channels:** Choose from email, Slack, Microsoft Teams, or webhook notifications so alerts come where you already pay attention.
- **Custom alert rules:** Define exactly when alerts should fire. For example, alert if a pipeline fails twice in a row, or if a data latency threshold is breached.
- **Grouped alerts:** Avoid alert fatigue by grouping related alerts from repeated failures or multiple pipelines into a single digest or summary notification.
- **Detailed alert payloads:** Alerts include pipeline name, error messages, retry count, last run timestamp, and links to logs or pipeline details, so you can jump right into troubleshooting.

Using Northwind Cloud’s alerting, you can set up simple one-off notifications or advanced alerting policies that fit the complexity and scale of your data operations. Being notified in time allows you to prevent small hiccups from turning into big problems.

### Best practices for pipeline scheduling, retries, and alerts

To get the most out of these features, here are a few handy tips based on real-world experience with Northwind Cloud:

- **Stagger your schedules:** If you have multiple pipelines feeding into a common dataset or downstream process, stagger their schedules by a few minutes to avoid contention or resource bottlenecks.
- **Keep retry attempts reasonable:** While retries are helpful, too many can delay failure detection and cause unnecessary load. Three to five retries with exponential backoff is a good rule of thumb.
- **Test your alerting early:** Don’t wait for a critical production failure to test alerts. Intentionally fail a pipeline during development to ensure alerts trigger and reach the right people.
- **Use descriptive alert messages:** Customize your alert messages to include context such as pipeline purpose or impact areas so responders have what they need at a glance.
- **Review retry logs regularly:** Automated retries can mask failing pipelines. Periodically review logs and metrics for subtle issues so nothing slips through unnoticed.

Northwind Cloud also provides dashboards where you can monitor pipeline statuses, retry success rates, and alert history to identify trends or recurring problems proactively.

### Wrapping up

Managing pipeline scheduling, retries, and alerting is critical for reliable data workflows, and Northwind Cloud offers a well-integrated, user-friendly set of tools to help you get this right without added complexity. With intuitive scheduling options, smart retry mechanisms, and flexible alerting channels, you can automate your data workflows confidently and stay ahead of any issues.

So go ahead, set up your schedules, define your retry policies, and create alert rules that fit your team’s workflow. Northwind Cloud has got your back, making pipeline orchestration smoother and your data pipelines more resilient every step of the way. Happy data flowing!

## User roles, permissions, and workspace administration

When diving into Northwind Cloud, one of the first things you'll want to get comfortable with is how user roles, permissions, and workspace administration work. These core building blocks make managing your data platform smooth and secure, whether you’re a solo analyst or part of a large team. Let’s walk through the basics to help you understand how to keep everyone productive and your data safe.

### Understanding User Roles

Northwind Cloud organizes users into roles that determine what they can see and do within your workspace. Think of roles as predefined sets of permissions tailored to fit different job functions. Assigning the right roles helps you maintain control and ensures that each team member has access only to the areas they need.

Here are the main types of roles you’ll encounter:

- **Admin**: Admins are the ultimate managers of your workspace. They have full control over settings, users, data sources, and permissions, making them responsible for the overall health of your environment.
- **Editor**: Editors can create, modify, and delete data assets like reports, dashboards, and datasets, but they don’t have full administrative control. This role is perfect for analysts or data scientists who drive insights and build models.
- **Viewer**: Viewers have read-only access. They can consume reports and dashboards but cannot make any changes. This is ideal for stakeholders who need to stay informed but don’t require active editing capabilities.
- **Guest**: Guests are external users or temporary collaborators. Their permissions are very limited and can be customized to ensure secure and scoped access.

You can often customize roles further to match your organization’s specific needs by adjusting individual permissions or creating custom roles — a feature available to workspace admins.

### Permissions: What They Mean and How to Use Them

Permissions are the specific abilities granted to roles that control actions like viewing, editing, sharing, or managing data assets. They’re the fine-grained rules that keep your workspace well-organized and secure. Understanding these will help you ensure that users don’t accidentally change something important or access data they shouldn’t.

Some common permission types in Northwind Cloud include:

- **Read/View**: Allows a user to open and view data assets.
- **Write/Edit**: Grants rights to change or create content.
- **Delete**: Permits removal of assets.
- **Share**: Lets users share reports or dashboards with others.
- **Manage Users**: Enables adding or removing users and assigning roles.
- **Manage Data Sources**: Control over connecting or modifying data connections.
- **Admin Settings**: Permission to adjust workspace-wide settings.

By assigning these permissions to roles thoughtfully, you control the "who can do what" in your workspace. For example, it’s often a good idea to limit delete permissions to admins or trusted editors only, because once something’s gone, it might be tough to get back.

### Administering Your Workspace

If you’re an Admin, you’re basically the custodian of your Northwind Cloud workspace. Your role allows you to manage users, configure settings, and maintain data security. Here’s a friendly guide on what workspace administration typically involves.

#### Adding and Managing Users

One of the first things to do when setting up a workspace is inviting your team. You can bring in users by sending them an invite via email. When they accept, you assign them a role based on what level of access they should have.

Some tips for managing users:

- **Keep your user list tidy:** Regularly review who has access and remove any inactive or unnecessary accounts. This helps tighten security.
- **Use groups where possible:** If your organization has many users with similar roles, creating groups and assigning roles/permissions at the group level can save time.
- **Set up multi-factor authentication (MFA):** Encourage your team to enable MFA for an extra layer of protection.

#### Organizing Workspaces

A workspace is your main container in Northwind Cloud — think of it like your project or team’s hub. You might have multiple workspaces for different departments, projects, or clients, depending on how you want to organize your data operations.

Workspace admins can:

- Create and delete workspaces.
- Configure workspace settings like branding, data retention policies, or integrations.
- Set workspace-wide defaults such as default roles or standard permissions to streamline onboarding.
- Monitor activity logs to keep an eye on what’s happening in the workspace and spot any unusual behavior.

#### Setting Permissions at the Workspace Level

While roles control permissions on the user level, as an admin you can define overall policies for your workspace. For example:

- Restrict external sharing: If policies require data to stay internal, you can limit or disable sharing outside your organization.
- Control data source access: Make sure only qualified users can add or change data connections.
- Enable audit logging: Capturing detailed logs makes compliance reporting and troubleshooting much easier.

Northwind Cloud also supports hierarchical permission structures, meaning you can set defaults at a high level but override them on specific reports, dashboards, or datasets as needed.

### Best Practices for Roles and Permissions

To get the most out of Northwind Cloud while keeping things running securely, here are some tried-and-true best practices:

- **Follow the principle of least privilege:** Assign users the minimal level of access they need to do their job, and no more.
- **Use roles instead of individual user permissions:** It’s easier to manage and reduces mistakes.
- **Regularly audit your workspace:** Check user roles, permissions, and access logs to ensure everything stays appropriate.
- **Educate your team:** Make sure users understand what their permissions mean and the importance of data security.
- **Plan for growth:** Set up your roles and permissions to be scalable, especially if you expect your team or data needs to expand rapidly.

### Summary

Managing user roles, permissions, and workspace administration in Northwind Cloud brings power and order to your data platform. With well-defined roles, clear permissions, and an organized approach to administration, you’ll ensure that your team can collaborate effectively, your data stays secure, and your projects go smoothly.

Whether you’re an admin setting things up or a user simply accessing reports, knowing how these components work will help you make the most of what Northwind Cloud offers. Take your time customizing roles, assigning permissions, and keeping your workspace organized — it’s worth the effort!

## Query performance tuning and caching

When working with Northwind Cloud, you want your queries to be as fast and efficient as possible. Whether you're pulling a simple sales report or running complex data transformations, tuning your query performance and leveraging caching are key steps to getting results quickly without overloading your system. In this section, we'll walk through practical tips and techniques to help you optimize query speed and make the most out of Northwind Cloud’s caching features.

### Why query performance tuning matters

At its core, query performance tuning helps you reduce the time it takes for your queries to run and deliver results. Faster queries mean less waiting around, smoother dashboards, and better experiences for users. Plus, efficient queries reduce the strain on your data platform, which can improve overall system stability and allow you to scale more effectively.

Northwind Cloud is designed with performance in mind, but there are always ways to write smarter queries and optimize your workflows. By focusing on tuning, you can:

- Cut down on unnecessary data processing.
- Minimize resource usage.
- Speed up response times for end users.
- Take better advantage of caching to avoid redundant computations.

### Best practices for query performance tuning

Getting your queries to run faster starts with how you write them and structure your data. Here are some best practices to keep in mind:

#### 1. Select only the columns you need

Avoid using `SELECT *` unless you truly need all columns. Fetching unnecessary fields increases the volume of data processed and transferred, which slows down your query. Instead, specify only the columns you’ll use in reports or analytics, and your query will be leaner and more efficient.

```sql
-- Instead of this:
SELECT * FROM orders WHERE order_date >= '2024-01-01';

-- Do this:
SELECT order_id, customer_id, total_amount FROM orders WHERE order_date >= '2024-01-01';
```

#### 2. Filter data early with WHERE clauses

Applying filters early in your query reduces the dataset size and speeds things up. Push filtering criteria as close as possible to the data source instead of filtering after joins or transformations.

For example, if you only want orders from this year, use a `WHERE` clause on `order_date` instead of filtering the results once you receive them.

#### 3. Use proper indexing and partitioning

Northwind Cloud automatically optimizes indexes for common queries, but if you have large datasets, consider partitions or clustered indexes on high-cardinality columns like dates or IDs. This helps the platform quickly locate and read only the relevant data chunks.

Consult your dataset settings in Northwind Cloud to ensure partitions align with your typical query filters for maximum performance.

#### 4. Avoid unnecessary joins and subqueries

Joins can be expensive, especially if you’re combining large tables without appropriate keys or indexes. Minimize joins by:

- Pre-aggregating data when possible.
- Splitting complex queries into smaller steps.
- Using materialized views or summary tables for frequently joined data.

Subqueries, particularly correlated ones, can slow down query processing. Replace them with joins or common table expressions (CTEs) when feasible.

#### 5. Take advantage of Northwind’s built-in functions

Northwind Cloud provides specialized functions optimized for performance in analytical workloads. Use these functions for date manipulation, aggregation, and filtering rather than writing complex custom logic. The built-in functions often have performance benefits behind the scenes.

### Understanding caching in Northwind Cloud

Caching is a powerful way to boost performance by storing results of expensive queries or intermediate computations, so they don’t have to be recalculated every time you run the same or similar queries.

Northwind Cloud employs several levels of caching:

- **Query results caching:** Stores final results for repeated queries with the same parameters.
- **Intermediate result caching:** Saves outputs of subqueries or common components used across different queries.
- **Metadata caching:** Speeds up query planning by keeping dataset metadata (like table schemas and statistics) ready.

When you run a query that Northwind Cloud has cached, it can immediately return the stored results instead of re-executing the entire computation, drastically reducing response times.

### How to leverage caching effectively

To make the most of caching in Northwind Cloud, keep these tips in mind:

#### Use consistent query patterns

Because caching relies on matching query text and parameters, try to keep your queries consistent whenever possible. Minor changes in formatting, whitespace, or parameter values can bypass caches. Use parameterized queries to promote reuse.

#### Avoid unnecessary cache invalidations

Cache invalidations happen when underlying data changes or when query logic alters significantly, causing Northwind Cloud to regenerate cached results. While this is necessary to maintain data accuracy, try to schedule heavy data loads or updates during off-peak hours to minimize disruption.

#### Utilize materialized views for complex aggregations

Northwind Cloud supports materialized views, which are precomputed query results stored like tables. They provide immediate access to complex aggregations and can be refreshed periodically to stay up to date.

Using materialized views can shrink query execution times from minutes to seconds, especially for large datasets or resource-intensive computations.

#### Understand cache expiration policies

Northwind Cloud uses smart cache expiration policies that balance freshness with performance. Caches can have time-to-live (TTL) limits, after which they are refreshed automatically. Keep TTL settings in mind when monitoring performance to ensure your data remains both current and fast to access.

### Monitoring and diagnosing query performance

Northwind Cloud gives you tools to monitor and analyze your query performance so you know exactly where to focus your tuning efforts.

#### Query profiling and execution plans

Use the query profiling tools to see how your queries execute step-by-step. Execution plans reveal details like which indexes were used, join strategies, and time taken per operation. Look for any expensive operations or table scans that might be slowing things down.

#### Performance dashboards

The built-in dashboards provide real-time insights on query latency, cache hit rates, resource usage, and more. These metrics can help you identify slow-running queries or queries that rarely benefit from caching.

#### Logs and alerts

Set up alerts to notify you if query runtimes exceed thresholds or if cache hit ratios drop significantly. Logs can give you detailed error reports and help troubleshoot issues quickly.

### Summary checklist for query performance tuning and caching

Here’s a quick checklist to keep handy when optimizing your Northwind Cloud queries:

- ✅ Select only necessary columns, avoid `SELECT *`.
- ✅ Apply filters early in your queries.
- ✅ Use partitions and indexes where appropriate.
- ✅ Minimize joins and avoid costly subqueries.
- ✅ Leverage Northwind Cloud’s built-in functions.
- ✅ Write consistent, parameterized queries to maximize caching benefits.
- ✅ Schedule data refreshes during low-usage periods.
- ✅ Use materialized views for heavy aggregations.
- ✅ Monitor query execution plans and performance dashboards.
- ✅ Set alerts for slow queries and caching anomalies.
- ✅ Understand cache expiration and TTL policies for freshness.

By following these tips and actively monitoring your query performance, you can ensure your Northwind Cloud experience remains fast, efficient, and scalable as your data needs grow.

---

If you ever feel stuck or notice any performance issues, Northwind Cloud’s support team and community forums are great resources to get additional help and share best practices. With a bit of tuning and smart use of caching, you’ll be delivering lightning-fast insights in no time!

## Data quality checks and lineage

When working with data, especially at scale, keeping it clean, accurate, and well-understood is crucial. Northwind Cloud makes this easier by offering robust features for **data quality checks** and **lineage** tracking. These tools help ensure your data is reliable and transparent, which ultimately translates to better decisions and smoother workflows.

### Why data quality checks matter

Imagine you’re building dashboards, running analytics, or training machine learning models. If your data is incomplete, inconsistent, or outright wrong, your insights will be misleading at best—and disastrous at worst. Data quality checks act like a safety net, catching issues early on before they cascade down your pipeline.

Northwind Cloud lets you build and automate these checks with minimal setup, so you stay confident that your data meets the standards you define.

Some common data quality issues to watch out for:

- Missing or null values where required
- Duplicate records
- Values outside expected ranges
- Schema mismatches or unexpected data types
- Referential integrity problems (orphaned foreign keys)

Northwind Cloud enables you to monitor all of the above and more, helping you catch issues as soon as they arise.

### Setting up data quality checks in Northwind Cloud

Getting started is straightforward. Once your data sources and tables are connected, you can define checks on each dataset:

- **Row-level checks**: Verify individual rows meet your criteria. For example, confirm that email columns always contain “@” or that dates fall within a realistic timeframe.
- **Column-level checks**: Ensure statistical properties or constraints on fields—like min/max values, uniqueness, or expected distributions—are met.
- **Table-level checks**: Monitor overall characteristics such as row counts, or changes compared to previous runs.

You can configure these checks via a simple UI or automate them with a few clicks. The platform runs them on your schedules and will alert your team if something’s off.

The flexibility here means you can start with a few key checks and gradually expand your coverage as your data ecosystem grows.

### Automating and integrating your quality pipeline

Data quality isn’t a one-and-done thing—it needs ongoing monitoring. Northwind Cloud supports automation so these checks run seamlessly with your data workflows. Here’s how that typically looks:

- Define your quality rules per dataset
- Schedule periodic validation runs (e.g., after data ingestion or transformation)
- Integrate checks into your existing CI/CD pipelines or data orchestration tools
- Get immediate alerts and actionable reports if any checks fail

This approach helps you detect data drift or pipeline issues fast, reducing risk and manual firefighting.

### Understanding lineage: knowing where your data comes from

Data lineage refers to tracking the origin, movement, and transformation history of your data. Think of it like a detailed map that shows every step your data took to reach its current form. Why does this matter?

- **Transparency**: You can explain exactly how reports or analytics are generated—important for compliance or audits.
- **Troubleshooting**: When you spot a data issue, lineage helps you trace back to the root cause quickly.
- **Impact analysis**: Before changing a source or transformation, you can assess what downstream datasets or reports will be affected.
- **Collaboration**: Teams across your organization get clear visibility into how data assets connect.

Without lineage, understanding data flows in complex environments becomes guesswork. Northwind Cloud makes lineage tracking automatic and intuitive.

### How Northwind Cloud captures and visualizes lineage

One of the standout features of Northwind Cloud is its automatic capture of data lineage as part of your pipeline execution. Whenever you ingest, transform, or move data, the platform records metadata about data sources, jobs, and dependencies.

You can then explore this information graphical interface, which offers:

- **Interactive lineage graphs** that show data flow paths top-down or bottom-up.
- Color-coded nodes representing datasets, jobs, and transformations.
- Drill-down capabilities to inspect metadata about each step or dataset.
- Historical views to see lineage changes over time.

This visualization makes it easy to understand how your data is connected, even if your pipelines span many systems.

### Combining data quality and lineage for greater confidence

When you use data quality checks together with lineage tracking, the payoff is huge:

- You can pinpoint exactly where data quality issues originated.
- Quickly identify which downstream reports or processes might be impacted by problematic data.
- Confidently maintain and evolve your pipelines since you understand their dependencies and data health status.
- Comply effectively with data governance policies that require traceability and quality assurance.

For example, if a sales report suddenly shows anomalous results, lineage lets you trace back to the last transformation or source. Then quality checks can reveal whether bad data or pipeline issues caused the problem.

### Best practices for using Northwind Cloud’s data quality and lineage features

Here are some tips to get the most out of these capabilities:

- **Start small and scale up**: Begin with critical datasets and key quality checks, then expand coverage.
- **Automate early**: Set up scheduled runs and alerting for quality checks to catch issues proactively.
- **Regularly review lineage diagrams**: Use them to onboard new team members or plan pipeline changes.
- **Integrate with team workflows**: Connect alerts and lineage insights to your communication and incident tracking tools.
- **Document your quality rules and lineage expectations**: This helps keep your data culture consistent across the organization.
- **Use the platform’s historical trend features**: Monitor data quality over time and spot gradual drifts or recurring issues.

### Final thoughts

Data quality and lineage might seem like behind-the-scenes topics, but they’re foundational for trustworthy analytics, reporting, and data-driven projects. Northwind Cloud equips you with powerful tools to keep your data accurate and your pipelines transparent—without heavy lifting.

Leveraging these features not only prevents headaches caused by bad data but also empowers your whole organization with a clear understanding of where data comes from and how it’s managed. With Northwind Cloud, you get both peace of mind and the flexibility to grow your data ecosystem confidently.

## Embedding Northwind dashboards in your own product

If you’re building a product and want to deliver powerful, interactive analytics to your users without recreating the wheel, embedding Northwind dashboards directly into your application is a fantastic option. Northwind Cloud offers rich, customizable dashboards that can be seamlessly integrated, enabling you to provide insights and data visualization within your own UI. This way, your users don’t have to leave your product to access the data they need — everything is right there, smoothly integrated and tailored to your brand.

In this guide, we’ll walk through the benefits of embedding Northwind dashboards, the different embedding options available, and best practices to make sure your integration is smooth and efficient.

### Why embed Northwind dashboards?

Embedding dashboards from Northwind into your own product can transform your user experience in several valuable ways:

- **Instant insights:** Provide your users with immediate access to dynamic, interactive dashboards that update in real time.
- **Save development time:** Instead of building dashboards from scratch, you leverage Northwind’s powerful tools and infrastructure.
- **Consistency:** Maintain consistent branding while providing analytics, thanks to customizable embedding options.
- **User empowerment:** Allow your customers or internal users to explore data visually and derive their own insights directly within your app.
- **Scalability:** Northwind handles data processing and visualization performance, letting your backend focus on your application’s core features.

Bottom line: embedding dashboards lets you add advanced data capabilities without heavy lifting or compromising on user experience.

### Getting started: embedding options

Northwind Cloud supports several methods to embed dashboards, depending on your application architecture and your customization needs.

#### 1. **Iframe embedding**

The simplest way to embed a Northwind dashboard is by using an iframe. Northwind provides a secure URL to your dashboard, which you can directly embed within an iframe tag on your webpage or app.

Example:

```html
<iframe
  src="https://app.northwindcloud.com/embed/dashboard/your-dashboard-id"
  width="100%"
  height="600"
  frameborder="0"
  allowfullscreen
></iframe>
```

**Pros:**
- Quick to implement — just drop in the iframe snippet.
- Minimal development effort.
- Northwind takes care of authentication and rendering.

**Cons:**
- Limited control over interactivity and styling inside the iframe.
- Responsive design may require some tweaking.

This approach is often best for simple integrations or prototypes.

#### 2. **JavaScript SDK embedding**

For a more flexible integration, Northwind Cloud offers a JavaScript SDK that lets you embed dashboards with programmatic control. Using the SDK, you can:

- Customize the appearance to better match your app’s style.
- Control dashboard state programmatically (e.g., apply filters dynamically).
- Listen to events (like when a user interacts with a specific visualization).
- Handle authentication smoothly within your own app's flow.

Here’s a high-level snippet showing how embedding with the SDK might look:

```javascript
import { NorthwindEmbed } from 'northwind-cloud-sdk';

const container = document.getElementById('dashboard-container');

const embed = new NorthwindEmbed({
  dashboardId: 'your-dashboard-id',
  container,
  authToken: 'your-auth-token',
  theme: 'light',  // Example customization
});

embed.render();

// Optionally, react to events
embed.on('filterChanged', (filter) => {
  console.log('User applied filter:', filter);
});
```

**Pros:**
- Greater customization and integration control.
- Enhanced interaction capabilities.
- Better alignment with modern front-end frameworks.

**Cons:**
- Requires more development effort than iframe embedding.
- You need to handle authentication token management.

#### 3. **Backend proxy embedding**

For apps that require completely server-driven embedding or need tighter security, you can embed dashboards via a backend proxy approach. In this model, your backend securely obtains dashboard rendering information or tokens from Northwind, then serves the embedded content to the front end.

This method is ideal when:

- You want to hide tokens or sensitive information from the client.
- You have complex access control or user authorization rules.
- You need to integrate embedding within server-rendered pages or apps.

### Authenticating users and managing access

When embedding dashboards, securing your data and controlling who can see what is crucial.

Northwind Cloud supports several authentication strategies to ensure your embedded dashboards are shown only to authorized users:

- **Single sign-on (SSO):** If your product uses SSO (like OAuth, SAML, or OpenID Connect), you can integrate Northwind’s auth system to match your users. This streamlines login and keeps user management centralized.
- **Embed tokens:** For iframe or SDK embedding, Northwind can issue temporary embed tokens scoped with specific permissions and expiration timeframes. This lets you control exactly what data a user can see, even inside an embedded dashboard.
- **Row-level access control:** Combine embedding with data permissioning to ensure users only see data relevant to them.

Best practice is to generate and validate embed tokens or session credentials on your backend to keep them secure, passing only the minimal info needed to your front end.

### Styling and branding embedded dashboards

To maintain a seamless user experience, you want your embedded dashboards to blend naturally into your product’s look and feel.

Northwind Cloud offers styling and theming options for embedded dashboards, such as:

- **Color themes:** Light, dark, or custom color palettes to complement your UI.
- **Custom fonts and logos:** Integrate your brand’s typography and logo into the dashboard header.
- **Layout adjustments:** Decide which dashboard elements (titles, filters, legends) to show or hide to reduce clutter.
- **CSS overrides:** Use custom CSS (if embedding with the SDK) to tweak spacing, font sizes, or widget appearance.

When planning styling, consider how the embedded dashboard fits within your page or app layout. Responsive widths and heights, appropriate padding around the iframe or container, and consistent font sizes go a long way toward polish.

Also, make sure embedded dashboards maintain accessibility best practices (like keyboard navigation and screen reader support), so all your users can get value from the data.

### Tips for optimal embedded dashboard performance

Performance impacts user engagement more than most people realize. To keep the embedded Northwind experience smooth and snappy:

- **Preload dashboard data:** If your app can know what dashboards users will need ahead of time, preload relevant data or tokens to decrease load times.
- **Lazy load dashboards:** Only load embedded dashboards when users navigate to the relevant section or open the analytics tab, avoiding unnecessary resource use.
- **Optimize dashboard complexity:** While Northwind dashboards are powerful, extremely complex dashboards with hundreds of visualizations or filters might lag. Keep dashboards focused and concise.
- **Cache tokens and assets:** Use short-lived caches to prevent repeated authentication calls and speed up re-renders.
- **Monitor and debug:** Use Northwind’s developer logs and error reporting during development to catch integration issues early.

### Supporting advanced interactivity and workflows

Northwind dashboards are interactive by design — filtering, drilling down, selecting data points, and more. When embedding, you can tap into these interactions to power deeper workflows in your product.

For example:

- Use callbacks from the SDK to react when a user filters a dashboard or clicks a chart, then update the surrounding app UI or load relevant data in other parts of your product.
- Allow users to export dashboard views or data directly from embedded dashboards, making sharing insights easier.
- Pass parameters programmatically to dashboards (e.g., user ID, date ranges) to personalize what each user sees.
- Capture and store user-exported or bookmarked dashboard states for future sessions.

By combining Northwind dashboards with your application logic, the possibilities for user engagement and data-driven feature sets are huge.

### Wrapping up

Embedding Northwind Cloud dashboards into your own product is an efficient and effective way to bring top-notch data analytics right to your users’ fingertips. Whether you choose the simplicity of iframe embedding or the flexibility of the JavaScript SDK, Northwind provides the tools and support to make integration smooth, secure, and customizable.

Key takeaways when embedding:

- Decide on the embedding method that fits your development resources and goals.
- Implement secure authentication and enforce access control.
- Match dashboard styles with your brand for a seamless user experience.
- Optimize performance to keep everything fast and responsive.
- Leverage interactivity to create richer workflows and user journeys.

With these tips and best practices, you’ll be able to offer your customers embedded analytics that add immediate value and keep users coming back for more.

---

If you want to get started right away, head over to your Northwind Cloud dashboard, generate an embed URL or SDK credentials, and take that first step toward integrating powerful data visualization into your product. Happy embedding!

## Troubleshooting common sync errors

Syncing your data with Northwind Cloud should ideally be a smooth, seamless experience. However, like any data platform that interacts with multiple sources and formats, you might occasionally run into sync errors. Don’t worry! These hiccups are pretty common and usually easy to resolve once you know what to look for.

In this guide, we’ll walk through some of the most frequent sync issues you might encounter, why they happen, and how to fix them quickly so you can get your data flowing again.

---

### Connection problems: When Northwind can’t talk to your source

One of the most common reasons sync errors pop up is due to connection problems. Northwind Cloud relies on stable, authenticated access to your data sources—whether that’s a database, cloud storage, or an API. If the connection breaks, your sync will fail. Here are some common causes:

- **Expired or invalid credentials:** Maybe your database password changed but wasn’t updated in Northwind.
- **Network issues:** Temporary outages, firewall restrictions, or VPN changes blocking access.
- **Permission changes:** Your account might have lost read or write permissions on a shared data source.
- **Endpoint URL changes:** For APIs or services, a URL might have changed or been deprecated.

**How to troubleshoot connection issues:**

1. Double-check your credentials are still valid and updated in the Northwind Cloud settings.
2. Test the connection directly outside Northwind using a simple query or curl request.
3. Review your network firewall or VPN settings to make sure no new rules are blocking access.
4. Confirm that you still have the correct permission level on your data source.
5. If an endpoint URL changed, update it in your sync configuration accordingly.

If all else fails, try disconnecting and reconnecting the data source from Northwind’s dashboard to reset the connection.

---

### Data format and schema mismatches

Sync errors can also arise when the data structure in your source doesn’t match what Northwind expects. This happens most often when:

- New columns or fields were added or removed in your source.
- Data types changed unexpectedly (e.g., a number column now includes text).
- Required fields are missing or renamed.
- Your source contains corrupted or malformed data.

The sync process depends on schemas matching closely, so when the shape of your data changes without updating Northwind’s mapping, errors occur.

**How to fix schema-related errors:**

1. Review the detailed sync error message in Northwind’s interface; it usually specifies which table or field caused the problem.
2. Compare your source schema to the schema Northwind’s sync is configured to expect.
3. Update your Northwind sync settings to reflect new or dropped fields.
4. Correct any data type inconsistencies in your source system.
5. Clean up corrupted or invalid data (e.g., remove unexpected nulls or fix badly formatted values).

Pro tip: If your source schema changes frequently, consider setting up automated schema detection in Northwind, which can help minimize these issues.

---

### Handling large or complex datasets

Large datasets or very complex data structures can sometimes cause timeout errors or memory limits to be hit during syncing. This might show up as partial syncs, failed batches, or timeouts.

If you notice your sync starts but never completes, or only a subset of your data gets transferred, consider these tips:

- Break your sync job into smaller batches or incremental updates instead of full syncs.
- Reduce the volume by filtering to only the necessary subsets of data.
- Check if your source system has query limits or throttling mechanisms.
- Increase any timeout or memory settings available within Northwind’s sync configuration.
- Make sure you’re running the latest Northwind Cloud agent version if using on-premise connectors.

By managing your data flow in more manageable chunks, you can keep the sync process more stable and easier to troubleshoot.

---

### Sync conflicts and duplicate data

Sometimes the problem isn’t about connection or data shape, but rather duplicate or conflicting records. This can happen when:

- Two sources contain overlapping data.
- Updates arrive out of order.
- Syncs run simultaneously on the same dataset.
- The sync logic doesn’t handle merges or conflict resolution properly.

Northwind offers configurable conflict resolution strategies, but knowing what’s causing conflicts is key.

**Tips to resolve conflict errors:**

- Review conflict logs to understand which records are conflicting and why.
- Adjust your sync schedule to avoid overlapping jobs.
- Apply filtering rules to prevent overlapping data sets from syncing at the same time.
- Choose the appropriate conflict resolution method in Northwind (e.g., last-write-wins, merge, or manual review).
- Set up alerts for conflicts so you can intervene early.

Handling conflicts thoughtfully ensures your data stays consistent and trustworthy.

---

### Error logs and monitoring: Your best friends during sync issues

Whenever sync errors arise, Northwind Cloud provides detailed error logs and status dashboards that are immensely helpful for diagnosis. Here’s how to make the most out of them:

- Regularly check the sync status dashboard for any red flags.
- Use the detailed error messages to pinpoint the exact failure point.
- Export error logs for offline analysis or to share with your IT team.
- Set up automated alerting to be notified immediately when a sync problem happens.
- Use the built-in troubleshooting tooltips and help links next to error messages for quick guidance.

Getting comfortable with these tools can save you hours of guesswork.

---

### When to reach out to Northwind Cloud support

Despite your best efforts, sometimes errors just won’t resolve on their own. If you’ve:

- Confirmed your credentials and permissions,
- Checked network connectivity,
- Validated your schema and cleaned your data,
- Applied conflict resolution settings, and
- Still keep seeing errors or unexpected behavior,

it’s time to contact the Northwind Cloud support team.

Make sure to include:

- A detailed description of your issue,
- Screenshots or exports of error messages and logs,
- Information about recent changes to your sources or sync configurations,
- The approximate time the errors started.

Northwind’s friendly support team is well-equipped to dig deeper into backend logs and help you solve tricky sync issues fast.

---

### Final tips for smooth syncing

To wrap up, here are some quick reminders to keep your data syncing smoothly with Northwind Cloud:

- Periodically review and update your connection credentials and permissions.
- Monitor your data schemas and update mappings after any source changes.
- Break large datasets into smaller chunks if needed.
- Use built-in conflict resolution wisely and schedule syncs to avoid collisions.
- Take advantage of error logs and alerts to catch problems early.
- Don’t hesitate to reach out for help — Northwind support is here to assist you!

Sync errors can sometimes feel frustrating, but with the right approach, they become manageable checkpoints rather than roadblocks. Happy syncing!

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
