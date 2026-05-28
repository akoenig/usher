import { Predicate, Schema } from "effect";
import { AllowedRequest as CredentialAllowedRequest } from "./Credential.js";

export const AllowedRequestSchema = CredentialAllowedRequest;
export type AllowedRequest = Schema.Schema.Type<typeof AllowedRequestSchema>;

const startsWithSlash: Predicate.Predicate<string> = (value) => value.startsWith("/");
const endsWithSlash: Predicate.Predicate<string> = (value) => value.endsWith("/");
const isValidPathPrefix = Predicate.and(startsWithSlash, endsWithSlash);

export function normalizeAllowedRequest(value: AllowedRequest): AllowedRequest {
  const originUrl = new URL(value.url.origin);

  if (originUrl.protocol !== "https:") {
    throw new RangeError("Allowed request origin must use https");
  }

  if (!isValidPathPrefix(value.url.pathPrefix)) {
    throw new RangeError("Allowed request pathPrefix must start and end with /");
  }

  return {
    url: {
      origin: originUrl.origin,
      pathPrefix: value.url.pathPrefix,
    },
  };
}

export function allowedRequestMatches(matcher: AllowedRequest, targetUrl: URL): boolean {
  return (
    matcher.url.origin === targetUrl.origin && targetUrl.pathname.startsWith(matcher.url.pathPrefix)
  );
}

export function allowedRequestsOverlap(left: AllowedRequest, right: AllowedRequest): boolean {
  return (
    left.url.origin === right.url.origin &&
    (left.url.pathPrefix.startsWith(right.url.pathPrefix) ||
      right.url.pathPrefix.startsWith(left.url.pathPrefix))
  );
}
