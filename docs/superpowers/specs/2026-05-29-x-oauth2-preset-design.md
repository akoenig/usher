# X OAuth2 Preset Design

## Problem

Usher can create OAuth2 credentials through Google and Custom provider flows. X API OAuth2 works with the authorization URL, but confidential X clients return `401` during token exchange because X requires HTTP Basic client authentication at the token endpoint.

## Design

Add an X OAuth2 preset while preserving Google behavior.

The CLI provider choices become `Google`, `X`, and `Custom`. The Google preset remains unchanged and continues to send `client_id` and `client_secret` in the token request form body. The X preset uses `https://x.com/i/oauth2/authorize`, `https://api.x.com/2/oauth2/token`, allowed origin guidance for `https://api.x.com` with path prefix `/2/`, and X OAuth2 scope choices including `offline.access`.

OAuth2 credential configuration stores a token endpoint authentication method. Existing credentials and Google credentials use the current body-auth method by default. X credentials use `client_secret_basic`, which sends `Authorization: Basic base64(client_id:client_secret)` and omits client credentials from the token request form.

## Data Flow

Credential creation stores the provider's OAuth2 endpoints, scopes, and token auth method. OAuth login URL generation is unchanged. Callback handling and refresh-token usage pass the stored token auth method to the OAuth2 client, which chooses the token request shape.

## Compatibility

Stored OAuth2 credentials without a token auth method are treated as body-auth credentials. This keeps existing Google and Custom credentials working.

## Testing

Tests cover the X preset values and scope mapping, Google preset behavior, Basic token authentication for X token exchange, and unchanged body-auth token exchange for Google-style credentials.
