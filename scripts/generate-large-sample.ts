import { readFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";

const TOPICS = [
  "Data modeling best practices in the Northwind warehouse",
  "Building and sharing dashboards",
  "Pipeline scheduling, retries, and alerting",
  "User roles, permissions, and workspace administration",
  "Query performance tuning and caching",
  "Data quality checks and lineage",
  "Embedding Northwind dashboards in your own product",
  "Troubleshooting common sync errors",
];

process.loadEnvFile(".env");
const client = new OpenAI();
const base = await readFile("samples/doc.md", "utf8");

const sections = await Promise.all(
  TOPICS.map(async (topic) => {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `Write a ~1,100 word section of a casual, friendly product guide for "Northwind Cloud", a data platform.
Topic: ${topic}.
Use markdown: start with "## ${topic}", use a few "###" subheadings, paragraphs, and at least one bullet list.
Do not mention pricing, plan prices, or the API versions.`,
    });
    return response.output_text.trim();
  }),
);

const anchor = "## Frequently asked questions";
const document = base.replace(anchor, `${sections.join("\n\n")}\n\n${anchor}`);
await writeFile("samples/large-doc.md", document);
console.log(`Wrote samples/large-doc.md (${document.split(/\s+/).filter(Boolean).length} words)`);
