# PDR — Agent Customer-Acquisition Engine

## 1. Purpose

Build an **agent-driven customer-acquisition engine** that can generate revenue for software products using primarily **no-cost / low-cost organic channels**, while remaining compatible with a broader agent-operated business stack.

The system should:
- attract qualified traffic
- convert attention into leads and trials
- nurture prospects into paying customers
- continuously improve acquisition performance through feedback loops
- operate safely with policy controls, approvals, and channel-specific rules

This engine is intended to function as a modular subsystem inside a larger agent business OS.

---

## 2. Core Goal

Create a system where a coordinated set of agents can run a **repeatable, scalable, mostly autonomous growth operation** for software products without relying on paid ads as the primary engine.

Primary focus:
- organic demand capture
- product-led growth loops
- directory / launch footprint
- community-native promotion
- selective, high-signal outbound
- attribution and continuous optimization

---

## 3. Product Goals

- **Autonomous acquisition workflows**: agents can research, create, publish, distribute, monitor, and optimize growth assets.
- **Organic-first strategy**: prioritize channels that compound over time instead of requiring ongoing ad spend.
- **API-first architecture**: every growth function should be machine-operable via structured APIs and evented workflows.
- **Safe promotion system**: enforce channel rules, approval gates, outreach limits, and anti-spam protections.
- **Attribution-aware optimization**: connect content, outreach, community activity, and directory presence to real revenue signals.
- **Reusable across products**: the engine should support multiple software products, product lines, and ICPs.

---

## 4. Non-Goals (V1)

- Fully autonomous high-volume cold outreach at scale.
- Paid ad buying / campaign automation as a core dependency.
- Deep enterprise ABM workflows.
- Complex influencer / affiliate management.
- Full social media “every network” automation.

These may be added later, but V1 should focus on durable, compounding organic systems.

---

## 5. Strategic Thesis

The acquisition engine should be built around **compounding free channels** that improve with time, content depth, and product adoption.

Priority channels:
1. **Search demand capture** (SEO, bottom-funnel pages, docs, use-case pages)
2. **Programmatic landing pages** (comparisons, integrations, ICP-specific pages)
3. **Directory / launch presence** (software listings, launch platforms, review surfaces)
4. **Product-led loops** (shareable assets, public templates, “made with” exposure)
5. **Community participation** (value-first engagement in relevant communities)
6. **Selective outbound** (trigger-based, permission-aware, highly personalized)

The system should optimize for:
- trust
- relevance
- compounding visibility
- conversion efficiency
- long-term defensibility

---

## 6. Functional Overview

The acquisition engine is made up of five layers:

### 6.1 Intelligence Layer
Understands:
- ICPs
- market segments
- search demand
- competitor positioning
- channel opportunities
- public buying signals
- content gaps
- conversion bottlenecks

### 6.2 Asset Production Layer
Creates:
- SEO pages
- comparison pages
- integration pages
- use-case pages
- directory listings
- launch assets
- community reply drafts
- case studies
- proof assets
- outreach assets

### 6.3 Distribution Layer
Publishes and maintains:
- website content
- docs
- directory listings
- launch posts
- changelog visibility
- community engagement artifacts
- referral and share surfaces

### 6.4 Demand Capture & Nurture Layer
Processes:
- inbound leads
- attribution data
- lead scoring
- qualification
- follow-up timing
- funnel progression
- conversion readiness

### 6.5 Optimization Layer
Measures:
- content performance
- traffic quality
- source-to-revenue mapping
- conversion velocity
- channel effectiveness
- proof / review lift
- opportunity cost

---

## 7. Agent Org Structure

The system should use a small but specialized agent org.

### 7.1 Growth Director Agent
**Role:** top-level coordinator for acquisition.

Responsibilities:
- define priorities by product / segment
- assign tasks to specialists
- approve strategy shifts
- monitor KPI health
- escalate risks and anomalies

