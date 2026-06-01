# KinsenOPS AdaptiveAI Ops

[![Gates](https://github.com/kostasuser01gr/KinsenOPS-AdaptiveAI-Ops/actions/workflows/gates-on-pr.yml/badge.svg)](https://github.com/kostasuser01gr/KinsenOPS-AdaptiveAI-Ops/actions/workflows/gates-on-pr.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)

AI operations platform for car rental companies, built as a chat-first command center for fleet readiness, imports, shifts, washer workflows, reports, and adaptive business automation.

This repository is portfolio-ready: the README explains the product intent, the CI gates validate the implementation, and the public story focuses on the real business experience the system demonstrates.

## Quick Start

See [SETUP.md](./SETUP.md) for detailed setup instructions.

### Requirements
- Node.js 18+
- Supabase account
- Environment variables configured in `.env`

### Quick Setup
```bash
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

---

Overview

This project is a chat-first operations platform designed for the car rental industry. It was created with the idea of combining the familiarity and usability of a ChatGPT-style interface with the operational needs of a real business environment. Instead of building a traditional admin dashboard with disconnected modules, the platform is designed as a single intelligent workspace where communication, operations, planning, reporting, and AI-assisted execution happen in one place.

The goal is to turn the application into an operator-grade system that supports daily work across multiple roles inside a rental company. Staff can use the platform to monitor fleet readiness, manage vehicle cleaning workflows, organize shifts, process imported reservation files, communicate internally, analyze operational data, and interact with AI in a way that is directly connected to the business context. The product is also designed to be installable, modular, privacy-aware, and adaptable to different company structures and workflows.

⸻

Product Vision

The platform is built around the concept of a chat-first operating system.

That means the chat is not treated as a simple support widget or side feature. It is the main entry point to the platform and acts as:
	•	a command center for requesting actions
	•	a workspace for communication and decision-making
	•	a context layer connected to entities such as vehicles, shifts, washers, imports, incidents, and reports
	•	an AI interface that can help users not only retrieve information, but also shape the system itself

The core idea is that a user should be able to open the platform and interact with it naturally by typing requests such as:
	•	show which vehicles are stuck in QC
	•	create a shift proposal for next week
	•	summarize the latest import anomalies
	•	draft a message to the washer team
	•	generate an operational report
	•	add a shortcut button for a recurring task

This makes the application feel less like a static software product and more like an adaptive digital operations layer.

⸻

Main Objectives

The system was planned with the following high-level objectives:
	•	create a ChatGPT-like user experience tailored for operational use
	•	support staff workflows across fleet, washers, shifts, reporting, and imports
	•	provide a restricted washer experience with no login required
	•	provide a customer-facing damage-report experience accessed through QR code and reservation number
	•	ensure privacy, permissions, and centralized staff control
	•	make the application installable and usable across desktop, mobile, tablet, and kiosk-like scenarios
	•	allow the platform to become adaptive and customizable through AI
	•	keep the system modular so parts can be added, removed, or reconfigured without redesigning the whole product

⸻

Core Functional Areas

1. Chat-First Staff Workspace

The staff-facing application is centered around a ChatGPT-inspired interface with a left-hand conversation sidebar, a main chat area, and a broader operational shell connected to multiple modules.

The chat is used for:
	•	asking questions about operations
	•	triggering workflows
	•	creating summaries
	•	generating reports
	•	navigating between modules
	•	requesting interface and workflow changes
	•	receiving AI suggestions and ideas

The broader workspace includes operational modules such as:
	•	Fleet
	•	Washers
	•	Shifts
	•	Imports
	•	Ops Inbox
	•	Analytics / Reports
	•	Knowledge Base
	•	Integrations
	•	Settings / Governance

⸻

2. Fleet Operations

The fleet module is intended to manage the operational lifecycle of vehicles rather than pricing or booking logic.

Planned functionality includes:
	•	vehicle status tracking
	•	returned / cleaning / QC / ready / blocked / rented states
	•	SLA timers such as time-to-clean and time-to-ready
	•	priority logic based on operational urgency
	•	vehicle timeline with full event history
	•	incidents and damage records
	•	checklist completion before a vehicle is marked ready
	•	bulk actions for staff
	•	bottleneck and readiness analytics

This allows operations teams to understand what is happening across the fleet in real time and identify delays or problem points quickly.

⸻

3. Washer Experience

The washer workflow is treated as a separate but controlled experience.

This interface is intentionally limited and designed with the assumption that washers:
	•	should not need to sign up or log in
	•	should access only the tools relevant to their role
	•	should use an interface that is extremely fast and simple
	•	may work from tablets or shared devices

The washer experience includes only:
	•	a chat interface
	•	vehicle registration for cleaning

It is designed as a restricted experience with:
	•	no access to staff admin functions
	•	no access to broader modules
	•	no permission to change system configuration
	•	tokenized or device-scoped access
	•	kiosk-friendly behavior
	•	potential offline-friendly flow

This keeps the washer flow simple, secure, and role-appropriate.

⸻

4. Customer Damage Reporting App

A separate customer-facing application is part of the platform architecture. This app is designed for renters to document the condition of a vehicle on pickup.

The customer flow is designed as follows:
	•	the customer scans a QR code
	•	the customer enters a reservation number
	•	the customer gains access to a limited interface containing:
	•	a photo upload area for damage documentation
	•	a private chat channel linked to that reservation

The customer should only see those functions and nothing else.

Important goals of this customer app:
	•	no access to staff functionality
	•	installable experience that can stay available during the rental period
	•	private reservation-linked communication
	•	configurable upload destination for photos
	•	strong privacy and controlled staff oversight

The upload destination is designed conceptually as a configurable storage target, so although a Google Drive folder may be used by default, the system is not tied to one provider and can be adapted to another cloud or folder-based destination later.

⸻

Adaptive AI Workspace

One of the most important ideas in the project is that the AI should not exist only as a chatbot inside the application.

Instead, the AI is intended to act as a workspace adaptation layer.

Authenticated staff users can use natural language in the main chat to request changes to the system itself, such as:
	•	adding a button in a specific place
	•	creating a new shortcut
	•	generating a new workflow
	•	changing a dashboard view
	•	adding a report
	•	creating a prompt template
	•	defining a recurring macro action
	•	adjusting role-specific functionality

Example request:

Add a button in the Fleet module header that opens a filtered list of vehicles stuck in QC for more than 2 hours.

In this model, the system should:
	1.	interpret the request
	2.	propose a structured UI or workflow change
	3.	suggest related improvements
	4.	preview the change
	5.	allow the authorized staff user to apply it

This makes the platform adaptive, user-driven, and capable of evolving with operational needs instead of remaining fixed.

⸻

Performance and Usability Goals

A major design principle of the project is that the platform should feel extremely fast and operationally reliable.

The performance vision includes:
	•	instant-feel navigation
	•	persistent application shell
	•	lightweight transitions
	•	no blank screens
	•	progressive loading where needed
	•	optimized heavy views
	•	command palette responsiveness
	•	fast chat interactions
	•	strong perceived performance on mobile and tablet

The app is intended to feel premium without becoming visually heavy or slow.

The system should avoid:
	•	unnecessary animations
	•	overloaded tables
	•	interface clutter
	•	duplicated settings areas
	•	actions without feedback
	•	AI features without clear operational value

⸻

Installable Experience

The project is also envisioned as an installable application rather than only a browser-based internal tool.

Planned installable/PWA-style behavior includes:
	•	app installation from supported browsers
	•	standalone mode
	•	branded icon and splash experience
	•	cached recent state
	•	reopen to last workspace
	•	push notification support
	•	offline shell
	•	background sync where appropriate
	•	different device modes for desktop, tablet, mobile, and kiosk use cases

This is especially important for managers, shared workstations, washer devices, and customer-facing usage during the rental period.

⸻

Voice, Commands, and Shortcuts

The platform is also designed to support a richer command model beyond normal clicking and typing.

Planned interaction features include:
	•	slash commands
	•	quick action buttons
	•	saved prompts
	•	command palette
	•	voice input
	•	voice notes
	•	read-aloud summaries
	•	macro workflows

Examples of intended commands:
	•	/fleet
	•	/washers
	•	/imports
	•	/schedule
	•	/stats
	•	/incident
	•	/export

Voice functionality is especially relevant for fast-moving operational scenarios where typing may not be ideal.

⸻

Analytics and Insights

The system is meant to include a serious analytics layer rather than just basic counters.

Dashboards and statistics are planned for multiple roles, such as:
	•	Coordinator
	•	Supervisor
	•	Washer
	•	Fleet agent

Potential analytics include:
	•	readiness rate
	•	average turnaround time
	•	unresolved alerts
	•	queue health
	•	shift coverage
	•	worker productivity
	•	rework rate
	•	incident backlog
	•	bottleneck identification
	•	import quality metrics
	•	AI usage analytics
	•	system health indicators

The intention is not just to show charts, but to provide actionable insight with:
	•	drill-down views
	•	compare periods
	•	filters
	•	anomaly detection
	•	AI-generated explanations
	•	exportable reports

⸻

Roles and Governance

Even though the system is designed to be flexible and adaptive, governance is a critical part of the architecture.

The platform distinguishes between limited-scope users and authenticated staff users.

Examples of roles include:
	•	Coordinator
	•	Supervisor
	•	Employee
	•	Washer
	•	Fleet agent

Governance principles include:
	•	only authenticated staff can edit or configure the system
	•	washers and customers remain inside restricted experiences
	•	permissions should determine access to modules, actions, and fields
	•	system changes should be auditable
	•	privacy must be maintained throughout uploads, chats, and operational data

This is especially important because the platform includes AI-driven customization, customer uploads, role-based functionality, and operational data handling.

⸻

Technical Direction

This project was created in Visual Studio Code and planned as a modular web application architecture with a strong emphasis on scalability, maintainability, and future integration support.

Technical direction and architecture ideas include:
	•	modular application shell
	•	shared state across modules
	•	centralized chat and workflow orchestration
	•	installable web app behavior
	•	role-based access model
	•	configurable integrations
	•	pluggable modules
	•	adaptable storage connectors
	•	strong separation between staff, washer, and customer experiences
	•	support for future backend services, AI model routing, analytics, observability, and automation pipelines

The platform is intentionally designed so that major functional areas can be plugged in, unplugged, extended, or restricted depending on operational requirements.

⸻

Future Expansion Areas

The platform is designed with future extensibility in mind. Potential next steps include:
	•	deeper AI planning based on reservation imports
	•	annual and weekly staffing suggestions
	•	smarter anomaly detection in imports
	•	advanced reporting automation
	•	live integrations with external tools
	•	stronger observability and health monitoring
	•	approval workflows
	•	collaborative task management
	•	configurable knowledge base
	•	richer automation engine
	•	more advanced customer communication tools

⸻

Why This Project Matters

Most operational tools in this space are either too rigid, too fragmented, or too dependent on manual coordination across multiple apps. This project explores a different model: a single adaptive workspace where AI, operations, communication, and configuration live together.

Instead of asking teams to adapt to software that stays static, the project is built around the opposite idea: software that can adapt to the team.

That is the core idea behind the platform.
