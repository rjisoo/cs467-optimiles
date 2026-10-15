---
updatedAt: 2025-08-21T00:16:22.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Consent

Initiate the consent flow by redirecting users to this endpoint.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "OAuth2 API"
  },
  "servers": [
    {
      "url": "https://seats.aero/oauth2/"
    }
  ],
  "paths": {
    "/consent": {
      "get": {
        "description": "",
        "operationId": "get_consent",
        "responses": {
          "200": {
            "description": ""
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "response_type",
            "schema": {
              "type": "string"
            },
            "required": true,
            "description": "Must be code."
          },
          {
            "in": "query",
            "name": "client_id",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "in": "query",
            "name": "redirect_uri",
            "schema": {
              "type": "string"
            },
            "required": true,
            "description": "Must be the exact HTTPS-only redirect URI registered for your app."
          },
          {
            "in": "query",
            "name": "state",
            "schema": {
              "type": "string"
            },
            "required": true,
            "description": "State is required to ensure the user that initiates the OAuth2 flow is the same as the user that completes it."
          },
          {
            "in": "query",
            "name": "scope",
            "schema": {
              "type": "string"
            },
            "required": true,
            "description": "Must only be \"openid\"."
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```