### 7.2 ICP Research Agent
**Role:** maintain customer and market intelligence.

Responsibilities:
- maintain ICP definitions
- identify pains, language, objections, use cases
- map competitor positioning
- update buyer-stage segmentation

### 7.3 Keyword & Intent Agent
**Role:** maintain organic demand map.

Responsibilities:
- discover keyword clusters
- classify intent
- identify bottom-funnel opportunities
- detect content cannibalization
- maintain content opportunity queue

### 7.4 Content Strategist Agent
**Role:** determine what assets should be produced.

Responsibilities:
- define content briefs
- map each asset to ICP + intent + CTA
- prioritize refresh vs new creation
- coordinate internal linking strategy

### 7.5 Landing Page Agent
**Role:** build conversion-oriented pages.

Responsibilities:
- create comparison pages
- create feature/use-case pages
- create integration pages
- create audience-specific pages
- update CTAs and proof blocks

### 7.6 Directory & Launch Agent
**Role:** manage listing-based discovery.

Responsibilities:
- maintain product profiles on target directories
- refresh screenshots / descriptions / categories
- prepare launch assets
- coordinate launch timing and listing updates

### 7.7 Community Participation Agent
**Role:** value-first participation in relevant communities.

Responsibilities:
- monitor target communities
- identify relevant discussions
- draft useful, non-spammy contributions
- escalate promotional posts for review where needed
- track community account health and rules

### 7.8 Product-Led Growth Agent
**Role:** create and optimize built-in viral loops.

Responsibilities:
- identify shareable artifacts
- manage template galleries
- optimize “made with” or attribution surfaces
- improve invitation / sharing mechanics
- increase organic referral pathways

### 7.9 Lead Qualification Agent
**Role:** convert inbound activity into prioritized opportunities.

Responsibilities:
- score leads
- classify lead source and intent
- identify best next action
- pass leads to nurture or sales workflows

### 7.10 Follow-Up Agent
**Role:** handle compliant, personalized follow-through.

Responsibilities:
- generate follow-up sequences
- tailor responses based on context and source
- stop or escalate based on policy rules
- coordinate handoff to sales / onboarding

### 7.11 Proof & Reviews Agent
**Role:** turn satisfied users into trust assets.

Responsibilities:
- detect candidate customers for review requests
- collect testimonials
- suggest case study opportunities
- distribute proof into pages, listings, and nurture flows

### 7.12 Attribution & Optimization Agent
**Role:** close the feedback loop.

Responsibilities:
- connect touches to outcomes
- rank channels by value
- detect underperforming assets
- recommend changes to priorities and workflows

---

## 8. Business Systems Required

This engine depends on certain business systems existing as API-first modules.

### 8.1 Growth CRM
A dedicated acquisition-oriented CRM.

Required entities:
- lead
- contact
- account
- opportunity
- touchpoint
- campaign / initiative
- content asset
- source channel
- follow-up task
- review opportunity

Required fields:
- source channel
- source URL
- originating asset
- ICP segment
- intent level
- pain / use-case tag
- product interest
- trust score
- qualification score
- permission / outreach status
- next best action
- revenue attribution status

### 8.2 Content Graph
A structured system for content planning and lifecycle management.

Required entities:
- topic cluster
- keyword
- page
- feature
- persona
- CTA
- proof asset
- refresh status
- decay score
- conversion contribution

### 8.3 Community Ledger
A system that stores channel-specific operating rules.

Required entities:
- community / platform
- account identity
- channel rules
- acceptable behavior constraints
- health score
- warning history
- promotion ratio
- topic relevance map

### 8.4 Directory / Listing Registry
A system for managing software directory presence.

Required entities:
- platform
- product listing
- category placement
- listing assets
- screenshots
- review count
- profile completeness
- update cadence
- owner agent

### 8.5 Review / Proof System
A structured trust asset pipeline.

