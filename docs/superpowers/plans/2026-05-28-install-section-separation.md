# Install Section Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the README installation paths visually distinct.

**Architecture:** This is a documentation-only Markdown restructure. The existing install content remains under `## Install`, with agent-assisted and manual flows presented as parallel subsections.

**Tech Stack:** Markdown.

---

### Task 1: Separate Install Paths

**Files:**

- Modify: `README.md:31-51`

- [ ] **Step 1: Rename manual label to a subsection**

Change `Manual installation:` to `### Manual Install` and add a short sentence before the command:

```markdown
### Manual Install

Install Usher directly with pnpm:
```

- [ ] **Step 2: Preserve command and package manager note**

Keep the existing `pnpm add --global @akoenig/usher` command and the existing package-manager note after the command.

- [ ] **Step 3: Verify Markdown structure**

Read `README.md:27-55` and confirm the install section contains two sibling subsections: `### Agent-Assisted Install` and `### Manual Install`.
