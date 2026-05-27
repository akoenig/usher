import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

export const main = Effect.log("usher boot placeholder")

NodeRuntime.runMain(main)