Required entities:
- review target
- review request
- testimonial
- quote snippet
- permission state
- case study candidate
- proof block
- linked page(s)

### 8.6 Attribution Engine
A system that maps revenue to acquisition activity.

Required entities:
- session source
- first touch
- last touch
- assisted touch
- content path
- lead source
- conversion event
- revenue event
- CAC proxy (if applicable)
- attribution confidence

---

## 9. Channels & Growth Surfaces

### 9.1 Search / SEO
Primary long-term demand engine.

Supported asset types:
- feature pages
- use-case pages
- audience pages
- comparison pages
- integration pages
- documentation
- tutorials
- changelogs
- glossary / educational pages

### 9.2 Programmatic Bottom-Funnel Pages
High-intent page generation system.

Examples:
- competitor comparisons
- “X for Y” pages
- “best tool for Z” pages
- role-specific pages
- stack-specific pages

### 9.3 Directory / Launch Footprint
Third-party trust and discovery surfaces.

Examples:
- software directories
- launch directories
- app listing surfaces
- public software databases
- review surfaces

### 9.4 Product-Led Distribution
Exposure created by the product itself.

Examples:
- shareable public outputs
- “made with” branding
- template sharing
- cloneable workflows
- collaboration invites
- public examples
- export branding options

### 9.5 Community Distribution
Value-first engagement in relevant communities.

Examples:
- developer communities
- founder communities
- niche forums
- social threads
- product-specific community spaces

### 9.6 Selective Outbound
High-signal, low-volume, trigger-based contact.

Allowed trigger examples:
- public complaint about a relevant problem
- hiring signal
- tech stack change
- new product launch
- feature request matching your solution
- request for recommendations

---

## 10. Workflow Engine

The acquisition engine should support the following core loops.

### 10.1 Opportunity Discovery Loop
1. Detect keyword, content, or channel opportunity
2. Score opportunity by relevance, intent, and potential value
3. Add to acquisition backlog
4. Assign production tasks

### 10.2 Content Production Loop
1. Generate brief
2. Pull supporting product / proof data
3. Draft asset
4. Validate alignment to ICP and channel
5. Publish
6. Monitor performance
7. Refresh or expand

### 10.3 Directory Maintenance Loop
1. Detect stale listing or missing field
2. Generate updated assets
3. Apply updates
4. Monitor referral and conversion impact
5. Request reviews where appropriate

### 10.4 Community Participation Loop
1. Monitor relevant discussions
2. Detect valid participation opportunity
3. Draft high-value response
4. Check against community rules
5. Route for approval if promotional risk exists
6. Post
7. Monitor response and downstream conversions

### 10.5 Product-Led Referral Loop
1. Detect opportunities to expose shareable outputs
2. Insert or optimize viral mechanics
3. Track share / invite / clone rates
4. Identify high-performing loops
5. Expand successful patterns

### 10.6 Lead Qualification Loop
1. Capture inbound lead or signal
2. Identify source and originating asset
3. Score intent and fit
4. Determine next best action
5. Route to follow-up, self-serve nurture, or sales

### 10.7 Review Harvest Loop
1. Detect positive customer signal
2. Generate review / testimonial request
3. Capture response
4. Convert into reusable proof assets
5. Distribute proof into acquisition surfaces

### 10.8 Optimization Loop
1. Aggregate performance data
2. Detect winners / losers
3. Re-prioritize topics, channels, and CTAs
4. Trigger refresh, expansion, or deprecation actions

---

## 11. Autonomy Model

The system should not treat all actions equally.

### 11.1 Fully Autonomous Actions
Allowed without review:
- keyword clustering
- brief generation
- content opportunity scoring
- low-risk page drafting
- stale listing detection
- internal reporting
- attribution analysis
- asset refresh recommendations

### 11.2 Semi-Autonomous Actions
Allowed with policy checks:
- publishing to owned website
- updating directory listings
- review request generation
- follow-up drafts
- community reply drafts
- workflow cloning / internal recommendations

