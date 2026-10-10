# ONDC-AutoBridge: 7-Hour Hackathon Implementation Plan

## Overview
**Goal:** Build a functional prototype of ONDC-AutoBridge, an autonomous software factory that takes a merchant's messy inventory (CSV/Excel) and uses the Cline SDK to scaffold, configure, and self-heal a Node.js Beckn Protocol microservice (BPP).
**Constraint:** 7-8 hour live build window.
**Deployment:** Local/Railway Node.js Express server + Next.js UI, tested against the ONDC Sandbox mock data.

## Phase 1: Environment Setup & Scaffolding (Hour 1)
- [ ] Initialize Next.js project (App Router) with Tailwind CSS and shadcn/ui for the dashboard.
- [ ] Set up basic routing (Home, Upload Inventory, Agent Logs, Demo Dashboard).
- [ ] Initialize an Express.js/Node.js backend for the Agent Orchestrator (this will invoke Cline).
- [ ] Set up basic state management (can use local JSON files or SQLite for speed during the hackathon) for storing merchant profiles and generation status.

## Phase 2: ONDC Taxonomy Knowledge Layer (Hour 2)
- [ ] Create a static knowledge base (JSON format) containing ONDC Beckn schemas and rules for a specific domain (e.g., Grocery/Retail).
- [ ] Build an extraction/mapping utility that reads a dummy merchant CSV (e.g., `Item_Desc`, `MRP`, `Qty`) and maps it to strict ONDC schema fields.
- [ ] Prepare the context files that will be fed to the Cline SDK (rules, schemas, and merchant data).

## Phase 3: Cline SDK Integration & Automation (Hours 3-5)
- [ ] Integrate the Cline CLI/SDK into the backend orchestration flow.
- [ ] **The Builder Agent:** 
  - Construct prompts that command Cline to generate a Node.js Express microservice implementing the 6 Beckn endpoints (`/search`, `/select`, `/init`, `/confirm`, `/status`, `/track`).
  - Provide Cline with boilerplate for Ed25519 cryptographic signing.
- [ ] **The Self-Healing Loop:**
  - Build a mock ONDC Gateway validator.
  - Run the generated microservice against the validator.
  - If a 400 Bad Request (Schema Validation Failure) occurs, automatically feed the error log back to Cline to fix the endpoint code without human intervention.

## Phase 4: Mock Buyer Transaction Demo (Hour 6)
- [ ] Create a "Buyer Simulator" UI widget in Next.js.
- [ ] Connect the Buyer Simulator to the dynamically generated BPP (Seller Microservice).
- [ ] Visualize the data flow: Show a split-screen with the Buyer clicking "Buy" and a terminal view showing the 6 Beckn webhooks firing successfully with valid cryptographic signatures.

## Phase 5: Polish & Presentation (Hour 7)
- [ ] Clean up UI and add loading animations for the "Agent is thinking..." states to make the demo look magical.
- [ ] Run end-to-end tests locally.
- [ ] Record a 2-minute fallback video of the working flow just in case of live demo glitches.
- [ ] Finalize pitch talking points.
