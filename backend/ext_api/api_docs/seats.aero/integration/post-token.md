---
updatedAt: 2025-08-21T22:23:02.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Token

Obtain access and refresh tokens once a user completes the consent flow.

After the user completes the consent flow, use this endpoint with the `authorization_code` grant to obtain an access and refresh token. As they continue to use your application, use the refresh token to renew the access token with the `refresh_token` grant type.

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
    "/token": {
      "post": {
        "description": "",
        "operationId": "get_new-endpoint",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "examples": {
                  "New Example": {
                    "summary": "New Example",
                    "value": {
                      "access_token": "seats:ota:31cDaqd4jLYjeoz[...]",
                      "token_type": "Bearer",
                      "expires_in": 3599,
                      "refresh_token": "seats:otr:31cDtrDo16l2Sw[...]",
                      "scope": "openid"
                    }
                  }
                }
              }
            }
          }
        },
        "parameters": [],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "properties": {
                  "code": {
                    "type": "string",
                    "description": "Code obtained from the consent flow redirect. Required for authorization_code grant."
                  },
                  "client_id": {
                    "type": "string"
                  },
                  "client_secret": {
                    "type": "string"
                  },
                  "redirect_uri": {
                    "type": "string",
                    "description": "Must exactly match both your configured redirect URI and the redirect URI provided in the consent flow. Required for authorization_code grant."
                  },
                  "grant_type": {
                    "type": "string",
                    "description": "Only authorization_code or refresh_token is supported.",
                    "enum": [
                      "authorization_code",
                      "refresh_token"
                    ]
                  },
                  "state": {
                    "type": "string",
                    "description": "State used in the consent flow. Required for authorization_code grant."
                  },
                  "scope": {
                    "type": "string",
                    "description": "Scope used in the consent flow. Required for authorization_code grant. Must be \"openid\"."
                  },
                  "refresh_token": {
                    "type": "string",
                    "description": "Required for refresh_token grant."
                  }
                },
                "type": "object",
                "required": [
                  "client_id",
                  "client_secret",
                  "grant_type"
                ]
              }
            }
          }
        }
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```