### 11.3 Human-Gated Actions
Require explicit approval:
- promotional community posts
- outreach messages beyond safe thresholds
- major positioning shifts
- deletion of live assets
- changes that affect compliance or brand risk
- broad campaign activations

---

## 12. Policy & Safety Requirements

### 12.1 Channel-Specific Rules
Every channel must have its own policy profile:
- promotion tolerance
- posting cadence
- ratio of educational vs promotional activity
- approval rules
- known restrictions
- account health thresholds

### 12.2 Anti-Spam Protections
The engine must prevent:
- repetitive posting
- low-value link dumping
- mass unsolicited outreach
- duplicate content flooding
- excessive automation patterns that harm trust

### 12.3 Rate Limiting
Each channel and connector should support:
- action limits
- cooldowns
- burst protection
- daily / weekly ceilings

### 12.4 Content Quality Controls
Assets should be validated for:
- uniqueness
- usefulness
- relevance to ICP
- correct CTA alignment
- no obvious hallucinated claims
- no prohibited promotional behavior

### 12.5 Auditability
All acquisition actions must be logged:
- what was done
- where it happened
- which agent performed it
- what approval state existed
- what content / message was used
- what business result followed

---

## 13. Data Model (Core Objects)

### 13.1 Lead
- id
- source_channel
- source_url
- originating_asset_id
- contact_identity
- account_identity
- product_interest
- intent_score
- fit_score
- trust_score
- outreach_status
- next_best_action
- attribution_links
- conversion_state

### 13.2 Content Asset
- id
- type
- title
- channel
- product
- icp_segment
- buyer_stage
- keyword_cluster
- linked_cta
- linked_proof_assets
- status
- publish_date
- performance_metrics
- refresh_due_at
- decay_score

### 13.3 Channel Policy
- id
- channel_name
- allowed_actions
- restricted_actions
- review_required_actions
- rate_limit_profile
- health_score
- risk_score

### 13.4 Community Opportunity
- id
- channel
- url
- topic
- detected_problem
- relevance_score
- promotion_risk
- recommended_response_type
- approval_state
- outcome

### 13.5 Proof Asset
- id
- type
- customer_segment
- linked_product
- source_customer
- permission_state
- approved_usage_surfaces
- quote_text
- structured_highlights

### 13.6 Attribution Record
- id
- lead_id
- first_touch
- last_touch
- assisted_touches
- primary_asset
- time_to_conversion
- revenue_value
- attribution_confidence

---

## 14. Agent-App Platform Requirements

To support this engine, the broader agent platform must provide:

### 14.1 Tool Connectors
Needed connector classes:
- website CMS / page publishing
- content database access
- CRM access
- analytics access
- directory/listing interaction
- browser-assisted tasks
- email / messaging systems
- webhook listeners
- report generation

### 14.2 Event Bus
The system should support event-driven triggers such as:
- new lead
- new page published
- ranking change
- listing updated
- review received
- trial started
- conversion completed
- churn risk detected

### 14.3 Memory Layers
- per-agent working memory
- shared acquisition memory
- channel policy memory
- content history memory
- customer / lead context memory

### 14.4 Run Tracing
Every acquisition workflow must produce:
- step timeline
- inputs
- outputs
- approvals
- artifacts
- errors
- result metrics

### 14.5 Approval Inbox
A review surface for:
- risky posts
- outreach drafts
- channel policy violations
- high-visibility content changes

---

## 15. UI / Operational Surfaces

### 15.1 Growth Command Center
A top-level dashboard for:
- channel performance
- active campaigns / initiatives
- lead velocity
- funnel health
- proof inventory
- agent workload
- blocked approvals

### 15.2 Opportunity Queue
A prioritized list of:
- content opportunities
- community opportunities
- directory refreshes
- follow-up tasks
- review requests

### 15.3 Content Planner
A planning board for:
- topic clusters
- asset backlog
- refresh cycles
- CTA alignment
- proof placement

