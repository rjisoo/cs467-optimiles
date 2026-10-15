---
updatedAt: 2025-08-21T22:13:46.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# User Info

Get information about the authenticated user after you obtain an access token.

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
    "/userinfo": {
      "get": {
        "description": "",
        "operationId": "get_userinfo",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "examples": {
                  "New Example": {
                    "summary": "New Example",
                    "value": {
                      "name": "Ian Carroll",
                      "email": "ian@ian.sh",
                      "subscription_expires": 1762819200
                    }
                  }
                }
              }
            }
          }
        },
        "parameters": []
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```