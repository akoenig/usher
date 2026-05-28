#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { runUsherCli } from "./Infrastructure/Cli/UsherCli.js";

NodeRuntime.runMain(runUsherCli(process.argv), { disableErrorReporting: true });