### 15.4 Channel Health Monitor
Tracks:
- community account health
- posting cadence
- warning flags
- channel risk
- engagement quality

### 15.5 Attribution Dashboard
Shows:
- source → lead → revenue paths
- top-performing assets
- top-performing channels
- time-to-conversion
- conversion bottlenecks
- expansion opportunities

---

## 16. KPIs

### 16.1 Traffic & Reach
- organic sessions
- impressions
- listing views
- community engagement volume
- branded search growth

### 16.2 Lead Metrics
- leads generated
- lead quality score
- qualified lead rate
- lead-to-trial rate
- lead-to-close rate

### 16.3 Content Metrics
- page conversion rate
- ranking improvement
- click-through rate
- refresh lift
- content decay rate

### 16.4 Proof Metrics
- review request conversion rate
- testimonial capture rate
- proof-assisted conversion lift

### 16.5 Product-Led Metrics
- share rate
- invite rate
- template clone rate
- referral-originated trials

### 16.6 System Metrics
- autonomous action success rate
- approval rate
- policy violation rate
- time saved
- acquisition cost proxy
- source-to-revenue accuracy

---

## 17. V1 Scope

V1 should focus on a practical, high-leverage organic engine.

Included in V1:
- Growth CRM (minimum viable)
- Content graph
- SEO / landing-page pipeline
- Directory / listing registry
- Review / proof pipeline
- Community ledger
- Attribution basics
- Growth command center
- Agent org for acquisition
- Approval gates for risky actions

Suggested V1 emphasis:
- one product
- one primary ICP
- one or two community channels
- one directory workflow
- one website publishing workflow
- one follow-up channel

---

## 18. V2 Expansion Path

V2 can expand into:
- multiple products / product lines
- more sophisticated segmentation
- additional launch platforms
- richer browser automation
- advanced outbound intelligence
- deeper experiment automation
- multi-user team collaboration
- hosted SaaS deployment
- cross-product acquisition orchestration

---

## 19. Acceptance Criteria (V1)

The system is successful when:

- it can identify and prioritize new acquisition opportunities automatically
- it can generate and publish useful acquisition assets
- it can maintain at least one directory / listing presence
- it can safely participate in at least one community with approval controls
- it can capture, score, and route inbound leads
- it can request and store proof assets from satisfied users
- it can connect at least some acquisition activity to actual revenue outcomes
- it can show a clear audit trail for every acquisition action performed by agents

---

## 20. Key Risks

- organic growth may be too slow without focused positioning
- poor content quality can create noise instead of demand
- over-automation can harm trust in communities
- weak attribution can cause bad optimization decisions
- missing policy controls can create compliance or reputation problems
- too many channels at once will dilute results

---

## 21. Mitigations

- start with one ICP and one strong positioning angle
- prioritize bottom-funnel assets over broad awareness content
- use human approval for risky or visible actions
- maintain strict channel policies and rate limits
- build attribution early, even if imperfect
- expand channels only after one channel proves repeatable

---

## 22. Implementation Notes

Recommended build order:
1. Growth CRM
2. Content graph
3. Acquisition agent org
4. Website publishing pipeline
5. Directory / listing system
6. Review / proof pipeline
7. Attribution layer
8. Community participation workflows
9. Product-led referral surfaces
10. Selective outbound enhancements

This keeps the engine useful quickly while building toward a larger autonomous growth machine.

---

## 23. Summary

The Agent Customer-Acquisition Engine is a **modular, agent-operated organic growth system** designed to turn software products into self-promoting, continuously improving revenue assets.

It combines:
- market intelligence
- asset generation
- safe distribution
- lead handling
- proof harvesting
- attribution-driven optimization

The system should act less like a generic “marketing automation tool” and more like a **digital growth department** made of specialized agents, governed by policies, connected to structured business systems, and optimized around compounding acquisition channels.
