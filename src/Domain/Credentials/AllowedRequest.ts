import { Either, Predicate, Schema } from "effect";
import { InvalidTargetUrlError } from "../Errors/UsherErrors.js";
import { AllowedRequest as CredentialAllowedRequest } from "./Credential.js";

export const AllowedRequestSchema = CredentialAllowedRequest;
export type AllowedRequest = Schema.Schema.Type<typeof AllowedRequestSchema>;

const startsWithSlash: Predicate.Predicate<string> = (value) => value.startsWith("/");
const endsWithSlash: Predicate.Predicate<string> = (value) => value.endsWith("/");
const isValidPathPrefix = Predicate.and(startsWithSlash, endsWithSlash);

export function normalizeAllowedRequest(
  value: AllowedRequest,
): Either.Either<AllowedRequest, InvalidTargetUrlError> {
  const originUrl = parseUrl(value.url.origin);

  if (originUrl === undefined || originUrl.protocol !== "https:") {
    return Either.left(
      InvalidTargetUrlError.make({ message: "Allowed request origin must use https" }),
    );
  }

  if (!isValidPathPrefix(value.url.pathPrefix)) {
    return Either.left(
      InvalidTargetUrlError.make({
        message: "Allowed request pathPrefix must start and end with /",
      }),
    );
  }

  return Either.right({
    url: {
      origin: originUrl.origin,
      pathPrefix: value.url.pathPrefix,
    },
  });
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
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
