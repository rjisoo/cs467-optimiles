---
updatedAt: 2026-09-08T04:46:22.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Refresh Hotel

Ask for a hotel's rates to be retrieved again ahead of schedule.

Requests a fresh check of the hotel's rates. New data typically appears within minutes; poll [Get Availability](/reference/rooms-get-availability) with its `hotel_id` and watch `last_checked_at` advance. Each user may request one refresh every 24 hours, and the allowance is the same one the refresh button on the site uses: a refresh on either surface consumes it, and a second request inside the window answers `429 refresh_limit_exceeded`.

# OpenAPI definition

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "rooms-api",
    "version": "1.0",
    "description": "The rooms.aero API exposes hotel award availability across every supported loyalty program. Authenticate with your seats.aero API key, or a Login with Seats.aero access token as \"Bearer seats:ota:...\", in the Partner-Authorization header."
  },
  "servers": [
    {
      "url": "https://rooms.aero/partnerapi/"
    }
  ],
  "components": {
    "securitySchemes": {
      "sec0": {
        "type": "apiKey",
        "in": "header",
        "name": "Partner-Authorization",
        "description": "A seats.aero Pro API key (pro_...), or a Login with Seats.aero access token with a Bearer prefix (Bearer seats:ota:...)."
      }
    },
    "schemas": {
      "RefreshResponse": {
        "type": "object",
        "properties": {
          "hotel_id": {
            "type": "string",
            "description": "The hotel that was queued."
          },
          "status": {
            "type": "string",
            "description": "Always queued.",
            "example": "queued"
          },
          "message": {
            "type": "string",
            "description": "Human-readable confirmation."
          }
        }
      },
      "Error": {
        "type": "object",
        "description": "Every non-2xx response has this shape.",
        "properties": {
          "error": {
            "type": "string",
            "description": "Stable, machine-readable code. See Concepts for the full list.",
            "example": "invalid_parameter"
          },
          "message": {
            "type": "string",
            "description": "Human-readable explanation.",
            "example": "The nights parameter is invalid: must be between 1 and 5."
          }
        }
      }
    }
  },
  "security": [
    {
      "sec0": []
    }
  ],
  "paths": {
    "/hotels/{id}/refresh": {
      "post": {
        "summary": "Refresh Hotel",
        "description": "Requests a fresh check of a hotel's rates. New data typically appears within minutes; read it back with Get Availability afterwards. Each user may request one refresh every 24 hours, and the allowance is shared with the refresh button on the site.",
        "operationId": "rooms-refresh-hotel",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "description": "The hotel id.",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "202": {
            "description": "Queued",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RefreshResponse"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "hotel_id": "2PPrELk9WcfJaNREWEPXypvhXAD",
                      "status": "queued",
                      "message": "The hotel's rates will be refreshed shortly, typically within minutes."
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Missing, unknown or unsubscribed credentials: missing_partner_key, bad_partner_key, bad_partner_token, invalid_scope or user_subscription_expired",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Unknown API key": {
                    "value": {
                      "error": "bad_partner_key",
                      "message": "The API key in the Partner-Authorization header was not recognized. Pro users can find their key in the API tab at https://seats.aero/settings."
                    }
                  },
                  "Expired or revoked OAuth token": {
                    "value": {
                      "error": "bad_partner_token",
                      "message": "The OAuth access token in the Partner-Authorization header was not recognized, has expired, or was revoked. Obtain a new one with your refresh token, or ask the user to authorize your application again."
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Unknown hotel",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "hotel_not_found",
                      "message": "No hotel has that id."
                    }
                  }
                }
              }
            }
          },
          "429": {
            "description": "Refresh allowance or daily quota exhausted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "refresh_limit_exceeded",
                      "message": "You can request one hotel refresh every 24 hours, on the site or through the API."
                    }
                  }
                }
              }
            }
          }
        },
        "deprecated": false
      }
    }
  },
  "x-readme": {
    "headers": [],
    "explorer-enabled": true,
    "proxy-enabled": true
  },
  "x-readme-fauxas": true
}
```